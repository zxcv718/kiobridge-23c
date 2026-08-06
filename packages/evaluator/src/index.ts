/**
 * @kiobridge/evaluator — the platform's replay + evidence authority.
 *
 * Execution is DRIVER-BASED: the engine validates meaning & transitions, then
 * hands each semantic action to a KioskDriver. Today that is the Simulation
 * Driver (virtual kiosk); swapping in a UPRLite driver requires no change to
 * manifests, states, candidates, options, safety rules or participant plans.
 */
import {
  FIXED_PRINCIPLES,
  VALIDATION_CODES,
  type Candidate,
  type EnvironmentPack,
  type Evidence,
  type ExecutedAction,
  type ExecutionEvent,
  type ExecutionPlan,
  type ParticipantSubmission,
  type PlanAction,
  type Recommendation,
  type SafetyCheckResult,
  type SafetyErrorCode,
  type SimulationUiState,
  type StopType,
  type AnySessionContext,
  type CanonicalProfile,
  type ValidationError,
} from "@kiobridge/contracts";
import { applyAction, getTransition, isForbiddenAction, isTargetKindAllowed } from "@kiobridge/state-engine";
import { evaluatePlanSafety, hasAllergenConflict, isPaymentAction, isVerifierAction } from "@kiobridge/safety-engine";
import { groupIdForKind, resolveSemanticTarget, type DriverContext, type KioskDriver } from "@kiobridge/kiosk-driver-contract";
import { SimulationDriver, locateCandidate } from "@kiobridge/simulation-driver";
import { evaluateTwoStageCompatibility, scopeOf } from "./compatibility";
import { extractExecutionChoices } from "./execution-choice-extractor";

// ---------------------------------------------------------------------------
// Replay (driver-based)
// ---------------------------------------------------------------------------

export interface RunInput {
  pack: EnvironmentPack;
  profile: CanonicalProfile;
  sessionContext: AnySessionContext;
  recommendation: Recommendation | null;
  plan: ExecutionPlan;
  userApproved: boolean;
  candidatesById: Record<string, Candidate>;
  driver?: KioskDriver;
}

export interface RunResult {
  executedActions: ExecutedAction[];
  events: ExecutionEvent[];
  stateHistory: string[];
  safetyChecks: SafetyCheckResult[];
  lastBusinessState: string;
  terminalState: string;
  stopType: StopType;
  stopReason: string;
  boundaryReached: boolean;
  requiredVerifierExecuted: boolean;
  plannedPaymentActionCount: number;
  executedPaymentActionCount: number;
  blockedPaymentActionCount: number;
  reviewSnapshot: Record<string, unknown>;
  finalUiState: SimulationUiState;
  stopped: boolean;
  driverId: string;
}

export async function runPlan(input: RunInput): Promise<RunResult> {
  const { pack, profile, sessionContext, recommendation, plan, userApproved, candidatesById } = input;
  const driver = input.driver ?? new SimulationDriver();
  const { reviewBoundaryState, requiredVerifierAction, terminalState } = pack.manifest;

  const context: DriverContext = { pack, profile, sessionContext, recommendedCandidateId: recommendation?.recommendedCandidateId ?? null };
  let driverState = await driver.initialize(context);

  const safety = evaluatePlanSafety({ pack, plan, userApproved, recommendation, profile, sessionContext, candidatesById });
  const safetyChecks: SafetyCheckResult[] = [...safety.checks];
  const executedActions: ExecutedAction[] = [];
  const events: ExecutionEvent[] = [];
  const stateHistory: string[] = [pack.manifest.initialState];
  let currentState = pack.manifest.initialState;
  let stopped = false;
  let stopReason = "";
  let reviewSnapshot: Record<string, unknown> = {};
  const blockIdx = safety.blockedAtActionIndex;

  for (const action of plan.actions) {
    if (blockIdx !== -1 && action.actionIndex >= blockIdx) {
      stopped = true;
      stopReason = safety.checks.find((c) => c.outcome !== "PASS")?.ruleId ?? "SAFETY_BLOCK";
      break;
    }

    // 1. Engine validates meaning + transition (driver-agnostic).
    const res = applyAction(pack, {
      currentState, action: action.action, target: action.target,
      expectedBeforeState: action.expectedBeforeState, expectedAfterState: action.expectedAfterState,
    });
    if (!res.ok) {
      executedActions.push({ ...action, resultState: currentState, ok: false });
      stopped = true;
      stopReason = res.errorCode ?? "STATE_ERROR";
      safetyChecks.push({ ruleId: "STATE_MISMATCH_STOP", outcome: "STOP", message: `상태 머신 오류(${res.errorCode}): ${res.reason ?? ""}`, actionIndex: action.actionIndex });
      break;
    }

    // 2. Driver performs it on its surface and reports events.
    const isVerifier = isVerifierAction(pack, action.action);
    const exec = await driver.execute(action, driverState, context);
    events.push(...exec.events);
    if (!exec.ok) {
      executedActions.push({ ...action, resultState: currentState, ok: false });
      stopped = true;
      stopReason = "DRIVER_TARGET_UNRESOLVED";
      safetyChecks.push({ ruleId: "STATE_MISMATCH_STOP", outcome: "STOP", message: `드라이버 오류: ${exec.reason ?? ""}`, actionIndex: action.actionIndex });
      break;
    }
    driverState = exec.state;

    if (isVerifier) {
      const verification = await driver.verify(action, driverState, context);
      events.push(...verification.events);
      reviewSnapshot = verification.review;
    }

    executedActions.push({ ...action, resultState: res.nextState, ok: true, resolvedLabel: exec.resolvedLabel });
    if (res.nextState !== currentState) {
      currentState = res.nextState;
      stateHistory.push(currentState);
    }
  }

  const lastBusinessState = currentState;
  const boundaryReached = stateHistory.includes(reviewBoundaryState);
  const requiredVerifierExecuted = executedActions.some((a) => a.ok && a.action === requiredVerifierAction);
  // A review that cannot fill a required field is not a completed review. The
  // run must not be reported as a clean boundary stop on top of missing data.
  const unresolvedRequiredReviewFields = (driverState.uiState.resolvedReview ?? [])
    .filter((f) => f.required && !f.resolved)
    .map((f) => f.fieldId);
  const plannedPaymentActionCount = plan.actions.filter((a) => isPaymentAction(a.action)).length;
  const executedPaymentActionCount = executedActions.filter((a) => a.ok && isPaymentAction(a.action)).length;
  const blockedPaymentActionCount = plannedPaymentActionCount - executedPaymentActionCount;

  let stopType: StopType;
  if (stopped) stopType = "SAFETY_STOP";
  else if (plan.actions.length === 0) { stopType = "SAFETY_STOP"; stopReason = userApproved ? VALIDATION_CODES.EMPTY_PLAN : VALIDATION_CODES.USER_NOT_APPROVED; }
  else if (!boundaryReached) { stopType = "SAFETY_STOP"; stopReason = VALIDATION_CODES.BOUNDARY_NOT_REACHED; }
  else if (!requiredVerifierExecuted) { stopType = "SAFETY_STOP"; stopReason = VALIDATION_CODES.MISSING_VERIFIER; }
  else if (unresolvedRequiredReviewFields.length > 0) {
    stopType = "SAFETY_STOP";
    stopReason = `${VALIDATION_CODES.REVIEW_FIELD_UNRESOLVED}:${unresolvedRequiredReviewFields.join(",")}`;
  }
  else if (plannedPaymentActionCount > 0) { stopType = "SAFETY_STOP"; stopReason = "PAYMENT_ACTION_PLANNED"; }
  else { stopType = "NORMAL_BOUNDARY_STOP"; stopReason = `${requiredVerifierAction.toUpperCase()}_VERIFIED`; }

  const stopEvents = await driver.stop(stopReason, driverState);
  events.push(...stopEvents.events);

  safetyChecks.push({
    ruleId: "SUMMARY",
    outcome: stopType === "NORMAL_BOUNDARY_STOP" ? "PASS" : "STOP",
    message: stopType === "NORMAL_BOUNDARY_STOP" ? "정상 경계 도달 + verifier 실행" : `중단(${stopType}): ${stopReason}`,
  });

  return {
    executedActions, events, stateHistory, safetyChecks, lastBusinessState, terminalState,
    stopType, stopReason, boundaryReached, requiredVerifierExecuted,
    plannedPaymentActionCount, executedPaymentActionCount, blockedPaymentActionCount,
    reviewSnapshot, finalUiState: driverState.uiState, stopped, driverId: driver.driverId,
  };
}

// ---------------------------------------------------------------------------
// Evidence (server-generated)
// ---------------------------------------------------------------------------

export interface BuildEvidenceInput {
  pack: EnvironmentPack;
  submission: ParticipantSubmission;
  run: RunResult;
  sessionId: string;
  submissionHash: string;
  submissionValid: boolean;
  driver: KioskDriver;
  validationErrors?: ValidationError[];
  validationWarnings?: ValidationError[];
  runId?: string;
}

/** Rule-by-rule outcome, so a team can see WHY a recommendation was rejected. */
function buildDomainCompatibility(pack: EnvironmentPack, submission: ParticipantSubmission): Evidence["domainCompatibility"] {
  const two = evaluateTwoStageCompatibility(pack, submission);
  const rules = pack.compatibilityRules?.rules ?? [];
  const stage = (o: typeof two.candidate, declared: number) => ({
    evaluated: declared > 0,
    rules: o.results,
    blockingErrorCount: o.errors.length,
    warningCount: o.warnings.length,
  });
  const candidateRules = rules.filter((r) => scopeOf(r) === "CANDIDATE").length;
  const execRules = rules.length - candidateRules;
  return {
    candidate: stage(two.candidate, candidateRules),
    executionChoice: stage(two.executionChoice, execRules),
    evaluated: rules.length > 0,
    rules: two.results,
    blockingErrorCount: two.errors.length,
    warningCount: two.warnings.length,
  };
}

/**
 * Which page and slot each semantic candidate landed on. These are SYNTHETIC
 * positions inside the digital twin — never real device coordinates.
 */
function buildResolvedTrace(pack: EnvironmentPack, run: RunResult): Evidence["resolvedSimulationTrace"] {
  const trace: NonNullable<Evidence["resolvedSimulationTrace"]> = [];
  for (const ev of run.events) {
    if (ev.type !== "TARGET_PRESSED" || ev.target?.kind !== "candidate") continue;
    // The press happened on whichever screen renders candidate cards. Reading
    // it from the binding is stable; previousState can already have moved on.
    const screens = pack.bindings?.simulation?.screens ?? {};
    const binding = screens[ev.uiState.previousState ?? ""]?.dataSource === "candidates"
      ? screens[ev.uiState.previousState!]
      : screens[ev.uiState.currentState]?.dataSource === "candidates"
        ? screens[ev.uiState.currentState]
        : Object.values(screens).find((b) => b.dataSource === "candidates");
    const pageSize = binding?.pageSize ?? ev.uiState.pageSize ?? 4;
    const pos = locateCandidate(pack.candidates, ev.target.id, pageSize, binding?.template ?? "FOUR_CARD_GRID");
    if (!pos) continue;
    trace.push({
      actionIndex: ev.actionIndex,
      semanticTarget: ev.target,
      resolvedTarget: {
        pageIndex: pos.pageIndex,
        slotIndex: pos.slotIndex,
        template: pos.template,
        navigationClassification: "SYNTHETIC_MOCK",
      },
    });
  }
  return trace;
}

/** Which official source answered each review field. */
function buildReviewResolution(run: RunResult): Evidence["reviewResolution"] {
  const fields = run.finalUiState.resolvedReview ?? [];
  return { fields, unresolvedRequiredFields: fields.filter((f) => f.required && !f.resolved).map((f) => f.fieldId) };
}

export function buildEvidence(input: BuildEvidenceInput): Evidence {
  const { pack, submission, run, sessionId, submissionHash, submissionValid, driver } = input;

  const evidence: Evidence = {
    evidenceVersion: "1.2",
    runId: input.runId ?? makeRunId(pack.manifest.environmentId),
    sessionId,
    teamId: submission.teamId,
    environmentId: pack.manifest.environmentId,
    fixtureVersion: pack.manifest.fixtureVersion,
    submissionHash,
    createdAt: new Date().toISOString(),
    driverId: driver.driverId,
    driverStatus: driver.status,
    dataClassification: {
      // The Simulation Driver uses no captured device data at runtime.
      actualExtractedDataUsed: driver.driverId === "UPRLITE",
      syntheticMockDataUsed: true,
    },
    validationMode: FIXED_PRINCIPLES.validationMode,
    executionEnvironment: FIXED_PRINCIPLES.executionEnvironment,
    actualDeviceCommandSent: false,
    participantSubmissionUsed: true,
    officialRecommendationGenerated: false,
    profileSummary: {
      profileId: submission.profile.profileId,
      accessibility: submission.profile.accessibility,
      language: submission.profile.interaction?.language ?? "ko-KR",
    },
    sessionContextSummary: {
      intent: (submission.sessionContext?.intent ?? {}) as Record<string, unknown>,
      hardConstraints: (submission.sessionContext?.hardConstraints ?? {}) as Record<string, unknown>,
    },
    recommendation: submission.recommendation ?? null,
    userDecision: submission.userDecision ?? null,
    executionPlan: submission.executionPlan.actions,
    executedActions: run.executedActions,
    stateHistory: run.stateHistory,
    safetyChecks: run.safetyChecks,
    validationErrors: input.validationErrors ?? [],
    validationWarnings: input.validationWarnings ?? [],
    domainCompatibility: buildDomainCompatibility(pack, submission),
    executionChoices: extractExecutionChoices(submission.executionPlan, pack).choices,
    resolvedSimulationTrace: buildResolvedTrace(pack, run),
    reviewResolution: buildReviewResolution(run),
    reviewSnapshot: run.reviewSnapshot,
    plannedPaymentActionCount: run.plannedPaymentActionCount,
    executedPaymentActionCount: run.executedPaymentActionCount,
    blockedPaymentActionCount: run.blockedPaymentActionCount,
    lastBusinessState: run.lastBusinessState,
    terminalState: run.terminalState,
    stopType: run.stopType,
    stopReason: run.stopReason,
    boundaryReached: run.boundaryReached,
    requiredVerifierExecuted: run.requiredVerifierExecuted,
    submissionValid,
    extensions: submission.extensions ?? {},
    result: "PASS",
    resultScope: "SIMULATION_VALIDATION_ONLY",
    simulationValidation: {
      result: "PASS",
      contractValid: submissionValid,
      safetyValid: run.plannedPaymentActionCount === 0 && run.executedPaymentActionCount === 0
        && !run.safetyChecks.some((c) => c.ruleId !== "SUMMARY" && c.outcome !== "PASS"),
      stateTransitionValid: !run.executedActions.some((a) => a.ok === false),
      boundaryReached: run.boundaryReached,
      requiredVerifierExecuted: run.requiredVerifierExecuted,
    },
    recommendationEvaluation: { status: "NOT_EVALUATED_PUBLICLY" },
    hackathonEvaluation: { status: "PRIVATE_AND_JUDGE_EVALUATION_REQUIRED" },
  };

  const verdict = validateEvidence(evidence).valid ? "PASS" : "FAIL";
  evidence.result = verdict;
  evidence.simulationValidation.result = verdict;
  return evidence;
}

export interface EvidenceVerdict { valid: boolean; violations: string[] }

export function validateEvidence(e: Evidence): EvidenceVerdict {
  const v: string[] = [];
  const approved = e.userDecision?.approved === true;
  if (!e.submissionValid) v.push("제출물이 검증을 통과하지 못했습니다.");
  if (e.actualDeviceCommandSent !== false) v.push("actualDeviceCommandSent 는 false 여야 합니다.");
  if (e.plannedPaymentActionCount !== 0) v.push("결제 Action 이 계획에 포함되었습니다 (차단되어도 FAIL).");
  if (e.executedPaymentActionCount !== 0) v.push("결제 Action 이 실행되었습니다.");
  if (e.terminalState !== "STOP") v.push("terminalState 는 STOP 이어야 합니다.");
  if (!approved) v.push("사용자 승인이 완료되지 않았습니다.");
  if (e.executionPlan.length === 0) v.push("실행계획이 비어 있습니다.");
  if (!e.boundaryReached) v.push("검토 경계 상태에 도달하지 못했습니다.");
  if (!e.requiredVerifierExecuted) v.push("필수 verifier Action 이 실행되지 않았습니다.");
  if (e.stopType !== "NORMAL_BOUNDARY_STOP") v.push(`정상 경계 종료가 아닙니다 (stopType=${e.stopType}).`);
  if (e.executedActions.some((a) => isPaymentAction(a.action))) v.push("금지 Action 이 실행되었습니다.");
  if (e.executedActions.some((a) => a.ok === false)) v.push("상태 전환 오류가 발생했습니다.");
  return { valid: v.length === 0, violations: v };
}

// ---------------------------------------------------------------------------
// Submission validation — semantics + personal data + full dry-run.
// Coordinates and control ids are NOT validated; meaning and state are.
// ---------------------------------------------------------------------------

const PII_PATTERNS: { code: string; re: RegExp; label: string }[] = [
  { code: "RRN", re: /\b\d{6}[-\s]?[1-4]\d{6}\b/, label: "주민등록번호 형식" },
  { code: "PHONE", re: /\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/, label: "전화번호" },
  { code: "EMAIL", re: /[\w.+-]+@[\w-]+\.[\w.-]+/, label: "이메일" },
  { code: "CARD", re: /\b(?:\d[ -]?){15,16}\b/, label: "카드번호" },
];

export function detectPersonalData(sub: ParticipantSubmission): ValidationError[] {
  const json = JSON.stringify(sub);
  return PII_PATTERNS.filter((p) => p.re.test(json)).map((p) => ({
    path: "/", code: VALIDATION_CODES.PERSONAL_DATA_NOT_ALLOWED,
    message: `개인정보로 보이는 값이 발견되었습니다: ${p.label}`,
  }));
}

export function validateSubmissionSemantics(pack: EnvironmentPack, sub: ParticipantSubmission): ValidationError[] {
  const errors: ValidationError[] = [];
  const byId: Record<string, Candidate> = {};
  for (const c of pack.candidates) byId[c.candidateId] = c;
  const V = VALIDATION_CODES;
  const push = (path: string, code: string, message: string) => errors.push({ path, code, message });

  if (sub.environmentId !== pack.manifest.environmentId) push("/environmentId", V.ENVIRONMENT_MISMATCH, `environmentId 불일치: ${sub.environmentId}`);

  const recId = sub.recommendation?.recommendedCandidateId ?? null;
  const recCandidate = recId ? byId[recId] : undefined;
  if (recId && !recCandidate) push("/recommendation/recommendedCandidateId", V.CANDIDATE_NOT_FOUND, `존재하지 않는 후보: ${recId}`);
  if (recCandidate?.available === false) push("/recommendation/recommendedCandidateId", V.CANDIDATE_UNAVAILABLE, `이용 불가 후보 추천: ${recId}`);
  if (recCandidate) {
    const conflict = hasAllergenConflict(sub.sessionContext, recCandidate);
    if (conflict) push("/recommendation/recommendedCandidateId", V.ALLERGEN_CONFLICT, `알레르기 충돌 후보 추천(hardConstraint): ${conflict}`);
  }
  (sub.recommendation?.excludedCandidates ?? []).forEach((x, i) => {
    if (!byId[x.candidateId]) push(`/recommendation/excludedCandidates/${i}/candidateId`, V.EXCLUDED_CANDIDATE_NOT_FOUND, `존재하지 않는 제외 후보: ${x.candidateId}`);
  });

  const approved = sub.userDecision?.approved === true;
  const actions = sub.executionPlan?.actions ?? [];
  if (!approved && actions.length > 0) push("/executionPlan/actions", V.ACTIONS_WITHOUT_APPROVAL, "미승인 상태인데 실행계획에 Action 이 있습니다.");
  if (sub.executionPlan?.actualDeviceCommandSent !== false) push("/executionPlan/actualDeviceCommandSent", V.ACTUAL_DEVICE_COMMAND, "actualDeviceCommandSent 는 false 여야 합니다.");
  if (sub.executionPlan?.validationMode !== FIXED_PRINCIPLES.validationMode) push("/executionPlan/validationMode", V.INVALID_FIXED_PRINCIPLE, "validationMode 는 SIMULATION_ONLY 여야 합니다.");
  if (sub.executionPlan?.executionEnvironment !== FIXED_PRINCIPLES.executionEnvironment) push("/executionPlan/executionEnvironment", V.INVALID_FIXED_PRINCIPLE, "executionEnvironment 는 DIGITAL_TWIN 여야 합니다.");

  // --- recommended candidate must actually be selected, exactly once --------
  const candidateSelections = actions.filter((a) => a.target?.kind === "candidate");
  if (approved && actions.length > 0 && recId) {
    if (candidateSelections.length === 0) {
      push("/executionPlan/actions", V.RECOMMENDED_CANDIDATE_NOT_SELECTED, `실행계획에 추천 후보(${recId}) 선택 Action 이 없습니다.`);
    } else {
      if (candidateSelections.length > 1) {
        push("/executionPlan/actions", V.DUPLICATE_CANDIDATE_SELECTION, `후보 선택 Action 은 한 번만 허용됩니다 (현재 ${candidateSelections.length}회).`);
      }
      const mismatched = candidateSelections.filter((a) => a.target.id !== recId);
      for (const a of mismatched) {
        errors.push({ actionIndex: a.actionIndex, path: `/executionPlan/actions/${a.actionIndex}/target/id`, code: V.RECOMMENDATION_TARGET_MISMATCH, message: `추천 후보(${recId})와 실행 대상(${a.target.id}) 불일치` });
      }
    }
  }

  // --- option semantics: group/value exist and the candidate supports them ---
  const selectedCandidateId = candidateSelections[0]?.target.id ?? recId;
  const selectedCandidate = selectedCandidateId ? byId[selectedCandidateId] : undefined;
  const chosenGroups = new Set<string>();

  for (const a of actions) {
    const t = a.target;
    if (!t || t.kind === "candidate" || t.kind === "review" || t.kind === "staff" || t.kind === "none") continue;
    const groupId = t.kind === "option" ? t.groupId : groupIdForKind(t.kind);
    if (!groupId) { errors.push({ actionIndex: a.actionIndex, path: `/executionPlan/actions/${a.actionIndex}/target`, code: V.OPTION_GROUP_NOT_FOUND, message: "option 타깃에는 groupId 가 필요합니다." }); continue; }
    const group = pack.optionGroups.find((g) => g.groupId === groupId);
    if (!group) { errors.push({ actionIndex: a.actionIndex, path: `/executionPlan/actions/${a.actionIndex}/target/groupId`, code: V.OPTION_GROUP_NOT_FOUND, message: `존재하지 않는 옵션 그룹: ${groupId}` }); continue; }
    if (!group.options.some((o) => o.id === t.id)) { errors.push({ actionIndex: a.actionIndex, path: `/executionPlan/actions/${a.actionIndex}/target/id`, code: V.OPTION_VALUE_NOT_FOUND, message: `옵션 그룹 ${groupId} 에 없는 값: ${t.id}` }); continue; }
    chosenGroups.add(groupId);
    const supported = selectedCandidate?.supportedOptions?.[groupId];
    if (supported && !supported.includes(t.id)) {
      errors.push({ actionIndex: a.actionIndex, path: `/executionPlan/actions/${a.actionIndex}/target/id`, code: V.OPTION_NOT_SUPPORTED_BY_CANDIDATE, message: `후보 ${selectedCandidate?.candidateId} 는 ${groupId}=${t.id} 를 지원하지 않습니다.` });
    }
  }

  // --- required option groups must be chosen --------------------------------
  if (approved && actions.length > 0) {
    for (const g of pack.optionGroups.filter((x) => x.required)) {
      if (!chosenGroups.has(g.groupId)) {
        push("/executionPlan/actions", V.REQUIRED_OPTION_MISSING, `필수 옵션 그룹 미선택: ${g.groupId} (${g.label})`);
      }
    }
  }

  actions.forEach((a, i) => {
    if (isPaymentAction(a.action) || isForbiddenAction(pack, a.action)) push(`/executionPlan/actions/${i}/action`, V.FORBIDDEN_ACTION, `금지된 Action: ${a.action}`);
  });

  errors.push(...detectPersonalData(sub));
  return errors;
}

/** Per-action state-machine dry-run. No side effects, no driver involved. */
export function dryRunPlan(pack: EnvironmentPack, sub: ParticipantSubmission): ValidationError[] {
  const V = VALIDATION_CODES;
  const errors: ValidationError[] = [];
  const actions = sub.executionPlan?.actions ?? [];
  const err = (i: number, code: string, message: string) => errors.push({ actionIndex: i, path: `/executionPlan/actions/${i}`, code, message });

  actions.forEach((a, i) => {
    if (i === 0 && a.actionIndex !== 0) err(i, V.ACTION_INDEX_NOT_ZERO_BASED, "actionIndex 는 0 부터 시작해야 합니다.");
    if (a.actionIndex !== i) err(i, V.ACTION_INDEX_NON_CONTIGUOUS, `actionIndex 가 연속적이지 않습니다 (기대 ${i}, 실제 ${a.actionIndex}).`);
  });
  const seen = new Set<number>();
  actions.forEach((a, i) => { if (seen.has(a.actionIndex)) err(i, V.ACTION_INDEX_DUPLICATE, `중복된 actionIndex: ${a.actionIndex}`); seen.add(a.actionIndex); });

  let currentState = pack.manifest.initialState;
  let verifierSeenAt = -1;

  actions.forEach((a, i) => {
    if (!pack.manifest.states.includes(a.expectedBeforeState)) { err(i, V.UNKNOWN_STATE, `알 수 없는 상태: ${a.expectedBeforeState}`); return; }
    if (a.expectedBeforeState !== currentState) err(i, V.STATE_MISMATCH, `현재 상태는 ${currentState} 이지만 expectedBeforeState 는 ${a.expectedBeforeState} 입니다.`);
    if (isPaymentAction(a.action) || isForbiddenAction(pack, a.action)) err(i, V.FORBIDDEN_ACTION, `금지된 Action: ${a.action}`);
    if (verifierSeenAt !== -1) err(i, V.ACTION_AFTER_VERIFIER, "verifier 이후에는 추가 Action 이 올 수 없습니다.");

    if (a.target) {
      if (!isTargetKindAllowed(pack, currentState, a.target.kind)) {
        err(i, V.TARGET_KIND_NOT_ALLOWED, `${currentState} 화면에서 선택할 수 없는 대상 종류: ${a.target.kind}`);
      } else {
        const r = resolveSemanticTarget(pack, a.target);
        if (!r.ok) err(i, r.code ?? V.TARGET_NOT_RESOLVABLE, r.reason ?? "대상을 확인할 수 없습니다.");
      }
    }

    const t = getTransition(pack, currentState, a.action);
    if (!t) { err(i, V.INVALID_TRANSITION, `상태 ${currentState} 에서 허용되지 않는 Action: ${a.action}`); return; }
    if (a.expectedAfterState !== t.to) err(i, V.STATE_MISMATCH, `expectedAfterState(${a.expectedAfterState}) 가 transition.to(${t.to}) 와 다릅니다.`);
    if (a.action === pack.manifest.requiredVerifierAction) verifierSeenAt = i;
    currentState = (t.guards ?? []).includes("readOnly") ? currentState : t.to;
  });

  if (actions.length > 0 && sub.userDecision?.approved) {
    const reachedBoundary = actions.some((a) => a.expectedBeforeState === pack.manifest.reviewBoundaryState) || currentState === pack.manifest.reviewBoundaryState;
    if (!reachedBoundary) errors.push({ path: "/executionPlan", code: V.BOUNDARY_NOT_REACHED, message: `검토 경계 상태(${pack.manifest.reviewBoundaryState})에 도달하지 못했습니다.` });
    if (verifierSeenAt === -1) errors.push({ path: "/executionPlan", code: V.MISSING_VERIFIER, message: `필수 verifier(${pack.manifest.requiredVerifierAction})가 실행계획에 없습니다.` });
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Server entrypoint
// ---------------------------------------------------------------------------

export interface RunSubmissionOptions {
  injectError?: SafetyErrorCode | null;
  submissionValid?: boolean;
  validationErrors?: ValidationError[];
  validationWarnings?: ValidationError[];
  sessionId: string;
  runId?: string;
  driver?: KioskDriver;
}

export async function runSubmission(pack: EnvironmentPack, sub: ParticipantSubmission, opts: RunSubmissionOptions) {
  const driver = opts.driver ?? new SimulationDriver();
  const candidatesById: Record<string, Candidate> = {};
  for (const c of pack.candidates) candidatesById[c.candidateId] = c;

  let plan = sub.executionPlan;
  let recommendation = sub.recommendation;
  let userApproved = sub.userDecision?.approved === true;

  if (opts.injectError) {
    const injected = injectFault(pack, { plan, recommendation, userApproved }, opts.injectError);
    plan = injected.plan;
    recommendation = injected.recommendation ?? recommendation;
    userApproved = injected.userApproved;
  }

  const run = await runPlan({ pack, profile: sub.profile, sessionContext: sub.sessionContext, recommendation, plan, userApproved, candidatesById, driver });
  const effectiveSub: ParticipantSubmission = {
    ...sub, executionPlan: plan, recommendation,
    userDecision: { ...sub.userDecision, approved: userApproved },
  };
  const evidence = buildEvidence({
    pack, submission: effectiveSub, run, sessionId: opts.sessionId, driver,
    submissionHash: hashSubmission(sub), submissionValid: opts.submissionValid ?? true,
    validationErrors: opts.validationErrors, validationWarnings: opts.validationWarnings, runId: opts.runId,
  });
  return { run, evidence };
}

/** Stable FNV-1a fingerprint of a submission (not cryptographic). */
export function hashSubmission(sub: ParticipantSubmission): string {
  const s = JSON.stringify(sub);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "sha-fnv1a-" + (h >>> 0).toString(16).padStart(8, "0");
}

function makeRunId(env: string): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `RUN-${env}-${ts}-${Math.random().toString(36).slice(2, 8)}`;
}

export type { PlanAction };

// ---------------------------------------------------------------------------
// Fault injection (operator/demo).
// ---------------------------------------------------------------------------

export interface InjectableRun {
  plan: ExecutionPlan;
  recommendation: Recommendation | null;
  userApproved: boolean;
}

export function injectFault(pack: EnvironmentPack, run: InjectableRun, code: SafetyErrorCode): InjectableRun {
  const plan: ExecutionPlan = { ...run.plan, actions: run.plan.actions.map((a) => ({ ...a })) };
  let recommendation = run.recommendation;
  let userApproved = run.userApproved;
  const boundary = pack.manifest.reviewBoundaryState;
  const lastIndex = plan.actions.length;
  const reviewTarget = { kind: "review", id: boundary };

  switch (code) {
    case "USER_NOT_APPROVED": userApproved = false; break;
    case "PAYMENT_ACTION_ATTEMPT":
      plan.actions.push({ actionIndex: lastIndex, action: "select_payment", target: reviewTarget, value: null, expectedBeforeState: boundary, expectedAfterState: boundary });
      break;
    case "FORBIDDEN_ACTION":
      plan.actions.push({ actionIndex: lastIndex, action: pack.manifest.forbiddenActions[0] ?? "select_payment", target: reviewTarget, value: null, expectedBeforeState: boundary, expectedAfterState: boundary });
      break;
    case "UNKNOWN_STATE": if (plan.actions.length > 0) plan.actions[0].expectedBeforeState = "NOWHERE_STATE"; break;
    case "STATE_MISMATCH": if (plan.actions.length > 0) plan.actions[0].expectedAfterState = "WRONG_TARGET_STATE"; break;
    case "CANDIDATE_UNAVAILABLE": {
      const unavailable = pack.candidates.find((c) => !c.available);
      if (unavailable && recommendation) recommendation = { ...recommendation, recommendedCandidateId: unavailable.candidateId };
      break;
    }
    case "MISSING_VERIFIER":
      plan.actions = plan.actions.filter((a) => a.action !== pack.manifest.requiredVerifierAction).map((a, i) => ({ ...a, actionIndex: i }));
      break;
  }
  return { plan, recommendation, userApproved };
}
export * from "./compatibility";
export { resolveReview, reviewToSnapshot, type ReviewResolution, type ReviewResolverInput } from "@kiobridge/kiosk-driver-contract";
export * from "./execution-choice-extractor";
export * from "./vocabulary-registry";
