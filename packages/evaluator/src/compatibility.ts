/**
 * Domain compatibility engine.
 *
 * A submission can be perfectly well-formed and still be wrong: recommending a
 * check-in path that requires an appointment to someone who told us they have
 * none, or a service that needs mobile auth to someone who only has an ID card.
 * Schema validation cannot see that — it needs the USER's context and the
 * CANDIDATE's declared capabilities side by side.
 *
 * Environments declare those rules in compatibility-rules.json; this one engine
 * executes them. Adding an environment never means adding another branch here.
 */
import {
  VALIDATION_CODES,
  type Candidate,
  type CompatibilityEvaluationScope,
  type CompatibilityRule,
  type CompatibilityRuleResult,
  type CompatibilityTargetSource,
  type EnvironmentPack,
  type ParticipantSubmission,
  type ValidationError,
} from "@kiobridge/contracts";
import { extractExecutionChoices, type ExecutionChoices } from "./execution-choice-extractor";

export interface CompatibilityOutcome {
  errors: ValidationError[];
  warnings: ValidationError[];
  results: CompatibilityRuleResult[];
}

/** Stage A and Stage B kept apart, plus the combined totals. */
export interface TwoStageCompatibility {
  candidate: CompatibilityOutcome;
  executionChoice: CompatibilityOutcome;
  choices: ExecutionChoices;
  errors: ValidationError[];
  warnings: ValidationError[];
  results: CompatibilityRuleResult[];
}

/** Normalised rule target — old `candidate` form and new `target` form. */
function targetOf(rule: CompatibilityRule): { source: CompatibilityTargetSource; key: string } {
  if (rule.target) return { source: rule.target.source, key: rule.target.key ?? rule.target.path ?? "" };
  const legacy = rule.candidate!;
  const map: Record<string, CompatibilityTargetSource> = {
    supportedOptions: "candidateSupportedOptions",
    requirements: "candidateRequirements",
    attributes: "candidateAttributes",
    field: "candidateField",
  };
  return { source: map[legacy.source], key: legacy.key };
}

export function scopeOf(rule: CompatibilityRule): CompatibilityEvaluationScope {
  if (rule.evaluationScope) return rule.evaluationScope;
  return targetOf(rule).source.startsWith("execution") ? "EXECUTION_CHOICE" : "CANDIDATE";
}

/** "The user did not commit to a value here" — never a wildcard. */
const DEFAULT_NEUTRAL = ["NO_PREFERENCE", "NOT_APPLICABLE", "UNSPECIFIED"];

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

function readPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Whatever the rule compares the user's value against. */
function readTargetValue(
  rule: CompatibilityRule,
  candidate: Candidate,
  choices: ExecutionChoices,
): unknown {
  const { source, key } = targetOf(rule);
  const c = candidate as unknown as Record<string, unknown>;
  switch (source) {
    case "candidateField": return c[key];
    case "candidateSupportedOptions": return (c.supportedOptions as Record<string, unknown> | undefined)?.[key];
    case "candidateRequirements": return (c.requirements as Record<string, unknown> | undefined)?.[key];
    case "candidateAttributes": return (c.attributes as Record<string, unknown> | undefined)?.[key];
    case "executionSelectedOption": return choices.selectedOptions[key];
    case "executionSelectedValue": return (choices as unknown as Record<string, unknown>)[key];
    default: return undefined;
  }
}

function sourceRoot(sub: ParticipantSubmission, section: CompatibilityRule["source"]["section"]): unknown {
  const ctx = (sub.sessionContext ?? {}) as unknown as Record<string, unknown>;
  return ctx[section];
}

/** JSON Pointer for the user-facing issue path. */
const sourcePointer = (rule: CompatibilityRule) =>
  `/sessionContext/${rule.source.section}/${rule.source.path.split(".").join("/")}`;

/**
 * fieldMetadata tells us how much to trust a value. A fact the user never
 * confirmed, or one the team's own pipeline scored as low confidence, is not a
 * basis for an irreversible action — treat it like UNKNOWN.
 */
function metadataSaysUnconfirmed(sub: ParticipantSubmission, rule: CompatibilityRule): { unconfirmed: boolean; reason?: string } {
  const ctx = (sub.sessionContext ?? {}) as unknown as Record<string, unknown>;
  const meta = ctx.fieldMetadata as Record<string, Record<string, unknown>> | undefined;
  if (!meta) return { unconfirmed: false };
  const pointer = `/${rule.source.section}/${rule.source.path.split(".").join("/")}`;
  const entry = meta[pointer];
  if (!entry) return { unconfirmed: false };
  if (entry.requiresReconfirmation === true) return { unconfirmed: true, reason: "requiresReconfirmation=true" };
  const threshold = rule.minConfidence;
  if (typeof threshold === "number" && typeof entry.confidence === "number" && entry.confidence < threshold) {
    if (entry.confirmedByUser !== true) {
      return { unconfirmed: true, reason: `confidence ${entry.confidence} < ${threshold} 이고 사용자 확인이 없습니다` };
    }
  }
  return { unconfirmed: false };
}

function compare(operator: CompatibilityRule["operator"], userValue: unknown, candidateValue: unknown): boolean {
  const cands = asArray(candidateValue);
  switch (operator) {
    case "IN":
      return cands.includes(userValue);
    case "EQUALS":
      return candidateValue === userValue;
    case "INTERSECTS": {
      const users = asArray(userValue);
      return users.some((u) => cands.includes(u));
    }
    case "CONTAINS": {
      const users = asArray(userValue);
      return users.every((u) => cands.includes(u));
    }
    case "DISJOINT": {
      const users = asArray(userValue);
      return !users.some((u) => cands.includes(u));
    }
    case "CONTAINS_SELECTED": {
      // The user's set of possible values must include what the plan picked.
      if (candidateValue === undefined || candidateValue === null) return true;
      const users = asArray(userValue);
      return asArray(candidateValue).every((c) => users.includes(c));
    }
    case "EQUALS_SELECTED": {
      // Nothing selected yet is a structural problem, reported elsewhere.
      if (candidateValue === undefined || candidateValue === null) return true;
      return String(candidateValue) === String(userValue);
    }
    case "MAX": {
      const limit = Number(userValue);
      const actual = Number(candidateValue);
      if (!Number.isFinite(limit) || !Number.isFinite(actual)) return true;
      return actual <= limit;
    }
    default:
      return true;
  }
}

/**
 * Runs one environment's declared rules against the recommended candidate.
 * Called AFTER the candidate is known to exist and be available, and BEFORE
 * the execution plan is checked — an incompatible recommendation makes the
 * plan's correctness beside the point.
 */
export function evaluateCompatibility(
  pack: EnvironmentPack,
  sub: ParticipantSubmission,
  options: { scope?: CompatibilityEvaluationScope; choices?: ExecutionChoices } = {},
): CompatibilityOutcome {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const results: CompatibilityRuleResult[] = [];

  const choices = options.choices
    ?? extractExecutionChoices(sub.executionPlan, pack).choices;
  const allRules = pack.compatibilityRules?.rules ?? [];
  const rules = options.scope ? allRules.filter((r) => scopeOf(r) === options.scope) : allRules;
  const recId = sub.recommendation?.recommendedCandidateId ?? null;
  const candidate = recId ? pack.candidates.find((c) => c.candidateId === recId) : undefined;
  // Nothing to compare against yet; earlier stages already reported that.
  if (!candidate) return { errors, warnings, results };

  for (const rule of rules) {
    const scope = scopeOf(rule);
    const { source: targetSource, key: targetKey } = targetOf(rule);
    const userValue = readPath(sourceRoot(sub, rule.source.section), rule.source.path);
    const candidateValues = readTargetValue(rule, candidate, choices);
    const actionIndexes = scope === "EXECUTION_CHOICE" ? (choices.actionIndexes[targetKey] ?? []) : undefined;
    const neutral = rule.neutralValues ?? DEFAULT_NEUTRAL;

    const record = (result: CompatibilityRuleResult["result"], message?: string) =>
      results.push({
        ruleId: rule.ruleId, result,
        sourceValue: userValue ?? null,
        candidateValues: candidateValues ?? null,
        targetValue: candidateValues ?? null,
        severity: rule.severity, message,
        evaluationScope: scope,
        sourcePath: `${rule.source.section}.${rule.source.path}`,
        targetSource, targetKey,
        operator: rule.operator,
        errorCode: rule.errorCode,
        actionIndexes,
      });

    const issue = (code: string, message: string): ValidationError => ({
      path: sourcePointer(rule),
      code,
      message,
      ruleId: rule.ruleId,
      receivedValue: userValue ?? null,
      allowedValues: asArray(candidateValues).map(String),
      ...(actionIndexes?.length ? { actionIndex: actionIndexes[0] } : {}),
    });

    // --- the user gave us nothing usable --------------------------------------
    const userValues = asArray(userValue);
    const isEmptyList = Array.isArray(userValue) && userValue.length === 0;
    const isAbsent = userValue === undefined || userValue === null || isEmptyList;
    // Absent means "no such constraint" only when the rule says so.
    const absentIsNone = isAbsent && (rule.absentMeans ?? "UNKNOWN") === "NONE";
    const isMissing = isAbsent && !absentIsNone;
    const isUnknown = userValues.some((v) => v === "UNKNOWN");
    const isNeutral = !isMissing && userValues.length > 0 && userValues.every((v) => neutral.includes(String(v)));
    const meta = metadataSaysUnconfirmed(sub, rule);

    if (absentIsNone && !isUnknown) {
      // "No such constraint" is an answer: there is nothing to violate.
      record("SKIPPED", "해당 제약이 선언되지 않았습니다 (제약 없음).");
      continue;
    }

    if (isNeutral) {
      // An explicit "no preference" is an answer: nothing to violate.
      record("SKIPPED", "사용자가 선호를 지정하지 않았습니다.");
      continue;
    }

    if (isMissing || isUnknown || meta.unconfirmed) {
      const why = isMissing ? "값이 제출되지 않았습니다" : isUnknown ? "값이 UNKNOWN 입니다" : (meta.reason ?? "확인되지 않았습니다");
      switch (rule.unknownPolicy) {
        case "IGNORE":
          record("SKIPPED", why);
          continue;
        case "ALLOW":
          record("PASS", `${why} — 규칙상 허용`);
          continue;
        case "BLOCK":
          errors.push(issue(rule.errorCode, `${rule.description ?? rule.ruleId}: ${why}. 임의로 추론하지 말고 사용자에게 다시 확인하세요.`));
          record("FAIL", why);
          continue;
        case "RECONFIRM":
        default: {
          // A wildcard candidate (staff assistance, general guidance) is the one
          // safe route when we genuinely do not know.
          const wildcard = rule.wildcardCandidateValues ?? [];
          const candidateIsSafeRoute = wildcard.length > 0 && asArray(candidateValues).some((v) => wildcard.includes(String(v)));
          if (candidateIsSafeRoute) {
            record("PASS", `${why} — 재확인이 필요 없는 안전 경로 후보`);
            continue;
          }
          errors.push({
            ...issue(VALIDATION_CODES.LOW_CONFIDENCE_RECONFIRMATION_REQUIRED,
              `${rule.description ?? rule.ruleId}: ${why}. 추론하지 말고 재확인하거나 직원 도움 경로를 사용하세요.`),
          });
          record("RECONFIRM", why);
          continue;
        }
      }
    }

    // --- nothing on the target side to compare --------------------------------
    if (candidateValues === undefined || candidateValues === null) {
      record("SKIPPED", scope === "EXECUTION_CHOICE"
        ? "실행계획이 이 항목을 선택하지 않았습니다 (필수 여부는 구조 검사에서 판정)."
        : "후보가 이 항목을 선언하지 않았습니다.");
      continue;
    }

    // --- wildcard candidate satisfies any user value --------------------------
    const wildcard = rule.wildcardCandidateValues ?? [];
    if (wildcard.length > 0 && asArray(candidateValues).some((v) => wildcard.includes(String(v)))) {
      record("PASS", "모든 사용자에게 적용 가능한 후보");
      continue;
    }

    if (compare(rule.operator, userValue, candidateValues)) {
      record("PASS");
      continue;
    }

    const isExec = scope === "EXECUTION_CHOICE";
    const detail = isExec
      ? `사용자 ${JSON.stringify(userValue)} · 실행 선택 ${JSON.stringify(candidateValues)}`
      : `사용자 ${JSON.stringify(userValue)} · 후보 ${JSON.stringify(candidateValues)}`;
    const message = isExec
      ? `${rule.description ?? rule.ruleId}: 실행계획이 선택한 값이 사용자 맥락과 맞지 않습니다 (${detail}).`
      : `${rule.description ?? rule.ruleId}: 추천 후보 ${candidate.candidateId} 가 사용자 맥락과 호환되지 않습니다 (${detail}).`;
    const at = isExec
      ? (actionIndexes?.length ? `/executionPlan/actions/${actionIndexes[0]}/target/id` : "/executionPlan/actions")
      : "/recommendation/recommendedCandidateId";
    if (rule.severity === "BLOCK") {
      errors.push({ ...issue(rule.errorCode, message), path: at });
      record("FAIL", message);
    } else {
      warnings.push({ ...issue(rule.errorCode, message), path: at });
      record("WARN", message);
    }
  }

  return { errors, warnings, results };
}


/**
 * Runs both stages and keeps their results apart, because they answer different
 * questions and a team needs to know which one failed.
 */
export function evaluateTwoStageCompatibility(pack: EnvironmentPack, sub: ParticipantSubmission): TwoStageCompatibility {
  const { choices } = extractExecutionChoices(sub.executionPlan, pack);
  const candidate = evaluateCompatibility(pack, sub, { scope: "CANDIDATE", choices });
  const executionChoice = evaluateCompatibility(pack, sub, { scope: "EXECUTION_CHOICE", choices });
  return {
    candidate, executionChoice, choices,
    errors: [...candidate.errors, ...executionChoice.errors],
    warnings: [...candidate.warnings, ...executionChoice.warnings],
    results: [...candidate.results, ...executionChoice.results],
  };
}
