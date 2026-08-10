/**
 * 답변 조합 전수 검증 — 사용자가 어떻게 답하든 유효한 실행계획이 나오는가.
 *
 * 실행:  npm run dev (또는 start:api)  →  npx tsx workspace/23C/verify-combinations.ts
 * 시나리오 정의: `키오브릿지-검증-시나리오.md`
 *
 * 질문은 7개 고정이므로 경로 분기는 없다. 대신 **답변 조합**이 만들어내는 실행계획이
 * 전부 전이표를 지키는지를 본다. 특히 "상관없어요"로 답한 축은 후보가 지원하는 값으로
 * 대신 채워지는데(plan.ts chooseOptionValue), 그 대체가 어떤 조합에서도 계획을 깨지
 * 않는지는 서버가 재생해 봐야 안다.
 *
 * 같은 계획을 수천 번 올릴 이유는 없다. 실행계획 서명으로 묶어 대표만 올린다.
 * 엔진 가중치·질문 구성·fixture 가 바뀌면 다시 돌린다.
 */
import type { ParticipantSubmission, PublicFixture, UserDecision } from "@kiobridge/participant-sdk";
import { nowIso8601Utc } from "@kiobridge/profile-contract";
import { buildProfile, buildChickenContext } from "./src/core/canonical";
import { buildRecommendation, explainCore, alternativesFromRecommendation } from "./src/core/engine";
import { buildExecutionPlanCore } from "./src/core/plan";
import { buildContextSignals } from "./src/core/context";
import { buildAccessibilityEvidence, buildTeamExtensions, buildTeamMetadata } from "./src/core/submission-meta";
import { allergensAnswered, isUnresolved } from "./src/core/ask";

const API = "http://localhost:4000";
const ENV = "chicken-store";
const TEAM = "23C";
/** 시간대 보너스를 배제해 재현 가능하게 고정한다 (한산한 시간) */
const NOW = new Date("2026-08-11T15:00:00+09:00");

/** ui/src/App.tsx QUESTIONS 와 같은 구성이어야 한다. */
const CHOICES = {
  allergies: [["없음"], ["땅콩"], ["땅콩", "콩"], ["땅콩", "콩", "우유", "계란", "밀", "새우"], ["모름"], ["땅콩", "모름"]],
  spicyLevel: ["순한맛", "보통", "매운맛", "상관없음"],
  boneType: ["순살", "뼈", "상관없음"],
  serviceType: ["포장", "매장", "상관없음"],
  quantity: [1, 2, 3],
  cupOption: ["종이컵", "일반컵", "없음", "상관없음"],
  budgetKrw: ["없음", 5000, 6000, 7000, 10000],
} as const;
const KEYS = Object.keys(CHOICES) as (keyof typeof CHOICES)[];

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

  const groups = new Map<string, { answers: Answers; count: number }>();
  let total = 0, allergyMissing = 0, reconfirm = 0, noCandidate = 0;
  const reconfirmSample: Answers[] = [];
  /* 「조건에 맞는 메뉴가 없음」 경로의 표본. 세기만 하고 넘어가면, 이 경로로 만든
     제출물이 계약을 지키는지는 아무도 모른 채 남는다. */
  const noCandidateSample: Answers[] = [];

  const walk = (i: number, acc: Answers): void => {
    if (i === KEYS.length) {
      total++;
      const { rec, engineCtx } = recFor(acc, fixture);

      // 질문이 고정이므로 늘 참이어야 한다 — 구성이 바뀌면 여기서 걸린다
      if (!allergensAnswered(engineCtx)) { allergyMissing++; return; }

      /* 순서가 중요하다. 후보가 없으면 confidence 가 바닥이라 requiresReconfirmation 도
         참이 되는데, 재확인을 먼저 세면 «후보 없음»이 영원히 0건으로 보인다.
         더 구체적인 상태를 먼저 센다. */
      if (rec.recommendedCandidateId === null) {
        noCandidate++;
        if (noCandidateSample.length === 0) noCandidateSample.push({ ...acc });
        return;
      }
      if (rec.requiresReconfirmation) { reconfirm++; if (reconfirmSample.length === 0) reconfirmSample.push({ ...acc }); return; }

      // 서버가 보는 것은 실행계획이다 — 같은 계획이면 같은 판정이므로 서명으로 묶는다
      const plan = buildExecutionPlanCore({ approved: true, decision: "APPROVE" }, rec, fixture, engineCtx);
      const sig = plan.actions.map((a) => {
        const t = a.target as { id?: string };
        return `${a.action}:${t?.id ?? "-"}`;
      }).join(" > ");
      const g = groups.get(sig);
      if (g) g.count++; else groups.set(sig, { answers: { ...acc }, count: 1 });
      return;
    }
    for (const v of CHOICES[KEYS[i]]) walk(i + 1, { ...acc, [KEYS[i]]: v });
  };
  walk(0, {});

  console.log(`조합 ${total.toLocaleString()}개 (질문 7개 고정 — 경로 분기 없음)`);
  console.log(`알레르기 미확인: ${allergyMissing}건 (0이어야 함)`);
  console.log(`재확인 필요(승인 불가): ${reconfirm.toLocaleString()}건`);
  console.log(`조건에 맞는 후보 없음: ${noCandidate.toLocaleString()}건`);
  console.log(`\n서로 다른 실행계획: ${groups.size}개 → 이것만 서버에 올린다\n`);

  let ok = 0; const bad: string[] = []; let i = 0;
  for (const [sig, g] of groups) {
    i++;
    const r = await replay(buildSubmission(g.answers, fixture, true));
    if (r.valid && passes(r.evidence)) ok++;
    else bad.push(`${sig}\n      answers=${JSON.stringify(g.answers)}\n      ` +
      (r.valid ? `result=${r.evidence?.result} stop=${r.evidence?.stopType}`
               : `검증거부 ${r.errors.map((e) => e.code + "@" + e.path).join(",")}`));
    if (i % 20 === 0) console.log(`  … ${i}/${groups.size}`);
  }
  console.log(`\n실행계획 ${groups.size}종 중 PASS ${ok}종`);
  if (bad.length) { console.log("\n❌ 실패:"); bad.forEach((b) => console.log("  - " + b)); }

  if (reconfirmSample.length > 0) {
    const sub = buildSubmission(reconfirmSample[0], fixture, false);
    const r = await replay(sub);
    console.log(`\n재확인 경로 표본: 계획 액션 ${sub.executionPlan.actions.length}개(0이어야 함) · ` +
      `검증 valid=${r.valid}${r.valid ? "" : ` (${r.errors.map((e) => e.code).join(",")})`}`);
  }

  if (noCandidateSample.length > 0) {
    const sub = buildSubmission(noCandidateSample[0], fixture, false);
    const r = await replay(sub);
    console.log(`\n후보 없음 경로 표본: 추천=${sub.recommendation.recommendedCandidateId}(null 이어야 함) · ` +
      `제외 ${sub.recommendation.excludedCandidates.length}개 · 계획 액션 ${sub.executionPlan.actions.length}개(0이어야 함) · ` +
      `검증 valid=${r.valid}${r.valid ? "" : ` (${r.errors.map((e) => e.code).join(",")})`}`);
    if (!r.valid || sub.executionPlan.actions.length !== 0 || sub.recommendation.recommendedCandidateId !== null) {
      bad.push("후보 없음 경로가 계약을 깨뜨립니다");
    }
  } else {
    bad.push("후보 없음 경로가 한 번도 나오지 않았습니다 — 예산 최저 선택지가 최저가보다 높지 않은지 보세요");
  }

  const verdict = allergyMissing === 0 && bad.length === 0;
  console.log(`\n${verdict ? "✅ 모든 조합이 계약을 지킨다" : "❌ 위반 조합이 있다"}`);
  if (!verdict) process.exitCode = 1;
}

main().catch((e) => { console.error("실패:", e instanceof Error ? e.message : e); process.exitCode = 1; });
