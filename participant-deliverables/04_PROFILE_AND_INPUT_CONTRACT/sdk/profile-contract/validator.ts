/**
 * Canonical Input validation.
 *
 * Hand-written (rather than ajv-only) so every failure carries the standard
 * payload: path + code + allowedValues + receivedValue. Core objects are
 * closed (unknown fields are errors); free extension lives under `extensions`.
 *
 * This module NEVER guesses a value and NEVER produces a profile — mapping raw
 * input to canonical values is the participant's own responsibility.
 */
import {
  ALLERGEN, APPOINTMENT_STATUS, AUTH_METHOD, BONE_TYPE, COLLECTION_CHANNEL, CUP_OPTION,
  DEPARTMENT, FIELD_SOURCE, INTENT_TASK, PREFERRED_INPUT, RETENTION_POLICY, SERVICE_CATEGORY,
  SERVICE_TYPE, SPICY_LEVEL, SUPPORT_MODE, VISIT_TYPE, isBcp47, values,
} from "./enums";
import { enumError, fail, missingError, ok, timestampError, typeError, unknownFieldError } from "./errors";
import { validateIso8601UtcTimestamp } from "./timestamp";
import type {
  AnySessionContext, CanonicalInput, CanonicalProfile, ContractError,
  ContractValidationResult, FieldMetadata,
} from "./types";
import { CORE_CONTRACT_VERSION, isSupportedInputContractVersion, SUPPORTED_INPUT_CONTRACT_VERSIONS } from "./version";

// ---------------------------------------------------------------------------
// Personal-data detection (never allowed in canonical input).
// ---------------------------------------------------------------------------

const PII_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "주민등록번호 형식", re: /\b\d{6}[-\s]?[1-4]\d{6}\b/ },
  { label: "전화번호", re: /\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/ },
  { label: "이메일", re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
  { label: "카드번호", re: /\b(?:\d[ -]?){15,16}\b/ },
  { label: "생년월일 전체값", re: /\b(19|20)\d{2}[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/ },
  { label: "상세 주소", re: /(로|길)\s?\d+[-\d]*\s?(번길|호|동|층)/ },
];

export function detectPersonalData(value: unknown, basePath = ""): ContractError[] {
  const json = JSON.stringify(value ?? {});
  return PII_PATTERNS.filter((p) => p.re.test(json)).map((p) => ({
    path: basePath || "/",
    code: "PERSONAL_DATA_NOT_ALLOWED",
    message: `개인정보로 보이는 값이 발견되었습니다: ${p.label}. 실제 개인정보는 제출할 수 없습니다.`,
  }));
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function checkClosed(obj: Record<string, unknown>, allowed: string[], base: string, errs: ContractError[]) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errs.push(unknownFieldError(`${base}/${k}`));
}

function checkEnum(v: unknown, allowed: string[], path: string, errs: ContractError[], required = false) {
  if (v === undefined) { if (required) errs.push(missingError(path)); return; }
  if (typeof v !== "string" || !allowed.includes(v)) errs.push(enumError(path, v, allowed));
}

function checkBool(v: unknown, path: string, errs: ContractError[], required = false) {
  if (v === undefined) { if (required) errs.push(missingError(path)); return; }
  if (typeof v !== "boolean") errs.push(typeError(path, v, "boolean"));
}

function checkEnumArray(v: unknown, allowed: string[], path: string, errs: ContractError[]) {
  if (v === undefined) return;
  if (!Array.isArray(v)) { errs.push(typeError(path, v, "array")); return; }
  v.forEach((item, i) => checkEnum(item, allowed, `${path}/${i}`, errs));
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const ACCESSIBILITY_KEYS = ["largeText", "simpleSteps", "visualGuidance", "hearingSupport", "mobilitySupport", "highContrast", "staffAssistancePreferred"];

export function validateProfile(profile: unknown, base = "/profile"): ContractError[] {
  const errs: ContractError[] = [];
  if (!isObj(profile)) return [typeError(base, profile, "object")];

  checkClosed(profile, ["profileId", "displayName", "dataClassification", "source", "accessibility", "interaction", "consent"], base, errs);

  if (typeof profile.profileId !== "string" || !profile.profileId) errs.push(missingError(`${base}/profileId`));
  if (profile.displayName !== undefined && typeof profile.displayName !== "string") errs.push(typeError(`${base}/displayName`, profile.displayName, "string"));
  if (profile.dataClassification !== "SYNTHETIC_PROFILE") errs.push(enumError(`${base}/dataClassification`, profile.dataClassification, ["SYNTHETIC_PROFILE"]));

  // source
  const src = profile.source;
  if (!isObj(src)) errs.push(missingError(`${base}/source`));
  else {
    checkClosed(src, ["collectionChannel", "providerId", "collectedAt"], `${base}/source`, errs);
    checkEnum(src.collectionChannel, values(COLLECTION_CHANNEL), `${base}/source/collectionChannel`, errs, true);
    if (typeof src.providerId !== "string" || !src.providerId) errs.push(missingError(`${base}/source/providerId`));
    checkTimestamp(src.collectedAt, `${base}/source/collectedAt`, errs, true);
  }

  // accessibility — all booleans required (explicit is safer than implicit)
  const acc = profile.accessibility;
  if (!isObj(acc)) errs.push(missingError(`${base}/accessibility`));
  else {
    checkClosed(acc, ACCESSIBILITY_KEYS, `${base}/accessibility`, errs);
    for (const k of ACCESSIBILITY_KEYS) checkBool(acc[k], `${base}/accessibility/${k}`, errs, true);
  }

  // interaction
  const inter = profile.interaction;
  if (!isObj(inter)) errs.push(missingError(`${base}/interaction`));
  else {
    checkClosed(inter, ["preferredInput", "language", "confirmationRequired"], `${base}/interaction`, errs);
    checkEnum(inter.preferredInput, values(PREFERRED_INPUT), `${base}/interaction/preferredInput`, errs, true);
    if (typeof inter.language !== "string") errs.push(missingError(`${base}/interaction/language`));
    else if (!isBcp47(inter.language)) {
      errs.push({ path: `${base}/interaction/language`, code: "TYPE_MISMATCH", message: "BCP 47 형식이어야 합니다 (예: ko-KR, en-US).", receivedValue: inter.language });
    }
    checkBool(inter.confirmationRequired, `${base}/interaction/confirmationRequired`, errs, true);
  }

  // consent
  const consent = profile.consent;
  if (!isObj(consent)) errs.push(missingError(`${base}/consent`));
  else {
    checkClosed(consent, ["personalization", "retentionPolicy"], `${base}/consent`, errs);
    checkBool(consent.personalization, `${base}/consent/personalization`, errs, true);
    checkEnum(consent.retentionPolicy, values(RETENTION_POLICY), `${base}/consent/retentionPolicy`, errs, true);
  }

  errs.push(...detectPersonalData(profile, base));
  return errs;
}

// ---------------------------------------------------------------------------
// Field metadata
// ---------------------------------------------------------------------------

export function validateFieldMetadata(fm: unknown, base = "/sessionContext/fieldMetadata"): ContractError[] {
  const errs: ContractError[] = [];
  if (fm === undefined) return errs;
  if (!isObj(fm)) return [typeError(base, fm, "object")];

  for (const [pointer, meta] of Object.entries(fm)) {
    const p = `${base}/${pointer.replace(/\//g, "~1")}`;
    if (!pointer.startsWith("/")) {
      errs.push({ path: p, code: "TYPE_MISMATCH", message: "키는 JSON Pointer 여야 합니다 (예: /preferences/spicyLevel).", receivedValue: pointer });
    }
    if (!isObj(meta)) { errs.push(typeError(p, meta, "object")); continue; }
    checkClosed(meta, ["source", "confidence", "confirmedByUser", "capturedAt", "normalizerId", "originalValueHash"], p, errs);
    checkEnum(meta.source, values(FIELD_SOURCE), `${p}/source`, errs, true);
    const c = meta.confidence;
    if (typeof c !== "number" || Number.isNaN(c)) errs.push(typeError(`${p}/confidence`, c, "number"));
    else if (c < 0 || c > 1) errs.push({ path: `${p}/confidence`, code: "TYPE_MISMATCH", message: "confidence 는 0 이상 1 이하여야 합니다.", receivedValue: c });
    checkBool(meta.confirmedByUser, `${p}/confirmedByUser`, errs, true);
    // capturedAt is optional, but if present it must be a real UTC instant —
    // a metadata timestamp is what tells a judge how stale a value is.
    checkTimestamp(meta.capturedAt, `${p}/capturedAt`, errs, false);
  }
  errs.push(...detectPersonalData(fm, base));
  return errs;
}

/**
 * Canonical Input timestamps, checked through the single shared policy so the
 * hand-written validator and the JSON Schema can never disagree.
 */
export function checkTimestamp(value: unknown, path: string, errs: ContractError[], required: boolean): void {
  if (value === undefined || value === null) {
    if (required) errs.push(missingError(path));
    return;
  }
  const r = validateIso8601UtcTimestamp(value);
  if (!r.valid) errs.push(timestampError(path, value, { message: r.message, expectedFormat: r.expectedFormat }));
}

/**
 * sessionContext.extensions — free-form, but not lawless.
 *
 * Extensions may never carry an official field name at the top level: a team
 * writing `extensions.facts` would look like it were setting facts, and the
 * platform would ignore it. Timestamps inside signals follow the same UTC rule
 * as everywhere else, because a stale signal must be recognisable as stale.
 */
export function validateContextExtensions(extensions: unknown, base: string): ContractError[] {
  const errs: ContractError[] = [];
  if (!isObj(extensions)) return [typeError(base, extensions, "object")];

  for (const [key, value] of Object.entries(extensions)) {
    const at = `${base}/${key}`;
    if (CONTEXT_SECTIONS.includes(key)) {
      errs.push({
        path: at, code: "UNKNOWN_FIELD",
        message: `"${key}" 는 공식 섹션 이름입니다. 확장은 팀 namespace 로 쓰세요 (예: TEAM_001.${key}).`,
        receivedValue: key,
      });
      continue;
    }
    if (!EXTENSION_NAMESPACE.test(key)) {
      errs.push({
        path: at, code: "UNKNOWN_FIELD",
        message: "확장 키는 팀 namespace 형식이어야 합니다 (예: TEAM_001.contextSignals).",
        receivedValue: key,
      });
      continue;
    }
    // Context signals carry provenance so a judge can see where a reason came from.
    if (key.endsWith(".contextSignals")) {
      if (!Array.isArray(value)) { errs.push(typeError(at, value, "array")); continue; }
      value.forEach((raw, i) => {
        const p = `${at}/${i}`;
        if (!isObj(raw)) { errs.push(typeError(p, raw, "object")); return; }
        const sig = raw as Record<string, unknown>;
        for (const req of ["type", "key", "value", "source", "observedAt"]) {
          if (sig[req] === undefined) errs.push(missingError(`${p}/${req}`));
        }
        checkTimestamp(sig.observedAt, `${p}/observedAt`, errs, true);
        if (sig.expiresAt !== undefined) checkTimestamp(sig.expiresAt, `${p}/expiresAt`, errs, false);
        if (sig.confidence !== undefined) {
          const c = sig.confidence;
          if (typeof c !== "number" || Number.isNaN(c) || c < 0 || c > 1) {
            errs.push({ path: `${p}/confidence`, code: "TYPE_MISMATCH", message: "confidence 는 0 이상 1 이하여야 합니다.", receivedValue: c });
          }
        }
      });
    }
  }
  errs.push(...detectPersonalData(extensions as Record<string, unknown>, base));
  return errs;
}

/** userDecision.confirmedAt — optional, but must be a real UTC instant. */
export function validateUserDecisionTimestamps(userDecision: unknown, base = "/userDecision"): ContractError[] {
  const errs: ContractError[] = [];
  if (!isObj(userDecision)) return errs;
  checkTimestamp((userDecision as Record<string, unknown>).confirmedAt, `${base}/confirmedAt`, errs, false);
  return errs;
}

// ---------------------------------------------------------------------------
// Session context — base shape + per-domain rules
// ---------------------------------------------------------------------------

const CONTEXT_SECTIONS = ["intent", "facts", "preferences", "hardConstraints", "capabilities", "fieldMetadata", "extensions"];

/**
 * Team namespace for extensions: TEAM_001.contextSignals
 *
 * Extensions are where a team puts things the Core contract does not model —
 * weather, crowding, their own signals. Namespacing keeps two teams from
 * colliding, and keeps extension data from being mistaken for official fields.
 */
const EXTENSION_NAMESPACE = /^[A-Z][A-Z0-9_]*\.[A-Za-z][A-Za-z0-9_]*$/;

/** Keys that MUST live in a specific section — catches facts/preferences confusion. */
const SECTION_RULES: Record<string, Record<string, "facts" | "preferences" | "hardConstraints" | "capabilities">> = {
  "chicken-store": {
    serviceType: "preferences", spicyLevel: "preferences", boneType: "preferences",
    cupOption: "preferences", quantity: "preferences",
    allergenIds: "hardConstraints", maxPriceKrw: "hardConstraints",
  },
  hospital: {
    visitType: "facts", appointmentStatus: "facts", departmentId: "facts", guardianPresent: "facts",
    supportModes: "preferences",
    medicalInferenceAllowed: "hardConstraints",
    canUseSelfCheckIn: "capabilities",
  },
  "public-office": {
    serviceCategory: "facts",
    stepByStep: "preferences", simpleLanguage: "preferences",
    legalEligibilityInferenceAllowed: "hardConstraints",
    availableAuthMethods: "capabilities",
  },
  sandbox: { size: "preferences" },
};

function checkSectionPlacement(env: string, ctx: Record<string, unknown>, errs: ContractError[]) {
  const rules = SECTION_RULES[env];
  if (!rules) return;
  for (const section of ["facts", "preferences", "hardConstraints", "capabilities"] as const) {
    const bag = ctx[section];
    if (!isObj(bag)) continue;
    for (const key of Object.keys(bag)) {
      const expected = rules[key];
      if (expected && expected !== section) {
        errs.push({
          path: `/sessionContext/${section}/${key}`,
          code: "DOMAIN_CONTEXT_MISMATCH",
          message: `${key} 는 ${section} 이 아니라 ${expected} 에 있어야 합니다.`,
          receivedValue: (bag as Record<string, unknown>)[key],
        });
      }
    }
  }
}

export function validateSessionContext(environmentId: string, ctx: unknown, base = "/sessionContext"): ContractError[] {
  const errs: ContractError[] = [];
  if (!isObj(ctx)) return [typeError(base, ctx, "object")];

  checkClosed(ctx, CONTEXT_SECTIONS, base, errs);
  if (ctx.extensions !== undefined) errs.push(...validateContextExtensions(ctx.extensions, `${base}/extensions`));
  for (const s of ["intent", "facts", "preferences", "hardConstraints", "capabilities"]) {
    if (ctx[s] === undefined) errs.push(missingError(`${base}/${s}`));
    else if (!isObj(ctx[s])) errs.push(typeError(`${base}/${s}`, ctx[s], "object"));
  }
  const intent = isObj(ctx.intent) ? ctx.intent : {};
  checkEnum(intent.task, values(INTENT_TASK), `${base}/intent/task`, errs, true);

  const facts = isObj(ctx.facts) ? ctx.facts : {};
  const prefs = isObj(ctx.preferences) ? ctx.preferences : {};
  const hard = isObj(ctx.hardConstraints) ? ctx.hardConstraints : {};
  const caps = isObj(ctx.capabilities) ? ctx.capabilities : {};

  checkSectionPlacement(environmentId, ctx, errs);

  switch (environmentId) {
    case "chicken-store": {
      checkClosed(prefs, ["serviceType", "spicyLevel", "boneType", "cupOption", "quantity"], `${base}/preferences`, errs);
      checkEnum(prefs.serviceType, values(SERVICE_TYPE), `${base}/preferences/serviceType`, errs);
      checkEnum(prefs.spicyLevel, values(SPICY_LEVEL), `${base}/preferences/spicyLevel`, errs);
      checkEnum(prefs.boneType, values(BONE_TYPE), `${base}/preferences/boneType`, errs);
      checkEnum(prefs.cupOption, values(CUP_OPTION), `${base}/preferences/cupOption`, errs);
      if (prefs.quantity !== undefined) {
        if (!Number.isInteger(prefs.quantity)) errs.push(typeError(`${base}/preferences/quantity`, prefs.quantity, "integer"));
        else if ((prefs.quantity as number) < 1) errs.push({ path: `${base}/preferences/quantity`, code: "TYPE_MISMATCH", message: "quantity 는 1 이상이어야 합니다.", receivedValue: prefs.quantity });
      }
      checkClosed(hard, ["allergenIds", "maxPriceKrw"], `${base}/hardConstraints`, errs);
      checkEnumArray(hard.allergenIds, values(ALLERGEN), `${base}/hardConstraints/allergenIds`, errs);
      if (hard.maxPriceKrw !== undefined && typeof hard.maxPriceKrw !== "number") errs.push(typeError(`${base}/hardConstraints/maxPriceKrw`, hard.maxPriceKrw, "number"));
      if (intent.task !== "ORDER_FOOD") errs.push(enumError(`${base}/intent/task`, intent.task, ["ORDER_FOOD"]));
      break;
    }
    case "hospital": {
      checkClosed(facts, ["visitType", "appointmentStatus", "departmentId", "guardianPresent"], `${base}/facts`, errs);
      checkEnum(facts.visitType, values(VISIT_TYPE), `${base}/facts/visitType`, errs);
      checkEnum(facts.appointmentStatus, values(APPOINTMENT_STATUS), `${base}/facts/appointmentStatus`, errs);
      checkEnum(facts.departmentId, values(DEPARTMENT), `${base}/facts/departmentId`, errs);
      checkBool(facts.guardianPresent, `${base}/facts/guardianPresent`, errs);
      checkClosed(prefs, ["supportModes"], `${base}/preferences`, errs);
      checkEnumArray(prefs.supportModes, values(SUPPORT_MODE), `${base}/preferences/supportModes`, errs);
      checkClosed(hard, ["medicalInferenceAllowed"], `${base}/hardConstraints`, errs);
      if (hard.medicalInferenceAllowed !== undefined && hard.medicalInferenceAllowed !== false) {
        errs.push({ path: `${base}/hardConstraints/medicalInferenceAllowed`, code: "ENUM_VALUE_INVALID", message: "의료 추론은 허용되지 않습니다 (false 고정).", allowedValues: ["false"], receivedValue: hard.medicalInferenceAllowed });
      }
      checkClosed(caps, ["canUseSelfCheckIn"], `${base}/capabilities`, errs);
      checkBool(caps.canUseSelfCheckIn, `${base}/capabilities/canUseSelfCheckIn`, errs);
      if (intent.task !== "CHECK_IN") errs.push(enumError(`${base}/intent/task`, intent.task, ["CHECK_IN"]));
      break;
    }
    case "public-office": {
      checkClosed(facts, ["serviceCategory"], `${base}/facts`, errs);
      checkEnum(facts.serviceCategory, values(SERVICE_CATEGORY), `${base}/facts/serviceCategory`, errs);
      checkClosed(prefs, ["stepByStep", "simpleLanguage"], `${base}/preferences`, errs);
      checkBool(prefs.stepByStep, `${base}/preferences/stepByStep`, errs);
      checkBool(prefs.simpleLanguage, `${base}/preferences/simpleLanguage`, errs);
      checkClosed(hard, ["legalEligibilityInferenceAllowed"], `${base}/hardConstraints`, errs);
      if (hard.legalEligibilityInferenceAllowed !== undefined && hard.legalEligibilityInferenceAllowed !== false) {
        errs.push({ path: `${base}/hardConstraints/legalEligibilityInferenceAllowed`, code: "ENUM_VALUE_INVALID", message: "법적 자격 추론은 허용되지 않습니다 (false 고정).", allowedValues: ["false"], receivedValue: hard.legalEligibilityInferenceAllowed });
      }
      checkClosed(caps, ["availableAuthMethods"], `${base}/capabilities`, errs);
      checkEnumArray(caps.availableAuthMethods, values(AUTH_METHOD), `${base}/capabilities/availableAuthMethods`, errs);
      if (intent.task !== "PUBLIC_SERVICE_GUIDANCE") errs.push(enumError(`${base}/intent/task`, intent.task, ["PUBLIC_SERVICE_GUIDANCE"]));
      break;
    }
    case "sandbox": {
      checkClosed(prefs, ["size"], `${base}/preferences`, errs);
      checkEnum(prefs.size, ["SMALL", "LARGE", "NO_PREFERENCE", "UNKNOWN"], `${base}/preferences/size`, errs);
      if (intent.task !== "PRACTICE") errs.push(enumError(`${base}/intent/task`, intent.task, ["PRACTICE"]));
      break;
    }
    default:
      // Unknown environment packs validate against the base shape only.
      break;
  }

  errs.push(...validateFieldMetadata(ctx.fieldMetadata, `${base}/fieldMetadata`));
  errs.push(...detectPersonalData(ctx, base));
  return errs;
}

// ---------------------------------------------------------------------------
// UNKNOWN / low-confidence policy
// ---------------------------------------------------------------------------

/** Hard-constraint fields whose UNKNOWN value must be resolved before executing. */
const HARD_CONSTRAINT_FIELDS: Record<string, string[]> = {
  "chicken-store": ["allergenIds"],
  hospital: [],
  "public-office": [],
  sandbox: [],
};

export interface ReconfirmationOptions {
  /** Below this, a value must be user-confirmed before a plan may execute. */
  minConfidence?: number;
  /** true once the participant reports the user re-confirmed. */
  requiresReconfirmationResolved?: boolean;
}

/**
 * Section 12: UNKNOWN in a hard constraint may not be silently inferred, and
 * low-confidence unconfirmed values must be re-confirmed before execution.
 */
export function validateUnknownPolicy(
  environmentId: string,
  ctx: unknown,
  opts: ReconfirmationOptions = {},
): ContractError[] {
  const errs: ContractError[] = [];
  if (!isObj(ctx)) return errs;
  const minConfidence = opts.minConfidence ?? 0.6;
  const hard = isObj(ctx.hardConstraints) ? ctx.hardConstraints : {};

  for (const field of HARD_CONSTRAINT_FIELDS[environmentId] ?? []) {
    const v = hard[field];
    const hasUnknown = v === "UNKNOWN" || (Array.isArray(v) && v.includes("UNKNOWN"));
    if (hasUnknown) {
      errs.push({
        path: `/sessionContext/hardConstraints/${field}`,
        code: "HARD_CONSTRAINT_UNKNOWN",
        message: `${field} 가 UNKNOWN 입니다. 임의로 추론하지 말고 재확인하거나 안전한 대체경로를 사용하세요.`,
        receivedValue: v,
      });
    }
  }

  const fm = isObj(ctx.fieldMetadata) ? ctx.fieldMetadata : {};
  for (const [pointer, metaRaw] of Object.entries(fm)) {
    const meta = metaRaw as FieldMetadata;
    if (!isObj(meta)) continue;
    const low = typeof meta.confidence === "number" && meta.confidence < minConfidence;
    if (low && meta.confirmedByUser !== true) {
      errs.push({
        path: `/sessionContext${pointer}`,
        code: "LOW_CONFIDENCE_RECONFIRMATION_REQUIRED",
        message: `confidence ${meta.confidence} 가 낮고 사용자 확인이 없습니다. 재확인 후 제출하세요 (또는 UNKNOWN 으로 정규화).`,
        receivedValue: meta.confidence,
      });
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// Extensions
// ---------------------------------------------------------------------------

export function validateExtensions(extensions: unknown, teamId: string, base = "/extensions"): ContractError[] {
  const errs: ContractError[] = [];
  if (extensions === undefined) return errs;
  if (!isObj(extensions)) return [typeError(base, extensions, "object")];

  for (const [ns, body] of Object.entries(extensions)) {
    if (ns !== teamId) {
      errs.push({
        path: `${base}/${ns}`, code: "EXTENSION_NAMESPACE_INVALID",
        message: `확장 namespace 는 teamId(${teamId}) 와 일치해야 합니다.`, receivedValue: ns,
      });
    }
    if (!isObj(body)) { errs.push(typeError(`${base}/${ns}`, body, "object")); continue; }
    if (typeof body.schemaVersion !== "string") errs.push(missingError(`${base}/${ns}/schemaVersion`));
    errs.push(...detectPersonalData(body, `${base}/${ns}`));
  }
  return errs;
}

// ---------------------------------------------------------------------------
// Top-level canonical input
// ---------------------------------------------------------------------------

export function validateCanonicalInput(input: unknown, opts: ReconfirmationOptions = {}): ContractValidationResult {
  if (!isObj(input)) return fail([typeError("/", input, "object")]);

  const version = typeof input.inputContractVersion === "string" ? input.inputContractVersion : "";
  if (!version) return fail([missingError("/inputContractVersion")]);
  if (!isSupportedInputContractVersion(version)) {
    return fail([{
      path: "/inputContractVersion", code: "UNSUPPORTED_INPUT_CONTRACT_VERSION",
      message: `지원하지 않는 inputContractVersion: ${version}`,
      allowedValues: [...SUPPORTED_INPUT_CONTRACT_VERSIONS], receivedValue: version,
    }], version || CORE_CONTRACT_VERSION);
  }

  const environmentId = typeof input.environmentId === "string" ? input.environmentId : "";
  const errors: ContractError[] = [];
  if (!environmentId) errors.push(missingError("/environmentId"));

  errors.push(...validateProfile(input.profile));
  if (input.sessionContext === undefined) errors.push(missingError("/sessionContext"));
  else errors.push(...validateSessionContext(environmentId, input.sessionContext));
  errors.push(...validateUnknownPolicy(environmentId, input.sessionContext, opts));

  const teamId = typeof (input as { teamId?: string }).teamId === "string" ? (input as { teamId: string }).teamId : "";
  if (teamId) errors.push(...validateExtensions(input.extensions, teamId));

  return errors.length === 0 ? ok(version) : fail(errors, version);
}

export type { CanonicalInput, CanonicalProfile, AnySessionContext };
