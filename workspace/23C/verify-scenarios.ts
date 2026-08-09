/**
 * A계열 — 계약 경계 검증. 공식 API(:4000)에 실제로 올려 재생시킨다.
 *
 * 실행:  npm run dev  (또는 npm run start:api)  →  npx tsx workspace/23C/verify-scenarios.ts
 * 시나리오 정의: `키오브릿지-검증-시나리오.md`
 *
 * 단위 테스트가 덮을 수 없는 것만 다룬다 — **서버가 우리 계획을 실제로 재생했을 때의 판정**.
 * 데모 UI(ui/src/logic.ts buildUiSubmission)와 같은 순서로 조립하되, PASS/FAIL 은
 * 우리가 정하지 않고 서버가 낸 Evidence 의 필드만 근거로 쓴다.
 *
 * 제출 전 재확인용이다. 키트 버전이 바뀌거나 엔진 가중치를 손보면 다시 돌릴 것.
 */
import type { ParticipantSubmission, PublicFixture, UserDecision } from "@kiobridge/participant-sdk";
import { nowIso8601Utc } from "@kiobridge/profile-contract";
import { buildProfile, buildChickenContext } from "./src/core/canonical";
import { buildRecommendation, explainCore, alternativesFromRecommendation } from "./src/core/engine";
import { buildExecutionPlanCore } from "./src/core/plan";
import { buildContextSignals } from "./src/core/context";
import { buildAccessibilityEvidence, buildTeamExtensions, buildTeamMetadata } from "./src/core/submission-meta";
import { canStopAsking, allergensAnswered, preferenceAxisAsked } from "./src/core/ask";

const API = "http://localhost:4000";
const TEAM = "23C";
const ENV = "chicken-store";

type Answers = Record<string, unknown>;

/** ui/src/App.tsx buildRawInput 과 동일한 형태 */
function rawFrom(answers: Answers, a11y: Record<string, unknown> = {}, imported = false) {
  const allergies = (answers.allergies as (string | number)[] | undefined)?.filter((x) => x !== "없음");
  return {
    serviceType: answers.serviceType,
    spicyLevel: answers.spicyLevel,
    boneType: answers.boneType,
    cupOption: answers.cupOption,
    quantity: answers.quantity,
    allergies: answers.allergies === undefined ? undefined : allergies,
    budgetKrw: answers.budgetKrw === "없음" ? undefined : answers.budgetKrw,
    largeText: true, highContrast: false, simpleSteps: true, visualGuidance: false,
    hearingSupport: false, mobilitySupport: false, staffAssistancePreferred: false,
    preferredInput: "TOUCH", language: "ko-KR", storeProfile: false,
    ...a11y,
    _collectedVia: imported ? "IMPORTED" : "WEB_FORM",
    _confirmedByUser: true,
  } as Record<string, unknown>;
}

function buildFor(answers: Answers, fixture: PublicFixture, approved: boolean, imported = false) {
  const raw = rawFrom(answers, {}, imported);
  const signals = buildContextSignals(fixture.candidates, new Date());
  const { ctx, engineCtx } = buildChickenContext(raw, signals);
  const rec = buildRecommendation(fixture.candidates, engineCtx);
  rec.recommendationReasons = explainCore(rec, engineCtx);
  rec.alternativeCandidateIds = alternativesFromRecommendation(fixture.candidates, rec);
  const decision: UserDecision = {
    approved, decision: approved ? "APPROVE" : "REJECT", confirmedAt: nowIso8601Utc(),
  };
  const executionPlan = buildExecutionPlanCore(decision, rec, fixture, engineCtx);
  const submission = {
    inputContractVersion: "1.0.0", submissionVersion: "1.0.0",
    teamId: TEAM, environmentId: fixture.manifest.environmentId,
    profile: buildProfile(raw), sessionContext: ctx, recommendation: rec,
    userDecision: decision, executionPlan,
    extensions: buildTeamExtensions(raw, signals),
    accessibilityEvidence: buildAccessibilityEvidence(raw),
    teamMetadata: buildTeamMetadata(fixture, TEAM),
  } as ParticipantSubmission;
  return { submission, rec, engineCtx };
}

const j = async <T>(r: Response): Promise<T> => {
  const b = await r.json().catch(() => undefined);
  if (!r.ok) throw new Error((b as { error?: string })?.error ?? `HTTP ${r.status}`);
  return b as T;
};

async function runOnServer(submission: ParticipantSubmission) {
  const s = await j<{ sessionId: string }>(await fetch(`${API}/api/v1/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ environmentId: ENV }),
  }));
  await j(await fetch(`${API}/api/v1/sessions/${s.sessionId}/submission`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submission),
  }));
  const v = await j<{ valid: boolean; errors?: { code: string; path: string }[] }>(
    await fetch(`${API}/api/v1/sessions/${s.sessionId}/validate`, { method: "POST" }));
  if (!v.valid) return { sessionId: s.sessionId, valid: false, errors: v.errors ?? [], evidence: undefined };
  await j(await fetch(`${API}/api/v1/sessions/${s.sessionId}/execute`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }));
  const evidence = await j<Record<string, unknown>>(await fetch(`${API}/api/v1/sessions/${s.sessionId}/evidence`));
  return { sessionId: s.sessionId, valid: true, errors: [], evidence };
}

function verdict(ev: Record<string, unknown> | undefined): string {
  if (!ev) return "Evidence 없음";
  const ok =
    ev.result === "PASS" && ev.stopType === "NORMAL_BOUNDARY_STOP" &&
    ev.boundaryReached === true && ev.requiredVerifierExecuted === true &&
    ev.plannedPaymentActionCount === 0 && ev.executedPaymentActionCount === 0 &&
    ev.actualDeviceCommandSent === false;
  return `${ok ? "✅ 모든 조건 충족" : "❌ 조건 불충족"} — result=${ev.result} stop=${ev.stopType} ` +
    `boundary=${ev.boundaryReached} verifier=${ev.requiredVerifierExecuted} ` +
    `결제(계획/실행)=${ev.plannedPaymentActionCount}/${ev.executedPaymentActionCount} device=${ev.actualDeviceCommandSent}`;
}

const FULL: Answers = {
  allergies: ["없음"], spicyLevel: "매운맛", boneType: "순살",
  serviceType: "포장", quantity: 1, cupOption: "종이컵", budgetKrw: "없음",
};
/** 조기 종료 시점의 답변 — 이용방식·수량·컵·예산을 아예 묻지 않은 상태 */
const EARLY: Answers = { allergies: ["땅콩", "콩"], spicyLevel: "매운맛", boneType: "뼈" };
const UNKNOWN_ALLERGY: Answers = { allergies: ["모름"], spicyLevel: "매운맛" };

const INJECTIONS = [
  "PAYMENT_ACTION_ATTEMPT", "USER_NOT_APPROVED", "MISSING_VERIFIER", "CANDIDATE_UNAVAILABLE",
  "STATE_MISMATCH", "FORBIDDEN_ACTION", "UNKNOWN_STATE",
];

async function main() {
  const fixture = await j<PublicFixture>(await fetch(`${API}/api/v1/environments/${ENV}/fixture`));
  console.log(`fixture 로드 — 후보 ${fixture.candidates.length}개\n`);

  // ── A1 정상 주문
  {
    const { submission } = buildFor(FULL, fixture, true);
    const r = await runOnServer(submission);
    console.log(`[A1] 정상 주문 완주 (${submission.executionPlan.actions.length}단계)`);
    console.log(`     ${verdict(r.evidence)}\n`);
  }

  // ── A2 조기 종료로 만든 계획  ★ 이번 작업 최대 리스크
  {
    const { submission, rec, engineCtx } = buildFor(EARLY, fixture, true);
    console.log(`[A2] 조기 종료 계획 — 게이트 통과 여부 ${canStopAsking(rec, engineCtx)} ` +
      `(알레르기답변=${allergensAnswered(engineCtx)} 선호축=${preferenceAxisAsked(engineCtx)} conf=${rec.confidence})`);
    console.log(`     안 물어본 항목: 이용방식·수량·컵·예산 → 계획 ${submission.executionPlan.actions.length}단계`);
    const r = await runOnServer(submission);
    console.log(`     ${verdict(r.evidence)}`);
    if (!r.valid) console.log(`     검증 거부: ${r.errors.map((e) => `${e.code}@${e.path}`).join(", ")}`);
    console.log();
  }

  // ── A3 알레르기 UNKNOWN → 승인 불가(빈 계획)
  {
    const { submission, rec } = buildFor(UNKNOWN_ALLERGY, fixture, false);
    console.log(`[A3] 알레르기 모름 — requiresReconfirmation=${rec.requiresReconfirmation} ` +
      `confidence=${rec.confidence} 계획 액션=${submission.executionPlan.actions.length}개(0이어야 함)`);
    const r = await runOnServer(submission);
    const ev = r.evidence;
    console.log(`     검증 valid=${r.valid}` +
      (r.valid ? "" : ` · 거부 사유: ${r.errors.map((e) => `${e.code}@${e.path}`).join(" / ")}`));
    console.log(`     서버 판정: result=${ev?.result ?? "(실행 안 함)"} stop=${ev?.stopType ?? "-"}\n`);
  }

  // ── A4 오류 주입 7종 (각각 새 세션)
  {
    const { submission } = buildFor(FULL, fixture, true);
    console.log("[A4] 오류 주입 7종");
    for (const code of INJECTIONS) {
      const s = await j<{ sessionId: string }>(await fetch(`${API}/api/v1/sessions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ environmentId: ENV }) }));
      await j(await fetch(`${API}/api/v1/sessions/${s.sessionId}/submission`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submission) }));
      try {
        const r = await j<{ evidence?: Record<string, unknown>; validation?: { errors?: { code: string }[] } }>(
          await fetch(`${API}/api/v1/sessions/${s.sessionId}/error-injection`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }));
        const e = r.evidence;
        console.log(`     ${code.padEnd(24)} → stop=${e?.stopType ?? "-"} result=${e?.result ?? "-"} ` +
          `결제실행=${e?.executedPaymentActionCount ?? "-"}` +
          (r.validation?.errors?.length ? ` (제출거부: ${r.validation.errors.map((x) => x.code).join(",")})` : ""));
      } catch (err) {
        console.log(`     ${code.padEnd(24)} → 요청 거부: ${(err as Error).message}`);
      }
    }
    console.log();
  }

  // ── A5 저장본으로 시작한 흐름 (출처가 IMPORTED 로 기록되는 경로)
  {
    const { submission } = buildFor(FULL, fixture, true, true);
    const ch = (submission.profile as { source: { collectionChannel: string } }).source.collectionChannel;
    console.log(`[A5] 저장본 재사용 — collectionChannel=${ch} (IMPORTED 이어야 함)`);
    const r = await runOnServer(submission);
    console.log(`     ${verdict(r.evidence)}\n`);
  }
}

main().catch((e) => { console.error("실패:", e instanceof Error ? e.message : e); process.exitCode = 1; });

/* A3 상세 — 거절 제출물이 검증에서 어떻게 취급되는지 */
