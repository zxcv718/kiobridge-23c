/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  참가팀이 구현해야 할 9개 함수                                              │
 * │                                                                           │
 * │  KioBridge 공식 플랫폼은 이 중 어느 것도 대신 만들어 주지 않습니다.          │
 * │  전부 NOT_IMPLEMENTED 스텁이며, 정답 후보 ID·가중치·완성 Action 순서를       │
 * │  포함하지 않습니다.                                                        │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * 참고 문서
 *   docs/WHAT_YOU_BUILD.md            무엇을 만들어야 하는가
 *   docs/PROFILE_DATA_DICTIONARY.md   Profile 필드 사전
 *   docs/SESSION_CONTEXT_DICTIONARY.md SessionContext 필드 사전
 *   docs/ENUM_REFERENCE.md            공식 enum 목록
 *   docs/UNKNOWN_POLICY.md            모르는 값을 추론하지 않는 규칙
 */
import type {
  AnySessionContext, Candidate, ExecutionPlan, ParticipantSubmission, PublicFixture,
  Recommendation, UserDecision, UserProfile,
} from "@kiobridge/participant-sdk";

/** 환경마다 스키마가 다르므로 도메인별 SessionContext 를 합집합으로 다룹니다. */
type SessionContext = AnySessionContext;

/** 참가팀 서비스가 수집한 원본 입력 (형식 자유 — 웹폼/음성/챗봇 무엇이든). */
export type RawUserInput = Record<string, unknown>;

const todo = (fn: string, what: string): never => {
  throw new Error(
    `NOT_IMPLEMENTED: ${fn}() 는 참가팀이 구현해야 합니다 — ${what}. ` +
      "공식 플랫폼은 이 로직을 제공하지 않습니다 (docs/WHAT_YOU_BUILD.md 참고).",
  );
};

/* 1 ─ 수집 ────────────────────────────────────────────────────────────────── */

/**
 * TODO(참가팀): 사용자에게서 정보를 수집합니다.
 * 수단은 자유입니다 — 웹폼, 모바일앱, 음성, AI 대화, 보호자 대리입력 등.
 * 반환 형식도 자유이며, 다음 단계에서 Canonical 형식으로 변환합니다.
 */
export async function collectProfile(): Promise<RawUserInput> {
  return todo("collectProfile", "사용자 정보 수집 채널 구현");
}

/**
 * TODO(참가팀): 수집한 원본 입력을 Canonical Profile 로 변환합니다.
 * - 오래 유지되는 특성만 담습니다 (접근성 요구, 선호 입력수단, 언어, 동의).
 * - 이번 세션에서만 유효한 값(오늘 뭘 사려는지 등)은 여기 넣지 마세요.
 * - 모르는 값은 추측하지 말고 UNKNOWN 을 쓰거나 필드를 생략하세요.
 * - 자유 문자열 대신 docs/ENUM_REFERENCE.md 의 공식 enum 을 사용하세요.
 */
export function mapToCanonicalInput(_raw: RawUserInput): UserProfile {
  return todo("mapToCanonicalInput", "원본 입력 → Canonical Profile 변환");
}

/**
 * TODO(참가팀): 이번 세션에만 해당하는 맥락을 만듭니다.
 * intent / facts / preferences / hardConstraints / capabilities 는 의미가 다릅니다.
 * 섞어 넣으면 DOMAIN_CONTEXT_MISMATCH 로 거부됩니다.
 * 각 값의 출처와 신뢰도를 fieldMetadata 에 기록하세요.
 */
export function createSessionContext(_raw: RawUserInput, _fixture: PublicFixture): SessionContext {
  return todo("createSessionContext", "세션 맥락(intent/facts/preferences/hardConstraints) 구성");
}

/* 2 ─ 추천 ────────────────────────────────────────────────────────────────── */

/**
 * TODO(참가팀): hardConstraints 를 위반하는 후보를 먼저 제거합니다.
 * 알레르기·예산·인증수단 같은 제약은 "점수가 낮아지는" 것이 아니라
 * "후보에서 빠지는" 것입니다. 제외 사유는 나중에 설명에 쓰이므로 남겨두세요.
 */
export function filterCandidates(_candidates: Candidate[], _ctx: SessionContext): Candidate[] {
  return todo("filterCandidates", "hardConstraint 위반 후보 제외");
}

/**
 * TODO(참가팀): 남은 후보의 순위를 정하고 1순위를 고릅니다.
 * 가중치와 점수 설계는 전적으로 참가팀의 몫이며 심사 대상입니다.
 * 확신이 낮으면 requiresReconfirmation 을 true 로 두세요.
 */
export function recommend(_candidates: Candidate[], _ctx: SessionContext, _profile: UserProfile): Recommendation {
  return todo("recommend", "후보 순위 결정 및 1순위 추천");
}

/**
 * TODO(참가팀): 추천 이유를 사용자가 이해할 수 있는 문장으로 만듭니다.
 * "왜 이것인가" 와 "무엇을 만족하지 못했는가" 를 모두 설명하세요.
 */
export function explainRecommendation(_rec: Recommendation, _ctx: SessionContext): string[] {
  return todo("explainRecommendation", "추천 이유 설명 생성");
}

/**
 * TODO(참가팀): 대안을 제시합니다.
 * 1순위가 사용자의 뜻과 다를 때 되돌아갈 길이 있어야 합니다.
 */
export function buildAlternatives(_candidates: Candidate[], _rec: Recommendation): string[] {
  return todo("buildAlternatives", "대안 후보 목록 구성");
}

/* 3 ─ 승인과 실행계획 ─────────────────────────────────────────────────────── */

/**
 * TODO(참가팀): 사용자의 승인/거절/수정을 받습니다.
 * 승인 없이 만든 실행계획은 ACTIONS_WITHOUT_APPROVAL 로 거부됩니다.
 * 사용자가 거절하면 actions 는 빈 배열이어야 합니다.
 */
export async function collectUserDecision(_rec: Recommendation): Promise<UserDecision> {
  return todo("collectUserDecision", "사용자 승인/거절 수집");
}

/**
 * TODO(참가팀): 승인된 결정을 의미 기반 실행계획으로 바꿉니다.
 * - target 은 {kind, id, groupId?} 형태의 의미 대상입니다. 좌표나 실제
 *   키오스크 컨트롤 ID 를 쓰지 않습니다.
 * - fixture.screens 의 transitions 를 따라가며 expectedBeforeState /
 *   expectedAfterState 를 채우세요.
 * - manifest.reviewBoundaryState 에서 멈추고, 필수 verifier 를 실행하세요.
 * - 결제·본인확인 완료·행정처리 확정 Action 은 계획에 넣기만 해도 FAIL 입니다.
 */
export function buildExecutionPlan(_decision: UserDecision, _rec: Recommendation, _fixture: PublicFixture): ExecutionPlan {
  return todo("buildExecutionPlan", "의미 기반 실행계획 생성 (경계 전 정지 + verifier)");
}

/* 4 ─ 제출 조립 ───────────────────────────────────────────────────────────── */

/** 위 9개 함수를 순서대로 엮어 제출물을 만듭니다. 구현 전에는 첫 단계에서 멈춥니다. */
export async function buildSubmission(fixture: PublicFixture, teamId: string): Promise<ParticipantSubmission> {
  const raw = await collectProfile();
  const profile = mapToCanonicalInput(raw);
  const sessionContext = createSessionContext(raw, fixture);

  const survivors = filterCandidates(fixture.candidates, sessionContext);
  const recommendation = recommend(survivors, sessionContext, profile);
  recommendation.recommendationReasons = explainRecommendation(recommendation, sessionContext);
  recommendation.alternativeCandidateIds = buildAlternatives(survivors, recommendation);

  const userDecision = await collectUserDecision(recommendation);
  const executionPlan = buildExecutionPlan(userDecision, recommendation, fixture);

  return {
    inputContractVersion: "1.0.0",
    submissionVersion: "1.0.0",
    teamId,
    environmentId: fixture.manifest.environmentId,
    profile, sessionContext, recommendation, userDecision, executionPlan,
  } as ParticipantSubmission;
}
