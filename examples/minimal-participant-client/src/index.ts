/**
 * Participant Starter — 공식 API 연동 예제.
 *
 * 이 파일의 "연결 코드"는 실제로 동작합니다 (세션 생성 → 제출 → 검증 → 실행 →
 * Evidence 조회). 반대로 프로필·추천·승인·실행계획을 만드는 부분은 전부
 * participant.ts 의 TODO 스텁이며 참가팀이 직접 구현해야 합니다.
 *
 *   npm run dev    → participant.ts 구현을 사용 (미구현이면 안내 후 종료)
 *   npm run demo   → RUN_EXAMPLE=1, sandbox 정적 예제로 연결 왕복만 시연
 *
 * 환경변수: SIM_API_URL, ENV_ID, TEAM_ID
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { KioBridgeSimulationClient, type ParticipantSubmission } from "@kiobridge/participant-sdk";
import { buildSubmission } from "./participant.js";

const BASE_URL = process.env.SIM_API_URL ?? "http://localhost:4000";
const ENVIRONMENT_ID = process.env.ENV_ID ?? "sandbox";
const TEAM_ID = process.env.TEAM_ID ?? "TEAM-EXAMPLE";
const USE_EXAMPLE = process.env.RUN_EXAMPLE === "1";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** sandbox 만 완성 예제를 제공합니다. 공식 평가 환경의 정답은 공개되지 않습니다. */
function loadExampleSubmission(envId: string): ParticipantSubmission {
  if (envId !== "sandbox") {
    throw new Error(
      `RUN_EXAMPLE 은 sandbox 에서만 쓸 수 있습니다 (요청: ${envId}). ` +
        "공식 평가 환경의 완성 제출 예제는 제공되지 않습니다 — participant.ts 를 구현하세요.",
    );
  }
  const file = path.join(REPO_ROOT, "examples", "submission-format-example", "sandbox.json");
  const parsed = JSON.parse(readFileSync(file, "utf-8"));
  delete parsed._note;
  return parsed as ParticipantSubmission;
}

async function main() {
  const client = new KioBridgeSimulationClient({ baseUrl: BASE_URL });

  console.log(`[starter] Simulation API: ${BASE_URL}`);
  const fixture = await client.fixture(ENVIRONMENT_ID);
  console.log(`[starter] fixture: ${fixture.manifest.name} (후보 ${fixture.candidates.length}개)`);

  const submission = USE_EXAMPLE
    ? loadExampleSubmission(ENVIRONMENT_ID)
    : await buildSubmission(fixture, TEAM_ID);

  const session = await client.createSession(ENVIRONMENT_ID);
  console.log(`[starter] session: ${session.sessionId} status=${session.submissionStatus}`);

  await client.submit(session.sessionId, submission);
  const validation = await client.validate(session.sessionId);
  console.log(`[starter] validation: valid=${validation.valid}`, validation.errors);
  if (!validation.valid) {
    console.log("[starter] 이 도구는 오류를 대신 고치지 않습니다. 위 code/path 를 보고 직접 수정하세요.");
    process.exitCode = 1;
    return;
  }

  const result = await client.execute(session.sessionId);
  const ev = result.evidence;
  console.log(`[starter] SIMULATION ${ev?.result} (stopType=${ev?.stopType} reason=${ev?.stopReason})`);
  console.log("[starter] 이 결과는 계약·안전·상태 전환 검증만 의미합니다.");
  console.log("[starter] 추천 품질, 접근성 UX, 창의성은 별도 심사 대상입니다.");

  const evidence = await client.getEvidence(session.sessionId);
  console.log(`[starter] evidence runId=${evidence.runId} scope=${evidence.resultScope}`);
}

main().catch((err) => {
  console.error("[starter]", err.message ?? err);
  process.exitCode = 1;
});
