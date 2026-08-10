/**
 * 제출물 한 벌을 만든다.
 *
 * 실행: (API 가 :4000 에 떠 있어야 한다)
 *   npx tsx workspace/23C/build-submission.ts
 *
 * 지금까지 제출물은 데모 화면에서 «내려받기»로 만들었다. 그러면 두 가지가 곤란하다 —
 * 사람이 눌러야 하므로 재현이 안 되고, 어떤 답을 넣었는지가 파일에만 남아 기억에 의존한다.
 * 여기서는 답을 코드에 적어 두고 화면과 **같은 코어**로 조립한다.
 *
 * 조립 순서는 ui/src/logic.ts 의 buildUiSubmission 과 같고, 판정은 이 스크립트가 하지
 * 않는다 — 만들기만 하고, PASS/FAIL 은 공식 검증기(participant:validate --execute)가 낸다.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ParticipantSubmission, PublicFixture, UserDecision } from "@kiobridge/participant-sdk";
import { nowIso8601Utc } from "@kiobridge/profile-contract";
import { buildProfile, buildChickenContext } from "./src/core/canonical";
import { buildRecommendation, explainCore, alternativesFromRecommendation } from "./src/core/engine";
import { buildExecutionPlanCore } from "./src/core/plan";
import { buildContextSignals } from "./src/core/context";
import { buildAccessibilityEvidence, buildTeamExtensions, buildTeamMetadata } from "./src/core/submission-meta";

const API = "http://localhost:4000";
const TEAM = "23C";
const ENV = "chicken-store";
const OUT = fileURLToPath(new URL("./output/participant-submission.json", import.meta.url));

/**
 * 제출용 한 사람.
 *
 * 실재하지 않는 사람이며 어떤 실제 개인의 정보도 쓰지 않는다. 조건을 전부 말한
 * 정상 경로를 고른 이유는, 제출물이 «우리 서비스가 끝까지 갔을 때의 모습»이어야
 * 하기 때문이다. 안전 정지·재확인 경로는 verify-scenarios.ts 가 따로 확인한다.
 */
const ANSWERS = {
  allergies: ["땅콩"],
  spicyLevel: "매운맛",
  boneType: "순살",
  serviceType: "포장",
  quantity: 1,
  cupOption: "종이컵",
  budgetKrw: 7000,
} as const;

/**
 * 화면 설정 — 이 사람은 큰 글씨와 쉬운 말을 **직접 골랐다.**
 *
 * `_touchedA11y` 를 함께 넘기는 이유: 서비스는 이 둘을 켠 채로 시작하는데, 켜져 있다는
 * 이유만으로 «사용자가 선택했다»고 적으면 아무것도 고르지 않은 사람의 제출물에도 같은
 * 채널이 실린다. 무엇을 고른 사람인지 여기서 분명히 밝힌다.
 */
const A11Y = {
  largeText: true, highContrast: false, simpleSteps: true, visualGuidance: false,
  hearingSupport: false, mobilitySupport: false, staffAssistancePreferred: false,
  preferredInput: "TOUCH",
} as const;

async function main(): Promise<void> {
  const r = await fetch(`${API}/api/v1/environments/${ENV}/fixture`);
  if (!r.ok) throw new Error(`fixture 를 못 받았습니다 (HTTP ${r.status}) — npm run start:api 가 떠 있나요?`);
  const fixture = (await r.json()) as PublicFixture;

  const raw: Record<string, unknown> = {
    ...ANSWERS,
    allergies: [...ANSWERS.allergies],
    ...A11Y,
    _touchedA11y: ["largeText", "simpleSteps"],
    language: "ko-KR",
    storeProfile: false,
    _collectedVia: "WEB_FORM",
    _confirmedByUser: true,
  };

  const signals = buildContextSignals(fixture.candidates, new Date());
  const { ctx, engineCtx } = buildChickenContext(raw, signals);

  const rec = buildRecommendation(fixture.candidates, engineCtx);
  rec.recommendationReasons = explainCore(rec, engineCtx);
  rec.alternativeCandidateIds = alternativesFromRecommendation(fixture.candidates, rec);

  // 승인은 사용자가 하는 것이다. 여기서 true 인 이유는 화면에서 «네, 좋아요»를 누른
  // 상태를 그대로 옮긴 것이며, 승인 없이 실행계획이 만들어지지 않는다는 계약은 그대로다.
  const userDecision: UserDecision = {
    approved: true, decision: "APPROVE", confirmedAt: nowIso8601Utc(),
  };

  const submission = {
    inputContractVersion: "1.0.0",
    submissionVersion: "1.0.0",
    teamId: TEAM,
    environmentId: fixture.manifest.environmentId,
    profile: buildProfile(raw),
    sessionContext: ctx,
    recommendation: rec,
    userDecision,
    executionPlan: buildExecutionPlanCore(userDecision, rec, fixture, engineCtx),
    extensions: buildTeamExtensions(raw, signals),
    accessibilityEvidence: buildAccessibilityEvidence(raw),
    teamMetadata: buildTeamMetadata(fixture, TEAM),
  } as ParticipantSubmission;

  writeFileSync(OUT, JSON.stringify(submission, null, 2) + "\n", "utf-8");

  const plan = submission.executionPlan;
  console.log(`제출물을 만들었습니다 → ${OUT}`);
  console.log(`  추천 메뉴 : ${rec.recommendedCandidateId}`);
  console.log(`  제외된 후보: ${rec.excludedCandidates.length}개`);
  console.log(`  실행 계획 : ${plan.actions.length}단계 (마지막 ${plan.actions[plan.actions.length - 1]?.action})`);
  console.log(`  기기 명령 : ${plan.actualDeviceCommandSent}  (계약상 항상 false)`);
  console.log(`\n판정은 이 스크립트가 내지 않습니다. 다음으로 확인하세요:`);
  console.log(`  npm run participant:validate -- --file ${OUT} --execute`);
}

main().catch((e) => {
  console.error("실패:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
