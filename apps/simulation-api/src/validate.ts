/**
 * Submission validation pipeline (spec §22).
 *
 *   1. contract version        (profile-contract)
 *   2. core profile schema     (profile-contract)
 *   3. domain SessionContext   (profile-contract, per environment)
 *   4. personal-data patterns  (profile-contract)
 *   5. required confirmations  (UNKNOWN / low-confidence policy)
 *   6. recommendation semantics(evaluator)
 *   7. execution plan          (evaluator)
 *   8. state machine dry-run   (evaluator)
 *   9. safety rules            (evaluator/safety-engine at execute time)
 *
 * JSON Schema (ajv) runs alongside step 2–3 for structural coverage.
 * The platform ONLY validates; it never repairs or fills in a submission.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { type ErrorObject } from "ajv";
import type { EnvironmentPack, ParticipantSubmission, ValidationError, ValidationResult } from "@kiobridge/contracts";
import { VALIDATION_CODES } from "@kiobridge/contracts";
import { dryRunPlan, evaluateTwoStageCompatibility, extractExecutionChoices, validateSubmissionSemantics } from "@kiobridge/evaluator";
import {
  createContractAjv,
  validateIso8601UtcTimestamp,
  UTC_TIMESTAMP_FORMAT,
  UTC_TIMESTAMP_FORMAT_NAME,
  validateCanonicalInput,
  validateUserDecisionTimestamps,
  validateProfile,
  validateSessionContext,
  validateUnknownPolicy,
  type ContractError,
} from "@kiobridge/profile-contract";
import { REPO_ROOT } from "./loader.js";

const SCHEMA_ROOT = path.join(REPO_ROOT, "schemas");
// Single factory: every channel gets the same formats, so "not-a-date"
// cannot pass one validator and fail another.
const ajv = createContractAjv();

/** Register every schema so $ref between files resolves. */
function loadAllSchemas() {
  for (const dir of ["core", "domains"]) {
    const full = path.join(SCHEMA_ROOT, dir);
    if (!existsSync(full)) continue;
    for (const f of readdirSync(full)) {
      if (!f.endsWith(".json")) continue;
      const schema = JSON.parse(readFileSync(path.join(full, f), "utf-8"));
      if (schema.$id && !ajv.getSchema(schema.$id)) ajv.addSchema(schema);
    }
  }
}
loadAllSchemas();

const submissionValidator = ajv.getSchema("https://kiobridge.local/schemas/core/participant-submission.schema.json")!;

export function readSchema(name: string): unknown | null {
  const safe = name.replace(/\.\./g, "");
  for (const dir of ["core", "domains", "vocabularies", "registry"]) {
    const p = path.join(SCHEMA_ROOT, dir, safe);
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"));
  }
  return null;
}

export function readVocabulary(environmentId: string): unknown | null {
  return readSchema(`${environmentId}.vocabulary.json`);
}

/**
 * Normalise AJV output into the official error shape.
 *
 * A raw AJV format failure reads `must match format "iso-8601-utc"`, which
 * tells a participant nothing about what to send. Timestamp failures are
 * re-labelled with the same code and wording the hand-written validator uses,
 * so every channel reports the identical problem.
 */
const ajvToError = (e: ErrorObject, data?: unknown): ValidationError => {
  const path = e.instancePath || "/";
  if (e.keyword === "format" && (e.params as { format?: string }).format === UTC_TIMESTAMP_FORMAT_NAME) {
    const received = readPointer(data, path);
    const detail = validateIso8601UtcTimestamp(received);
    return {
      path,
      code: "INVALID_UTC_TIMESTAMP",
      message: detail.message ?? "UTC ISO 8601 타임스탬프가 필요합니다.",
      expectedFormat: UTC_TIMESTAMP_FORMAT,
      receivedValue: received,
    } as ValidationError;
  }
  return {
    path,
    code: VALIDATION_CODES.SCHEMA_INVALID,
    message: `${e.instancePath || "(root)"} ${e.message ?? "스키마 위반"}`.trim(),
  } as ValidationError;
};

/** Resolve a JSON Pointer against the submitted document. */
function readPointer(root: unknown, pointer: string): unknown {
  if (!pointer || pointer === "/") return root;
  let cur: unknown = root;
  for (const raw of pointer.split("/").slice(1)) {
    const seg = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

const toValidationError = (e: ContractError): ValidationError => ({
  path: e.path, code: e.code, message: e.message,
  ...(e.allowedValues ? { allowedValues: e.allowedValues } : {}),
  ...(e.receivedValue !== undefined ? { receivedValue: e.receivedValue } : {}),
} as ValidationError);

export function validateSchemaOnly(submission: unknown): ValidationError[] {
  return submissionValidator(submission) ? [] : (submissionValidator.errors ?? []).map((e) => ajvToError(e, submission));
}

/** Contract-only validation (used by /api/v1/contracts/*). */
export function validateContractInput(environmentId: string, input: unknown) {
  return validateCanonicalInput(input);
}

export { validateProfile, validateSessionContext, validateUnknownPolicy };

/** Full validation: contract → schema → semantics → dry-run. */
export function validateSubmission(pack: EnvironmentPack, submission: unknown): ValidationResult {
  const sub = submission as ParticipantSubmission;
  const contractVersion = (sub?.inputContractVersion as string) ?? "1.0.0";

  // 1–5: Canonical Input Contract (version, profile, session context, PII, UNKNOWN).
  const canonical = validateCanonicalInput({
    inputContractVersion: sub?.inputContractVersion,
    environmentId: sub?.environmentId,
    teamId: sub?.teamId,
    profile: sub?.profile,
    sessionContext: sub?.sessionContext,
    extensions: sub?.extensions,
  });
  if (!canonical.valid) {
    return { valid: false, contractVersion, errors: canonical.errors.map(toValidationError) } as ValidationResult;
  }

  // Structural coverage via JSON Schema.
  const schemaErrors = validateSchemaOnly(submission);
  if (schemaErrors.length > 0) return { valid: false, contractVersion, errors: schemaErrors } as ValidationResult;

  // 6–8:  candidate exists / is available / hard constraints
  // 9:     domain compatibility — the recommendation must fit what the user told
  //        us, checked BEFORE the plan, because an incompatible recommendation
  //        makes the plan's correctness irrelevant.
  // 10–15: plan ↔ recommendation, options, state machine, verifier, safety.
  // Stage A (can this candidate serve the user?) and Stage B (did the plan
  // actually choose something compatible?) are evaluated separately.
  const extraction = extractExecutionChoices(sub.executionPlan, pack);
  const compat = evaluateTwoStageCompatibility(pack, sub);
  const errors = [
    // userDecision is outside the Canonical Input block, so its timestamp is
    // checked here rather than in validateCanonicalInput.
    ...validateUserDecisionTimestamps(sub.userDecision).map(toValidationError),
    ...validateSubmissionSemantics(pack, sub),
    ...compat.candidate.errors,
    ...extraction.errors,
    ...compat.executionChoice.errors,
    ...dryRunPlan(pack, sub),
  ];
  const dedupe = (list: typeof errors) => {
    const seen = new Set<string>();
    return list.filter((e) => {
      const k = `${e.actionIndex ?? ""}:${e.path}:${e.code}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const deduped = dedupe(errors);
  return {
    valid: deduped.length === 0,
    contractVersion,
    errors: deduped,
    // Warnings never change `valid` — they flag recommendation quality issues
    // that judges may weigh but the platform does not score.
    warnings: dedupe(compat.warnings),
    compatibility: compat.results,
    executionChoices: compat.choices,
  } as ValidationResult;
}
