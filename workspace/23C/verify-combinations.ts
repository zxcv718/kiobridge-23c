/**
 * 조기 종료 전수 검증 — 질문 조합이 만들 수 있는 **모든 경로**를 열거한다.
 *
 * 실행:  npm run dev (또는 start:api)  →  npx tsx workspace/23C/verify-combinations.ts
 *
 * 왜 필요한가:
 *   조기 종료가 붙으면서 제출물이 하나가 아니라 "몇 번째 질문에서 멈췄는가"에 따라
 *   갈라진다. 지금까지는 대표 경로 두 개(7문항 / 3문항)만 서버로 확인했다.
 *   순서를 바꾸거나 임계값을 손보면 갈라지는 지점이 통째로 달라지므로,
 *   그때마다 이 스크립트로 바닥을 다시 다진다.
 *
 * 방법:
 *   1) 답변 조합을 전부 만들어 마법사(advance)와 **똑같은 순서로** 게이트를 돌린다
 *   2) 각 경로가 만들어내는 실행계획의 서명(액션 시퀀스)으로 묶는다
 *   3) 서로 다른 서명마다 대표 하나씩만 공식 서버에 올려 재생시킨다
 *      — 같은 계획을 수천 번 올릴 이유가 없다. 서버가 보는 것은 계획이다.
 */
import type { ParticipantSubmission, PublicFixture, UserDecision } from "@kiobridge/participant-sdk";
import { nowIso8601Utc } from "@kiobridge/profile-contract";
import { buildProfile, buildChickenContext } from "./src/core/canonical";
import { buildRecommendation, explainCore, alternativesFromRecommendation } from "./src/core/engine";
import { buildExecutionPlanCore } from "./src/core/plan";
import { buildContextSignals } from "./src/core/context";
import { buildAccessibilityEvidence, buildTeamExtensions, buildTeamMetadata } from "./src/core/submission-meta";
import { canStopAsking, allergensAnswered, isUnresolved } from "./src/core/ask";

const API = "http://localhost:4000";
const ENV = "chicken-store";
const TEAM = "23C";
/** 시간대 보너스를 배제해 재현 가능하게 고정한다 (한산한 시간) */
const NOW = new Date("2026-08-10T15:00:00+09:00");

/** ui/src/App.tsx QUESTIONS 와 **같은 순서**여야 한다 — 이 순서가 곧 검증 대상이다. */
const ORDER = ["allergies", "spicyLevel", "boneType", "serviceType", "quantity", "cupOption", "budgetKrw"] as const;

const CHOICES: Record<(typeof ORDER)[number], unknown[]> = {
  allergies: [["없음"], ["땅콩"], ["땅콩", "콩"], ["땅콩", "콩", "우유", "계란", "밀", "새우"], ["모름"], ["땅콩", "모름"]],
  spicyLevel: ["순한맛", "보통", "매운맛", "상관없음"],
  boneType: ["순살", "뼈", "상관없음"],
  serviceType: ["포장", "매장", "상관없음"],
  quantity: [1, 2, 3],
  cupOption: ["종이컵", "일반컵", "없음", "상관없음"],
  budgetKrw: ["없음", 6000, 7000, 10000],
};

type Answers = Record<string, unknown>;

/** ui/src/App.tsx buildRawInput 과 동일 */
function rawFrom(answers: Answers) {
  const allergies = (answers.allergies as string[] | undefined)?.filter((x) => x !== "없음");
  return {
    serviceType: answers.serviceType, spicyLevel: answers.spicyLevel, boneType: answers.boneType,
    cupOption: answers.cupOption, quantity: answers.quantity,
    allergies: answers.allergies === undefined ? undefined : allergies,
    budgetKrw: answers.budgetKrw === "없음" ? undefined : answers.budgetKrw,
    largeText: true, highContrast: false, simpleSteps: true, visualGuidance: false,
    hearingSupport: false, mobilitySupport: false, staffAssistancePreferred: false,
    preferredInput: "TOUCH", language: "ko-KR", storeProfile: false,
    _collectedVia: "WEB_FORM", _confirmedByUser: true,
  } as Record<string, unknown>;
}

function recFor(answers: Answers, fixture: PublicFixture) {
  const raw = rawFrom(answers);
  const signals = buildContextSignals(fixture.candidates, NOW);
  const { ctx, engineCtx } = buildChickenContext(raw, signals);
  engineCtx.now = NOW;
  const rec = buildRecommendation(fixture.candidates, engineCtx);
  rec.recommendationReasons = explainCore(rec, engineCtx);
  rec.alternativeCandidateIds = alternativesFromRecommendation(fixture.candidates, rec);
  return { raw, rec, ctx, engineCtx, signals };
}

/** 마법사 advance() 와 같은 순서로 게이트를 돌려 "어디서 멈추는지"를 재현한다. */
function walk(full: Answers, fixture: PublicFixture) {
  const answers: Answers = {};
  for (let i = 0; i < ORDER.length; i++) {
    answers[ORDER[i]] = full[ORDER[i]];
    if (i + 1 >= ORDER.length) break;              // 마지막 질문까지 답함
    const { rec, engineCtx } = recFor(answers, fixture);
    if (canStopAsking(rec, engineCtx)) break;      // 조기 종료
  }
  return { answers, askedCount: Object.keys(answers).length };
}

function buildSubmission(answers: Answers, fixture: PublicFixture, approved: boolean): ParticipantSubmission {
  const { raw, rec, ctx, engineCtx, signals } = recFor(answers, fixture);
  const decision: UserDecision = {
    approved, decision: approved ? "APPROVE" : "REJECT", confirmedAt: nowIso8601Utc(),
  };
  return {
    inputContractVersion: "1.0.0", submissionVersion: "1.0.0",
    teamId: TEAM, environmentId: fixture.manifest.environmentId,
    profile: buildProfile(raw), sessionContext: ctx, recommendation: rec,
    userDecision: decision, executionPlan: buildExecutionPlanCore(decision, rec, fixture, engineCtx),
    extensions: buildTeamExtensions(raw, signals),
    accessibilityEvidence: buildAccessibilityEvidence(raw),
    teamMetadata: buildTeamMetadata(fixture, TEAM),
  } as ParticipantSubmission;
}

const j = async <T>(r: Response): Promise<T> => {
  const b = await r.json().catch(() => undefined);
  if (!r.ok) throw new Error((b as { error?: string })?.error ?? `HTTP ${r.status}`);
  return b as T;
};

async function replay(submission: ParticipantSubmission) {
  const s = await j<{ sessionId: string }>(await fetch(`${API}/api/v1/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ environmentId: ENV }) }));
  await j(await fetch(`${API}/api/v1/sessions/${s.sessionId}/submission`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submission) }));
  const v = await j<{ valid: boolean; errors?: { code: string; path: string }[] }>(
    await fetch(`${API}/api/v1/sessions/${s.sessionId}/validate`, { method: "POST" }));
  if (!v.valid) return { valid: false, errors: v.errors ?? [], evidence: undefined as Record<string, unknown> | undefined };
  await j(await fetch(`${API}/api/v1/sessions/${s.sessionId}/execute`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }));
  const evidence = await j<Record<string, unknown>>(await fetch(`${API}/api/v1/sessions/${s.sessionId}/evidence`));
  return { valid: true, errors: [], evidence };
}

const passes = (ev?: Record<string, unknown>) =>
  !!ev && ev.result === "PASS" && ev.stopType === "NORMAL_BOUNDARY_STOP" &&
  ev.boundaryReached === true && ev.requiredVerifierExecuted === true &&
  ev.plannedPaymentActionCount === 0 && ev.executedPaymentActionCount === 0 &&
  ev.actualDeviceCommandSent === false;

async function main() {
  const fixture = await j<PublicFixture>(await fetch(`${API}/api/v1/environments/${ENV}/fixture`));

  /* ── 1) 전 조합 열거 + 게이트 재현 ── */
  const groups = new Map<string, { answers: Answers; askedCount: number; count: number }>();
  const stopHistogram = new Map<number, number>();
  const noRecommendation: Answers[] = [];
  const needsReconfirm: Answers[] = [];
  let total = 0;
  let allergyMissing = 0;

  const keys = ORDER;
  const rec2 = (i: number, acc: Answers): void => {
    if (i === keys.length) {
      total++;
      const { answers, askedCount } = walk(acc, fixture);

      // 불변식: 어떤 경로에서도 알레르기는 반드시 물어봤어야 한다
      const { rec, engineCtx } = recFor(answers, fixture);
      if (!allergensAnswered(engineCtx)) { allergyMissing++; return; }

      stopHistogram.set(askedCount, (stopHistogram.get(askedCount) ?? 0) + 1);

      if (rec.requiresReconfirmation) { needsReconfirm.push(answers); return; }
      if (rec.recommendedCandidateId === null) { noRecommendation.push(answers); return; }

      // 서버가 보는 것은 실행계획이다 — 같은 계획이면 같은 판정이므로 서명으로 묶는다
      const plan = buildExecutionPlanCore(
        { approved: true, decision: "APPROVE" }, rec, fixture, engineCtx);
      const sig = plan.actions.map((a) => {
        const t = a.target as { id?: string };
        return `${a.action}:${t?.id ?? "-"}`;
      }).join(" > ");
      const g = groups.get(sig);
      if (g) g.count++;
      else groups.set(sig, { answers, askedCount, count: 1 });
      return;
    }
    for (const v of CHOICES[keys[i]]) rec2(i + 1, { ...acc, [keys[i]]: v });
  };
  rec2(0, {});

  console.log(`조합 ${total.toLocaleString()}개 열거`);
  console.log(`알레르기 미확인 상태로 끝난 경로: ${allergyMissing}건 (0이어야 함)`);
  console.log(`재확인 필요(승인 불가): ${needsReconfirm.length.toLocaleString()}건`);
  console.log(`조건에 맞는 후보 없음: ${noRecommendation.length.toLocaleString()}건`);
  console.log("\n몇 문항 만에 멈췄나:");
  [...stopHistogram.entries()].sort((a, b) => a[0] - b[0])
    .forEach(([k, v]) => console.log(`  ${k}문항  ${String(v).padStart(6)}건`));
  console.log(`\n서로 다른 실행계획: ${groups.size}개 → 이것만 서버에 올린다\n`);

  /* ── 2) 서명별 대표를 공식 서버에 재생 ── */
  let ok = 0; const bad: string[] = [];
  let i = 0;
  for (const [sig, g] of groups) {
    i++;
    const sub = buildSubmission(g.answers, fixture, true);
    const r = await replay(sub);
    const good = r.valid && passes(r.evidence);
    if (good) ok++;
    else bad.push(`${sig}\n      answers=${JSON.stringify(g.answers)}\n      ${r.valid ? `result=${r.evidence?.result} stop=${r.evidence?.stopType}` : `검증거부 ${r.errors.map((e) => e.code + "@" + e.path).join(",")}`}`);
    if (i % 10 === 0) console.log(`  … ${i}/${groups.size}`);
  }
  console.log(`\n실행계획 ${groups.size}종 중 PASS ${ok}종`);
  if (bad.length) { console.log("\n❌ 실패:"); bad.forEach((b) => console.log("  - " + b)); }

  /* ── 3) 승인 불가 경로도 서버가 막는지 표본 확인 ── */
  if (needsReconfirm.length > 0) {
    const sub = buildSubmission(needsReconfirm[0], fixture, false);
    const r = await replay(sub);
    console.log(`\n재확인 경로 표본: 계획 액션 ${sub.executionPlan.actions.length}개(0이어야 함) · ` +
      `검증 valid=${r.valid}${r.valid ? "" : ` (${r.errors.map((e) => e.code).join(",")})`}`);
  }

  const verdict = allergyMissing === 0 && bad.length === 0;
  console.log(`\n${verdict ? "✅ 모든 경로가 계약을 지킨다" : "❌ 위반 경로가 있다"}`);
  if (!verdict) process.exitCode = 1;
}

main().catch((e) => { console.error("실패:", e instanceof Error ? e.message : e); process.exitCode = 1; });
