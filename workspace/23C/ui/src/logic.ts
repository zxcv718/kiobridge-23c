/**
 * UI ↔ 코어 접착부. 판단은 전부 ../../src/core/* 가 한다 (CLI와 동일 코드).
 * 여기서는 조립·API 왕복만 담당한다.
 */
import type {
  AnySessionContext, Candidate, Evidence, ParticipantSubmission, PublicFixture, Recommendation, UserDecision,
} from "@kiobridge/participant-sdk";
import { nowIso8601Utc } from "@kiobridge/profile-contract";
import { buildProfile, buildChickenContext, type RawUserInput } from "../../src/core/canonical";
import { buildRecommendation, explainCore, alternativesFromRecommendation, type EngineContext } from "../../src/core/engine";
import { buildExecutionPlanCore } from "../../src/core/plan";
import { buildContextSignals, type ContextSignal } from "../../src/core/context";
import { buildAccessibilityEvidence, buildTeamExtensions, buildTeamMetadata } from "../../src/core/submission-meta";

export const TEAM_ID = "23C";

export type { RawUserInput, ContextSignal };

export interface UiRecommendation {
  raw: RawUserInput;
  rec: Recommendation;
  ctx: AnySessionContext;
  engineCtx: EngineContext;
  signals: ContextSignal[];
}

/**
 * 마법사 답변 → 추천 (전부 로컬 결정론 — 서버는 판단하지 않는다).
 * 상황신호는 여기서 한 번만 만들어 세션맥락·엔진·화면이 같은 값을 본다.
 * `now` 는 시연에서 시간대를 바꿔 보여주기 위해 주입 가능하게 둔다.
 */
export function computeRecommendation(raw: RawUserInput, fixture: PublicFixture, now: Date = new Date()): UiRecommendation {
  const signals = buildContextSignals(fixture.candidates, now);
  const { ctx, engineCtx } = buildChickenContext(raw, signals);
  engineCtx.now = now;
  const rec = buildRecommendation(fixture.candidates, engineCtx);
  rec.recommendationReasons = explainCore(rec, engineCtx);
  rec.alternativeCandidateIds = alternativesFromRecommendation(fixture.candidates, rec);
  return { raw, rec, ctx, engineCtx, signals };
}

/** 사용자가 대안을 직접 고른 경우 — 추천을 사용자 선택으로 교체 (MANUAL_SELECTION) */
export function withManualSelection(u: UiRecommendation, fixture: PublicFixture, candidateId: string): UiRecommendation {
  const name = fixture.candidates.find((c) => c.candidateId === candidateId)?.name ?? candidateId;
  const rec: Recommendation = {
    ...u.rec,
    recommendedCandidateId: candidateId,
    recommendationReasons: [
      `직접 고르신 "${name}"(으)로 진행합니다.`,
      ...u.rec.recommendationReasons.filter((r) => !r.startsWith("직접 고르신")),
    ],
    requiresReconfirmation: false, // 사용자가 직접 확인하고 골랐다
  };
  rec.alternativeCandidateIds = alternativesFromRecommendation(fixture.candidates, rec);
  return { ...u, rec };
}

export function buildUiSubmission(
  u: UiRecommendation, fixture: PublicFixture, approved: boolean, manual: boolean,
): ParticipantSubmission {
  const decision: UserDecision = {
    approved,
    decision: approved ? (manual ? "MODIFY" : "APPROVE") : "REJECT",
    confirmedAt: nowIso8601Utc(),
  };
  const executionPlan = buildExecutionPlanCore(decision, u.rec, fixture, u.engineCtx);
  return {
    inputContractVersion: "1.0.0",
    submissionVersion: "1.0.0",
    teamId: TEAM_ID,
    environmentId: fixture.manifest.environmentId,
    profile: buildProfile(u.raw),
    sessionContext: u.ctx,
    recommendation: u.rec,
    userDecision: decision,
    executionPlan,
    // 선택 채널 3종 — CLI(participant.ts)와 같은 코어를 쓴다(로직 중복 없음).
    extensions: buildTeamExtensions(u.raw, u.signals),
    accessibilityEvidence: buildAccessibilityEvidence(u.raw),
    teamMetadata: buildTeamMetadata(fixture, TEAM_ID),
  } as ParticipantSubmission;
}

export const candidateName = (fixture: PublicFixture, id: string | null): string =>
  id === null ? "(없음)" : fixture.candidates.find((c) => c.candidateId === id)?.name ?? id;

export const candidatePrice = (fixture: PublicFixture, id: string | null): number | undefined =>
  id === null ? undefined : (fixture.candidates.find((c) => c.candidateId === id) as Candidate & { price?: number })?.price;

/* ───────────── Simulation API 왕복 (Vite 프록시 /api → :4000) ───────────── */

const j = async <T>(r: Response): Promise<T> => {
  const body = await r.json().catch(() => undefined);
  if (!r.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${r.status}`);
  return body as T;
};

export interface RunOutcome {
  sessionId: string;
  valid: boolean;
  validationErrors: { path: string; code: string; message: string }[];
  evidence?: Evidence;
}

export async function runOnSimulator(
  submission: ParticipantSubmission,
  existingSessionId: string | undefined,
  onStep: (label: string) => void,
): Promise<RunOutcome> {
  let sessionId = existingSessionId?.trim() || "";
  if (!sessionId) {
    onStep("세션을 만들고 있습니다");
    const s = await j<{ sessionId: string }>(await fetch("/api/v1/sessions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ environmentId: submission.environmentId }),
    }));
    sessionId = s.sessionId;
  }
  onStep("주문 계획을 제출하고 있습니다");
  await j(await fetch(`/api/v1/sessions/${sessionId}/submission`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submission),
  }));
  onStep("안전 규칙을 검증하고 있습니다");
  const v = await j<{ valid: boolean; errors?: RunOutcome["validationErrors"] }>(
    await fetch(`/api/v1/sessions/${sessionId}/validate`, { method: "POST" }),
  );
  if (!v.valid) return { sessionId, valid: false, validationErrors: v.errors ?? [] };
  onStep("가상 키오스크에서 실행하고 있습니다");
  await j(await fetch(`/api/v1/sessions/${sessionId}/execute`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
  }));
  onStep("실행 증거를 받아오고 있습니다");
  const evidence = await j<Evidence>(await fetch(`/api/v1/sessions/${sessionId}/evidence`));
  return { sessionId, valid: true, validationErrors: [], evidence };
}

export interface InjectOutcome {
  /** 주입 전용 일회성 세션 — 본 데모 세션이 아니다 */
  sessionId: string;
  evidence?: Evidence;
  validation?: { errors?: { code: string }[] };
}

/**
 * 오류 주입은 반드시 새 세션에서 한다.
 * 서버의 error-injection 은 실행 결과로 `session.evidence` 를 교체하므로(doExecute),
 * 본 데모 세션에 주입하면 방금 받은 PASS Evidence 가 서버에서 사라진다.
 * 같은 제출물을 새 세션에 다시 올린 뒤 거기에 주입해, 원본 결과를 보존한다.
 */
export async function injectError(submission: ParticipantSubmission, code: string): Promise<InjectOutcome> {
  const s = await j<{ sessionId: string }>(await fetch("/api/v1/sessions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ environmentId: submission.environmentId }),
  }));
  await j(await fetch(`/api/v1/sessions/${s.sessionId}/submission`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submission),
  }));
  const r = await j<Omit<InjectOutcome, "sessionId">>(
    await fetch(`/api/v1/sessions/${s.sessionId}/error-injection`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }),
    }),
  );
  return { sessionId: s.sessionId, ...r };
}

/* ───────────── Fixture 로딩 — 서버가 없어도 죽지 않는다 ─────────────
 * 키트 원칙("외부 API가 죽어도 여러분의 서비스는 계속 동작해야 합니다") 적용:
 * ① Simulation API가 살아 있으면 서버 fixture 사용 (live: true — 실행·오류 주입 가능)
 * ② 없으면(예: Vercel 배포 URL) 빌드에 내장한 공개 fixture로 체험 모드 (live: false) */
import bundledManifest from "../../../../environments/chicken-store/manifest.json";
import bundledCandidates from "../../../../environments/chicken-store/candidates.json";
import bundledOptionGroups from "../../../../environments/chicken-store/option-groups.json";
import bundledScreens from "../../../../environments/chicken-store/screens.json";
import bundledTransitions from "../../../../environments/chicken-store/transitions.json";
import bundledSafetyRules from "../../../../environments/chicken-store/safety-rules.json";
import bundledBinding from "../../../../environments/chicken-store/bindings/simulation.binding.json";
// 서버의 toPublicFixture 가 반환하는 9개 키와 동일하게 맞춘다.
// 이 둘이 빠져 있으면 체험 모드가 라이브와 다른 데이터로 동작한다.
import bundledCompatibility from "../../../../environments/chicken-store/compatibility-rules.json";
import bundledReviewMapping from "../../../../environments/chicken-store/review-mapping.json";

export const BUNDLED_FIXTURE = {
  manifest: bundledManifest,
  candidates: bundledCandidates,
  optionGroups: bundledOptionGroups,
  compatibilityRules: bundledCompatibility,
  reviewMapping: bundledReviewMapping,
  screens: bundledScreens,
  transitions: bundledTransitions,
  safetyRules: bundledSafetyRules,
  simulationBinding: bundledBinding,
} as unknown as PublicFixture;

export interface FixtureLoad {
  fixture: PublicFixture;
  /** true = Simulation API 연결됨(실행 가능), false = 내장 데이터 체험 모드 */
  live: boolean;
}

export async function fetchFixture(): Promise<FixtureLoad> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2500);
    const r = await fetch("/api/v1/environments/chicken-store/fixture", { signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { fixture: (await r.json()) as PublicFixture, live: true };
  } catch {
    return { fixture: BUNDLED_FIXTURE, live: false }; // 실패 시 맥락 없이 진행하지 않고, 같은 공개 데이터로 대체
  }
}

/* ───────── 사전 생성 Evidence — 체험 모드에서 "결말"을 보여주기 위한 것 ─────────
 * Simulation API 가 없는 배포본에서는 실행이 불가능하다(키트는 로컬 전용).
 * 그렇다고 결과를 안 보여주면 사용자는 "계획까지" 만 보고 끝난다.
 * 그래서 로컬 키트에서 실제로 받은 Evidence 를 그대로 싣되,
 * ★ 절대 지금 입력의 결과인 것처럼 표시하지 않는다 — 생성 시각·세션 ID·"사전 생성"을 반드시 병기한다. */
import archivedEvidence from "../../../../submission-output/23C/simulation-evidence.json";

export interface ArchivedRun {
  result: string;
  stopType: string;
  boundaryReached: boolean;
  requiredVerifierExecuted: boolean;
  plannedPaymentActionCount: number;
  executedPaymentActionCount: number;
  actualDeviceCommandSent: boolean;
  sessionId: string;
  createdAt: string;
  environmentId: string;
  actionCount: number;
}

export const ARCHIVED_RUN: ArchivedRun = (() => {
  const e = archivedEvidence as unknown as Record<string, unknown>;
  return {
    result: String(e.result),
    stopType: String(e.stopType),
    boundaryReached: e.boundaryReached === true,
    requiredVerifierExecuted: e.requiredVerifierExecuted === true,
    plannedPaymentActionCount: Number(e.plannedPaymentActionCount ?? 0),
    executedPaymentActionCount: Number(e.executedPaymentActionCount ?? 0),
    actualDeviceCommandSent: e.actualDeviceCommandSent === true,
    sessionId: String(e.sessionId),
    createdAt: String(e.createdAt),
    environmentId: String(e.environmentId),
    actionCount: Array.isArray(e.executionPlan) ? e.executionPlan.length : 0,
  };
})();

/** 체험 모드용 — 제출 JSON을 파일로 내려받는다 (심사·검증은 로컬 키트에서 수행) */
export function downloadSubmission(submission: ParticipantSubmission) {
  const blob = new Blob([JSON.stringify(submission, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "participant-submission.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
