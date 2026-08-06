/**
 * 팀 23C — 참가팀 9단계 구현 (환경: chicken-store)
 *
 * 이 파일은 공식 측정 표면이다: `npm run participant:progress`가 아래 9개 함수를
 * 실제로 호출해 구현 여부를 판정한다. 순수 로직은 ./core/* 에 있고,
 * CLI(run.ts)와 데모 UI(../ui)가 같은 코어를 공유한다 — 로직 중복 없음.
 *
 * 안전 원칙 (키트 계약):
 *  - 모르는 값은 추측하지 않는다 (UNKNOWN 정책)
 *  - 하드 제약 위반 후보는 점수를 깎는 게 아니라 제거한다
 *  - 승인 없이 실행계획을 만들지 않는다 (거절 → 빈 계획)
 *  - 결제·좌표·실제 개인정보는 어디에도 등장하지 않는다
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  AnySessionContext, Candidate, ExecutionPlan, ParticipantSubmission, PublicFixture,
  Recommendation, UserDecision, UserProfile,
} from "@kiobridge/participant-sdk";
import { nowIso8601Utc, SENTINEL } from "@kiobridge/participant-sdk";
import { buildProfile, buildChickenContext } from "./core/canonical";
import {
  alternativesFromRecommendation, buildRecommendation, explainCore, filterCandidatesCore,
  type EngineContext,
} from "./core/engine";
import { buildExecutionPlanCore } from "./core/plan";
import { buildContextSignals, CONTEXT_NAMESPACE, type ContextSignal } from "./core/context";
import { buildAccessibilityEvidence, buildTeamExtensions, buildTeamMetadata } from "./core/submission-meta";

type SessionContext = AnySessionContext;

/** 참가팀 서비스가 수집한 원본 입력 (형식 자유 — 웹폼/음성/QR/챗봇 무엇이든). */
export type RawUserInput = Record<string, unknown>;

const INPUT_URL = new URL("../input/raw-user-input.json", import.meta.url);

/* ═══════════════════════════ 1. 수집 ═══════════════════════════ */

/**
 * STEP 1 — CLI 모드: input/raw-user-input.json 을 읽는다.
 * 데모 UI에서는 화면이 같은 형태의 RawUserInput 을 직접 만든다.
 */
export async function collectProfile(): Promise<RawUserInput> {
  const raw = JSON.parse(readFileSync(fileURLToPath(INPUT_URL), "utf-8")) as RawUserInput;
  return { collectedVia: "WEB_FORM", ...raw };
}

/* ═══════════════════ 2. Canonical Profile 변환 ═══════════════════ */

export function mapToCanonicalInput(raw: RawUserInput): UserProfile {
  return buildProfile(raw); // 순수 코어(core/canonical) — UI와 공유
}

/* ═══════════════════ 3. 세션 맥락 ═══════════════════ */

/** STEP 9가 ctx 를 받지 못하는 공식 시그니처 제약 보완용 스냅샷 (buildSubmission 흐름에서 채워짐). */
let lastEngineContext: EngineContext | undefined;

export function createSessionContext(raw: RawUserInput, fixture: PublicFixture): SessionContext {
  if (fixture.manifest.environmentId === "sandbox") {
    return {
      intent: { task: "PRACTICE" },
      facts: {}, preferences: { size: SENTINEL.NO_PREFERENCE }, hardConstraints: {}, capabilities: {},
      fieldMetadata: {},
    } as SessionContext;
  }

  // 상황신호는 외부 API 없이 기기 시계와 fixture 만으로 만든다.
  // Core 계약은 그대로이며 팀 namespace 아래 extensions 로만 들어간다.
  const signals = buildContextSignals(fixture.candidates);
  const { ctx, engineCtx } = buildChickenContext(raw, signals); // 순수 코어(core/canonical) — UI와 공유
  lastEngineContext = engineCtx;
  return ctx;
}

/* ═══════════════════ 4. 필터 — 제거이지 감점이 아니다 ═══════════════════ */

export function filterCandidates(candidates: Candidate[], ctx: SessionContext): Candidate[] {
  return filterCandidatesCore(candidates, asEngineContext(ctx)).survivors;
}

/* ═══════════════════ 5. 추천 ═══════════════════ */

export function recommend(candidates: Candidate[], ctx: SessionContext, _profile: UserProfile): Recommendation {
  return buildRecommendation(candidates, asEngineContext(ctx));
}

/* ═══════════════════ 6. 이유 설명 ═══════════════════ */

export function explainRecommendation(rec: Recommendation, ctx: SessionContext): string[] {
  return explainCore(rec, asEngineContext(ctx));
}

/* ═══════════════════ 7. 대안 ═══════════════════ */

export function buildAlternatives(candidates: Candidate[], rec: Recommendation): string[] {
  return alternativesFromRecommendation(candidates, rec);
}

/* ═══════════════════ 8. 사용자 승인 ═══════════════════ */

/**
 * CLI 모드: 입력 파일의 decision(APPROVE|REJECT|MODIFY)을 재현한다.
 * 데모 UI에서는 실제 버튼 클릭이 이 함수를 대체한다.
 * 재확인이 필요한 추천(requiresReconfirmation)은 _reconfirmed=true 없이는 승인하지 않는다.
 */
export async function collectUserDecision(rec: Recommendation): Promise<UserDecision> {
  let raw: RawUserInput = {};
  try { raw = JSON.parse(readFileSync(fileURLToPath(INPUT_URL), "utf-8")); } catch { raw = {}; }
  let decision = ["APPROVE", "REJECT", "MODIFY"].includes(String(raw.decision))
    ? (String(raw.decision) as UserDecision["decision"])
    : "APPROVE";
  if (rec.requiresReconfirmation && raw._reconfirmed !== true && decision === "APPROVE") {
    decision = "REJECT"; // 확실하지 않은 정보를 사용자 확인 없이 실행하지 않는다
  }
  if (rec.recommendedCandidateId === null) decision = "REJECT";
  return {
    approved: decision === "APPROVE",
    decision,
    confirmedAt: nowIso8601Utc(),
  };
}

/* ═══════════════════ 9. 의미 기반 실행계획 ═══════════════════ */

export function buildExecutionPlan(decision: UserDecision, rec: Recommendation, fixture: PublicFixture): ExecutionPlan {
  return buildExecutionPlanCore(decision, rec, fixture, lastEngineContext ?? { preferences: {}, hardConstraints: {} });
}

/* ═══════════════════════════ 조립 ═══════════════════════════ */

export async function buildSubmission(fixture: PublicFixture, teamId: string): Promise<ParticipantSubmission> {
  const raw = await collectProfile();
  const profile = mapToCanonicalInput(raw);
  const sessionContext = createSessionContext(raw, fixture);

  // STEP 4는 생존 후보를 만들고, STEP 5는 전체 후보를 받아 제외 사유까지 보존한다
  filterCandidates(fixture.candidates, sessionContext);
  const recommendation = recommend(fixture.candidates, sessionContext, profile);
  recommendation.recommendationReasons = explainRecommendation(recommendation, sessionContext);
  recommendation.alternativeCandidateIds = buildAlternatives(fixture.candidates, recommendation);

  const userDecision = await collectUserDecision(recommendation);
  const executionPlan = buildExecutionPlan(userDecision, recommendation, fixture);

  const signals = (lastEngineContext?.contextSignals ?? []) as ContextSignal[];

  return {
    inputContractVersion: "1.0.0",
    submissionVersion: "1.0.0",
    teamId,
    environmentId: fixture.manifest.environmentId,
    profile, sessionContext, recommendation, userDecision, executionPlan,
    // 선택 채널 3종 — 데모 UI와 같은 코어를 쓴다(로직 중복 없음).
    extensions: buildTeamExtensions(raw, signals),
    accessibilityEvidence: buildAccessibilityEvidence(raw),
    teamMetadata: buildTeamMetadata(fixture, teamId),
  } as ParticipantSubmission;
}

/* 내부 헬퍼 */
function asEngineContext(ctx: SessionContext): EngineContext {
  const c = ctx as {
    preferences?: Record<string, unknown>;
    hardConstraints?: Record<string, unknown>;
    fieldMetadata?: EngineContext["fieldMetadata"];
    extensions?: Record<string, unknown>;
  };
  return {
    preferences: (c.preferences ?? {}) as EngineContext["preferences"],
    hardConstraints: (c.hardConstraints ?? {}) as EngineContext["hardConstraints"],
    fieldMetadata: c.fieldMetadata,
    // 맥락은 sessionContext 에 실려 다닌다 — 각 STEP 이 같은 값을 보게 여기서 되읽는다.
    contextSignals: (c.extensions?.[CONTEXT_NAMESPACE] as ContextSignal[] | undefined) ?? [],
  };
}
