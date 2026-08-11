/**
 * @kiobridge/safety-engine — common safety rules, DRIVER-AGNOSTIC.
 *
 * Every rule returns PASS | BLOCK | STOP. If any rule yields BLOCK or STOP, no
 * subsequent action may execute. Participants cannot bypass these rules; they
 * are enforced by the platform, not by the driver.
 */
import {
  FORBIDDEN_ACTIONS,
  PAYMENT_ACTION_MARKERS,
  type Candidate,
  type EnvironmentPack,
  type ExecutionPlan,
  type AnySessionContext,
  type CanonicalProfile,
  type Recommendation,
  type SafetyCheckResult,
  type SafetyOutcome,
} from "@kiobridge/contracts";
import { isFinalReviewState, isForbiddenAction, isKnownState } from "@kiobridge/state-engine";

export function isPaymentAction(action: string): boolean {
  const a = action.toLowerCase();
  if (FORBIDDEN_ACTIONS.includes(a) && /pay|payment|checkout|card|cash/.test(a)) return true;
  return PAYMENT_ACTION_MARKERS.some((m) => a.includes(m));
}

/** Read-only verifier actions never change state or cause real processing. */
export const isVerifierAction = (pack: EnvironmentPack, action: string) => action === pack.manifest.requiredVerifierAction;

export interface SafetyContext {
  pack: EnvironmentPack;
  plan: ExecutionPlan;
  userApproved: boolean;
  recommendation: Recommendation | null;
  /** Long-lived user info (accessibility/interaction). NOT used for constraints. */
  profile: CanonicalProfile;
  /** THIS session's info. Hard constraints are read from here. */
  sessionContext: AnySessionContext;
  candidatesById: Record<string, Candidate>;
}

export interface SafetyReport {
  checks: SafetyCheckResult[];
  outcome: SafetyOutcome;
  plannedPaymentActionCount: number;
  /** Index of the first action that must not execute, or -1. */
  blockedAtActionIndex: number;
}

function worse(a: SafetyOutcome, b: SafetyOutcome): SafetyOutcome {
  const rank: Record<SafetyOutcome, number> = { PASS: 0, BLOCK: 1, STOP: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function evaluatePlanSafety(ctx: SafetyContext): SafetyReport {
  const { pack, plan, userApproved, recommendation, sessionContext, candidatesById } = ctx;
  const checks: SafetyCheckResult[] = [];
  let plannedPaymentActionCount = 0;
  let blockedAtActionIndex = -1;

  const flag = (idx: number) => {
    if (blockedAtActionIndex === -1 || idx < blockedAtActionIndex) blockedAtActionIndex = idx < 0 ? 0 : idx;
  };

  if (plan.actualDeviceCommandSent !== false) {
    checks.push(rule("BLOCK_ACTUAL_DEVICE_COMMAND", "BLOCK", "actualDeviceCommandSent 가 false 가 아닙니다."));
    flag(0);
  } else {
    checks.push(rule("BLOCK_ACTUAL_DEVICE_COMMAND", "PASS", "실제 기기 명령 없음 (actualDeviceCommandSent=false)."));
  }

  if (!userApproved && plan.actions.length > 0) {
    checks.push(rule("REQUIRE_USER_CONFIRMATION", "STOP", "사용자 승인 전에 실행계획 actions 가 존재합니다."));
    flag(0);
  } else {
    checks.push(rule("REQUIRE_USER_CONFIRMATION", "PASS", userApproved ? "사용자 승인 완료." : "미승인 상태이며 actions 는 비어 있음."));
  }

  const rec = recommendation?.recommendedCandidateId ? candidatesById[recommendation.recommendedCandidateId] : undefined;
  if (rec && rec.available === false) {
    checks.push(rule("UNAVAILABLE_CANDIDATE_BLOCK", "BLOCK", `이용 불가 후보 추천: ${rec.candidateId}`));
    flag(0);
  } else {
    checks.push(rule("UNAVAILABLE_CANDIDATE_BLOCK", "PASS", "추천 후보 이용 가능."));
  }

  const allergenConflict = hasAllergenConflict(sessionContext, rec);
  if (allergenConflict) {
    checks.push(rule("ALLERGEN_CONFLICT_BLOCK", "BLOCK", `알레르기 충돌 후보 추천: ${rec?.candidateId} (${allergenConflict})`));
    flag(0);
  } else {
    checks.push(rule("ALLERGEN_CONFLICT_BLOCK", "PASS", "알레르기 충돌 없음."));
  }

  const overPrice = exceedsMaxPrice(sessionContext, rec);
  if (overPrice !== null) {
    checks.push(rule("UNAVAILABLE_CANDIDATE_BLOCK", "BLOCK", `가격 상한(${overPrice}원)을 초과하는 후보 추천: ${rec?.candidateId}`));
    flag(0);
  }

  let paymentSeen = false, unknownStateSeen = false, boundaryViolation = false, readOnlyViolation = false;

  for (const action of plan.actions) {
    if (isPaymentAction(action.action) || isForbiddenAction(pack, action.action)) {
      if (isPaymentAction(action.action)) { plannedPaymentActionCount += 1; paymentSeen = true; }
      checks.push(at("BLOCK_PAYMENT_ACTION", "BLOCK", `금지/결제 Action 시도: ${action.action}`, action.actionIndex));
      flag(action.actionIndex);
    }
    if (!isKnownState(pack, action.expectedBeforeState)) {
      unknownStateSeen = true;
      checks.push(at("UNKNOWN_STATE_STOP", "STOP", `알 수 없는 상태 참조: ${action.expectedBeforeState}`, action.actionIndex));
      flag(action.actionIndex);
    }
    if (isVerifierAction(pack, action.action) && action.expectedBeforeState !== action.expectedAfterState) {
      readOnlyViolation = true;
      checks.push(at("VERIFY_CART_READ_ONLY", "STOP", `읽기전용 Action(${action.action}) 이 상태를 변경합니다.`, action.actionIndex));
      flag(action.actionIndex);
    }
    if (isFinalReviewState(pack, action.expectedBeforeState) && !isVerifierAction(pack, action.action)) {
      boundaryViolation = true;
      checks.push(at("FINAL_BOUNDARY_STOP", "STOP", `최종 확인 화면 이후 비읽기 Action 시도: ${action.action}`, action.actionIndex));
      flag(action.actionIndex);
    }
  }

  if (!paymentSeen) checks.push(rule("BLOCK_PAYMENT_ACTION", "PASS", "결제/금지 Action 없음."));
  if (!unknownStateSeen) checks.push(rule("UNKNOWN_STATE_STOP", "PASS", "모든 참조 상태가 정의됨."));
  if (!readOnlyViolation) checks.push(rule("VERIFY_CART_READ_ONLY", "PASS", "읽기전용 Action 이 상태를 바꾸지 않음."));
  if (!boundaryViolation) checks.push(rule("FINAL_BOUNDARY_STOP", "PASS", "최종 확인 경계 준수."));

  const outcome = checks.reduce<SafetyOutcome>((acc, c) => worse(acc, c.outcome), "PASS");
  return { checks, outcome, plannedPaymentActionCount, blockedAtActionIndex };
}

/**
 * Allergen conflicts are a HARD CONSTRAINT and live in
 * `sessionContext.hardConstraints.allergenIds` (canonical UPPER_SNAKE ids).
 * Candidate allergens are declared in `candidate.attributes.allergenIds`.
 */
export function hasAllergenConflict(sessionContext: AnySessionContext | undefined, candidate?: Candidate): string | null {
  if (!candidate || !sessionContext) return null;
  const hard = (sessionContext.hardConstraints ?? {}) as { allergenIds?: string[] };
  const userAllergens = (hard.allergenIds ?? []).map((a) => String(a).toUpperCase());
  const candidateAllergens = ((candidate.attributes?.allergenIds as string[] | undefined) ?? []).map((a) => String(a).toUpperCase());
  return candidateAllergens.find((a) => userAllergens.includes(a)) ?? null;
}

/** Price ceiling is a hard constraint for the chicken-store domain. */
export function exceedsMaxPrice(sessionContext: AnySessionContext | undefined, candidate?: Candidate): number | null {
  if (!candidate || !sessionContext) return null;
  const hard = (sessionContext.hardConstraints ?? {}) as { maxPriceKrw?: number };
  if (typeof hard.maxPriceKrw !== "number" || typeof candidate.price !== "number") return null;
  return candidate.price > hard.maxPriceKrw ? hard.maxPriceKrw : null;
}

function rule(ruleId: SafetyCheckResult["ruleId"], outcome: SafetyOutcome, message: string): SafetyCheckResult {
  return { ruleId, outcome, message };
}
function at(ruleId: SafetyCheckResult["ruleId"], outcome: SafetyOutcome, message: string, actionIndex: number): SafetyCheckResult {
  return { ruleId, outcome, message, actionIndex };
}
