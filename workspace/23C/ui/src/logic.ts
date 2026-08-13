/**
 * UI ↔ 코어 접착부. 판단은 전부 ../../src/core/* 가 한다 (CLI와 동일 코드).
 * 여기서는 조립·API 왕복만 담당한다.
 */
import type {
  AnySessionContext, Candidate, Evidence, ParticipantSubmission, PublicFixture, Recommendation, UserDecision,
} from "@kiobridge/participant-sdk";
import { nowIso8601Utc, SENTINEL } from "@kiobridge/profile-contract";
import { buildProfile, buildChickenContext, type RawUserInput } from "../../src/core/canonical";
import { buildRecommendation, explainCore, alternativesFromRecommendation, unmetConditionsFor, type EngineContext } from "../../src/core/engine";
import { buildExecutionPlanCore } from "../../src/core/plan";
import { buildContextSignals, type ContextSignal } from "../../src/core/context";
import { buildAccessibilityEvidence, buildTeamExtensions, buildTeamMetadata } from "../../src/core/submission-meta";

export const TEAM_ID = "23C";

/**
 * QR·주소 원문에서 매장 코드를 뽑는다. (구 QrConnect 화면에서 옮겨 왔다 —
 * QR 걸음이 흐름에서 빠지면서 이 해석을 홈이 쓴다. tests/qr-payload.test.ts 가 실측.)
 *
 * 매장 QR에 무엇이 들어 있을지는 매장이 정한다 — 코드만 있을 수도, 링크일 수도 있다.
 * 그래서 «링크면 매장을 가리키는 값을, 아니면 원문을» 쓰는 정도로만 해석한다.
 * 여기서 더 똑똑하게 굴면, 실패했을 때 사용자가 무엇을 잘못했는지 알 수 없게 된다.
 */
export function parseStoreCode(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    for (const k of ["environmentId", "env", "store", "storeId"]) {
      const v = u.searchParams.get(k);
      if (v?.trim()) return v.trim();
    }
    const seg = u.pathname.split("/").filter(Boolean);
    if (seg.length > 0) return decodeURIComponent(seg[seg.length - 1]);
    return u.hostname;
  } catch { /* URL 이 아니면 원문을 그대로 본다 */ }
  return s;
}

/**
 * 지금 주소에 실려 온 매장 코드 — 폰 기본 카메라로 매장 QR 을 찍으면 이 값이 실려 열린다.
 *
 * 두 곳이 같은 값을 봐야 한다: flow(첫 화면을 관문으로 할지 홈으로 할지)와
 * 홈(어느 매장으로 도울지 밝히는 배너). 없으면 빈 문자열.
 */
export function readUrlStoreCode(): string {
  try {
    const u = new URL(window.location.href);
    for (const k of ["environmentId", "env", "store", "storeId"]) {
      const v = u.searchParams.get(k);
      if (v?.trim()) return parseStoreCode(v.trim());
    }
  } catch { /* 주소를 못 읽으면 없는 것으로 본다 */ }
  return "";
}

/* ───────── 연동한 매장 코드의 기기 저장 (QA 1차 TC-XC-04) ─────────
 * 강제 종료 후 다시 열면 관문(QR 스캔)이 아니라 홈부터 시작해야 한다. QR 연동에
 * 성공한 매장 코드를 기기에 남기고, flow 의 첫 화면 판정이 주소(?env=)와 함께 본다.
 *
 * 매장 코드는 개인정보가 아니라 **기기의 매장 설정**이다 — 무로그인 저장 정책
 * (프로필 kb23c-profile-v1 · 세션 kb23c-session-v1)과 별도 키로 두고, 홈의
 * «새로 설정하기» 완전 초기화(flow.deleteSaved)도 이 키는 지우지 않는다. */
export const STORE_KEY = "kb23c-store-v1";

/** 연동에 성공한 매장 코드를 남긴다 — 실패·모르는 매장·건너뛰기는 부르지 않는다. */
export function rememberStoreCode(code: string): void {
  const c = code.trim();
  if (c === "") return; // 성공이 아닌 것을 성공처럼 남기지 않는다
  try { localStorage.setItem(STORE_KEY, c); } catch { /* 저장 불가 환경이면 그 방문만 관문부터 */ }
}

/** 기기에 남은 매장 코드 — 없으면 빈 문자열(관문부터 시작한다). */
export function readStoredStoreCode(): string {
  try { return localStorage.getItem(STORE_KEY)?.trim() ?? ""; } catch { return ""; }
}

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
  const candidate = fixture.candidates.find((c) => c.candidateId === candidateId);
  const name = candidate?.name ?? candidateId;
  const rec: Recommendation = {
    ...u.rec,
    recommendedCandidateId: candidateId,
    /* «주의 필요»는 고른 메뉴 기준으로 다시 잰다. 스프레드로 물려주면 옛 1순위의
       문장이 남는다 — 예산 5,000원에 6,000원짜리를 골랐는데 화면이 «이 메뉴는
       5,500원입니다»라고 말한 것이 실제로 그 병이었다. 맵기·형태도 마찬가지다. */
    unmetConditions: unmetConditionsFor(candidate, u.engineCtx),
    /* 직접 선택은 **메뉴를 확인한 것**이지 자기 알레르기를 확인한 것이 아니다.
       「잘 모르겠어요」가 화면에 들어온 뒤로(TC-CM-01) 미확정 상태에서 «메뉴 수정»을
       지나는 길이 실제로 생겼다 — 여기서 재확인을 무조건 풀면 알레르기를 모르는 채로
       승인 차단이 사라진다. 미확인 알레르기가 남아 있는 한 재확인도 남긴다. */
    requiresReconfirmation: (u.engineCtx.hardConstraints.allergenIds ?? []).includes(SENTINEL.UNKNOWN),
  };
  /* 사유도 고른 메뉴 기준으로 다시 만든다(QA TC-CM-03). 옛 1순위의 문장을 물려주면
     «뼈 메뉴를 골랐습니다»가 순살 메뉴 옆에 남는다 — explainCore 는 위에서 다시 잰
     unmetConditions 를 보고 어긋난 축의 긍정 문장을 접는다. */
  rec.recommendationReasons = [
    `직접 고르신 "${name}"(으)로 진행합니다.`,
    ...explainCore(rec, u.engineCtx),
  ];
  rec.alternativeCandidateIds = alternativesFromRecommendation(fixture.candidates, rec);
  return { ...u, rec };
}

/**
 * 조건을 고쳐 다시 계산하되 **이미 확정한 메뉴는 유지한다** — 장바구니(S13)의 그 자리 수정.
 *
 * 주문 방식은 엔진 점수에 들어가므로(WEIGHTS.service) 그냥 다시 계산하면 최종 확인
 * 화면에서 메뉴가 갑자기 바뀔 수 있다. 유지 대상이 새 계산의 1위면 그대로 쓰고,
 * 아니면 직접 선택으로 고정해 «주의 필요»를 그 메뉴 기준으로 다시 잰다.
 * 되살릴 수 있는 것은 생존 후보뿐이다(startFromSaved 의 되살리기와 같은 규칙).
 */
export function recommendKeeping(
  raw: RawUserInput, fixture: PublicFixture, keepId: string | null, now: Date = new Date(),
): { u: UiRecommendation; pinned: boolean } {
  const base = computeRecommendation(raw, fixture, now);
  const pinned = keepId !== null
    && base.rec.recommendedCandidateId !== keepId
    && Object.keys(base.rec.scoreBreakdown ?? {}).includes(keepId);
  return { u: pinned ? withManualSelection(base, fixture, keepId) : base, pinned };
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

/* ───────── 메뉴별 주문 가능 수량 상한 (사용자 확정 2026-08-13) ─────────
 * 근거는 candidates.json 의 supportedOptions.QUANTITY(«Q1·Q2·Q3»)다. 화면이 임의로
 * 정한 수(QUANTITY_MAX)는 자료가 없을 때의 마지막 안전판으로만 남는다.
 * 상한을 화면에서 막으면 «키오스크가 누를 수 없는 수량» 자체가 생기지 않는다 —
 * 눈금 밖 수량이 만들던 대체 표시 문제(QA 1차 TC-CM-06)의 뿌리가 이것이었다. */

/** «Qn» 표기의 n — 표기 밖 값은 없는 것으로 둔다(모르는 자료로 상한을 지어내지 않는다). */
const qtyOf = (id: string): number | undefined => {
  const m = /^Q(\d+)$/.exec(id);
  return m ? Number(m[1]) : undefined;
};

/** 이 메뉴가 한 번에 주문받을 수 있는 최대 수량. 자료가 없으면 undefined. */
export function candidateMaxQty(fixture: PublicFixture, id: string | null): number | undefined {
  if (id === null) return undefined;
  const c = fixture.candidates.find((x) => x.candidateId === id) as
    (Candidate & { supportedOptions?: { QUANTITY?: string[] } }) | undefined;
  const ns = (c?.supportedOptions?.QUANTITY ?? []).map(qtyOf).filter((n): n is number => n !== undefined);
  return ns.length ? Math.max(...ns) : undefined;
}

/** 메뉴가 정해지기 전(질문 S10)의 상한 — 판매 중 후보들의 최대값. 자료가 없으면 undefined. */
export function fixtureMaxQty(fixture: PublicFixture): number | undefined {
  const ns = fixture.candidates
    .filter((c) => (c as Candidate & { available?: boolean }).available !== false)
    .map((c) => candidateMaxQty(fixture, c.candidateId))
    .filter((n): n is number => n !== undefined);
  return ns.length ? Math.max(...ns) : undefined;
}

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

/* ───────── 이 주문의 결말 — 체험 모드에서 사용자에게 보여줄 사실 ─────────
 * Simulation API 가 없는 배포본에서는 공식 재생을 받을 수 없다(키트는 로컬 전용).
 * 그렇다고 남의 실행 기록을 가져다 붙이면 "내 주문의 결과"가 아니게 된다.
 *
 * 그래서 여기서는 **방금 만든 계획 자체에서 읽어낼 수 있는 것만** 뽑는다.
 * 아래 값들은 재생해봐야 아는 것이 아니라 계획을 만든 시점에 이미 정해진 성질이다 —
 *   · 몇 단계인가        = actions.length
 *   · 어디서 끝나는가    = 마지막 액션의 expectedAfterState
 *   · 결제를 건드리는가  = manifest.forbiddenActions 와 대조 (plan.ts 가 애초에 안 만든다)
 *   · 기기로 나가는가    = plan.actualDeviceCommandSent (계약상 항상 false)
 *
 * ★ 공식 판정(PASS/stopType)은 여기 없다. 그건 키트가 우리 계획을 재생해야 나오는 값이고,
 *   우리가 화면에 임의로 쓰면 가짜 판정이 된다. 없는 것은 없다고 두는 편이 낫다. */
export interface PlanSummary {
  /** 키오스크에서 밟게 되는 단계 수 */
  stepCount: number;
  /** 계획이 끝나는 화면 상태(예: CART_REVIEW) */
  endsAtState: string;
  /** 그 화면의 사람이 읽는 이름 */
  endsAtTitle: string;
  /** 결제 직전 검토 경계에서 끝나는가 */
  stopsAtReviewBoundary: boolean;
  /** 계획에 포함된 결제성 동작 수 — 0이어야 한다 */
  paymentActionCount: number;
  /** 읽기 전용 확인(verify_cart)이 계획에 들어 있는가 */
  includesRequiredVerifier: boolean;
  /** 실제 기기로 나가는 명령 — 계약상 항상 false */
  deviceCommandSent: boolean;
}

export function summarizeOrderPlan(
  submission: ParticipantSubmission, fixture: PublicFixture,
): PlanSummary {
  const plan = submission.executionPlan;
  const actions = plan.actions ?? [];
  const manifest = fixture.manifest;
  const endsAtState = actions.length > 0
    ? actions[actions.length - 1].expectedAfterState
    : manifest.initialState;
  const forbidden = new Set(manifest.forbiddenActions);

  return {
    stepCount: actions.length,
    endsAtState,
    endsAtTitle: fixture.screens.find((s) => s.state === endsAtState)?.title ?? endsAtState,
    stopsAtReviewBoundary: endsAtState === manifest.reviewBoundaryState,
    paymentActionCount: actions.filter((a) => forbidden.has(a.action)).length,
    includesRequiredVerifier: actions.some((a) => a.action === manifest.requiredVerifierAction),
    deviceCommandSent: plan.actualDeviceCommandSent,
  };
}

/** 체험 모드용 — 제출 JSON을 파일로 내려받는다 (심사·검증은 로컬 키트에서 수행) */
export function downloadSubmission(submission: ParticipantSubmission) {
  const blob = new Blob([JSON.stringify(submission, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "participant-submission.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
