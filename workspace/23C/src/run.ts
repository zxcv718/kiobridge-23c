/**
 * CLI 러너 — input/raw-user-input.json → 9단계 → output/participant-submission.json
 *
 * 실행:  npx tsx workspace/23C/src/run.ts
 * 검증:  npm run participant:validate -- --file workspace/23C/output/participant-submission.json --execute
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { KioBridgeSimulationClient } from "@kiobridge/participant-sdk";
import { buildSubmission } from "./participant";

const TEAM_ID = "23C";
const ENVIRONMENT_ID = "chicken-store";
const BASE_URL = process.env.KIOBRIDGE_API_URL ?? "http://localhost:4000";

const outDir = fileURLToPath(new URL("../output/", import.meta.url));
const outFile = fileURLToPath(new URL("../output/participant-submission.json", import.meta.url));

async function main() {
  const client = new KioBridgeSimulationClient({ baseUrl: BASE_URL });
  const fixture = await client.getFixture(ENVIRONMENT_ID);
  const submission = await buildSubmission(fixture, TEAM_ID);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(submission, null, 2) + "\n", "utf-8");

  const rec = submission.recommendation;
  console.log(`[23C] 추천: ${rec.recommendedCandidateId ?? "(없음)"} · confidence ${rec.confidence} · 재확인 ${rec.requiresReconfirmation}`);
  console.log(`[23C] 이유 ${rec.recommendationReasons.length}건 · 제외 ${rec.excludedCandidates.length}건 · 대안 ${rec.alternativeCandidateIds.length}건`);
  console.log(`[23C] 결정: ${submission.userDecision.decision} · 액션 ${submission.executionPlan.actions.length}개`);
  console.log(`[23C] 저장: ${outFile}`);
}

main().catch((e) => {
  console.error("[23C] 실패:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
