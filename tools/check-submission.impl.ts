/**
 * Implementation half of `npm run check:submission` (runs under tsx so the
 * workspace TypeScript packages resolve).
 *
 * Validates ONLY. Never generates, repairs or completes a submission.
 */
import { readFileSync } from "node:fs";
import type { ParticipantSubmission } from "@kiobridge/contracts";
import { runSubmission } from "@kiobridge/evaluator";
import { SimulationDriver } from "@kiobridge/simulation-driver";
import { loadEnvironmentPack } from "../apps/simulation-api/src/loader";
import { validateSubmission } from "../apps/simulation-api/src/validate";

const [environmentId, filePath, executeFlag] = process.argv.slice(2);
const submission = JSON.parse(readFileSync(filePath, "utf-8")) as ParticipantSubmission;

let pack;
try {
  pack = loadEnvironmentPack(environmentId);
} catch {
  console.error(`[오류] 알 수 없는 환경: ${environmentId}`);
  process.exit(2);
}

console.log("SUBMISSION CHECK");
console.log("================");
console.log(`  환경   : ${environmentId}`);
console.log(`  파일   : ${filePath}`);
console.log(`  team   : ${submission.teamId ?? "(없음)"}`);
console.log(`  계약   : ${submission.inputContractVersion ?? "(없음)"}\n`);

const validation = validateSubmission(pack, submission);

if (!validation.valid) {
  console.error(`검증 실패 — 오류 ${validation.errors.length}건\n`);
  for (const e of validation.errors) {
    console.error(`  [${e.code}] ${e.path}${e.actionIndex != null ? ` (action #${e.actionIndex})` : ""}`);
    console.error(`      ${e.message}`);
    if (e.allowedValues) console.error(`      허용값: ${e.allowedValues.join(", ")}`);
    if (e.receivedValue !== undefined) console.error(`      받은 값: ${JSON.stringify(e.receivedValue)}`);
  }
  console.error("\n이 도구는 누락된 Action 이나 옵션을 자동으로 채우지 않습니다. 직접 수정하세요.");
  process.exit(1);
}

console.log("검증 통과 (계약 · 스키마 · enum · PII · 상태 전환 · 안전경계)\n");

if (executeFlag !== "--execute") {
  console.log("Simulation Driver 재생까지 확인하려면 --execute 를 붙이세요.");
  process.exit(0);
}

const { evidence } = await runSubmission(pack, submission, {
  sessionId: "CHECK-SUBMISSION", submissionValid: true,
  validationErrors: validation.errors, driver: new SimulationDriver(),
});

console.log("SIMULATION VALIDATION");
console.log(`  resultScope              : ${evidence.resultScope}`);
console.log(`  result                   : ${evidence.result}`);
console.log(`  stopType                 : ${evidence.stopType}`);
console.log(`  boundaryReached          : ${evidence.boundaryReached}`);
console.log(`  requiredVerifierExecuted : ${evidence.requiredVerifierExecuted}`);
console.log(`  driver                   : ${evidence.driverId}`);
console.log("");
console.log("주의: 이 결과는 계약·안전·상태 전환 검증만 의미합니다.");
console.log("      추천 품질, 접근성 UX, 창의성과 최종 심사 점수를 의미하지 않습니다.");
process.exit(evidence.result === "PASS" ? 0 : 1);
