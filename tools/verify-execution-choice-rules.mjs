#!/usr/bin/env node
/**
 * Verifies each environment declares Stage-B rules — the ones that check what
 * the plan ACTUALLY selected, not just whether the candidate could have served.
 *
 *   node tools/verify-execution-choice-rules.mjs [projectRoot]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const ENV_DIR = path.join(ROOT, "environments");

/** Option groups each environment must re-check at execution time. */
const REQUIRED_TARGETS = {
  hospital: ["VISIT_TYPE", "APPOINTMENT", "DEPARTMENT"],
  "public-office": ["AUTH_METHOD"],
  "chicken-store": ["SERVICE_TYPE", "SPICY_LEVEL", "BONE_TYPE"],
};
const EXEC_SOURCES = new Set(["executionSelectedOption", "executionSelectedValue"]);
const EXEC_OPERATORS = new Set(["EQUALS_SELECTED", "CONTAINS_SELECTED"]);

const errors = [];
const perEnv = [];
const envIds = existsSync(ENV_DIR)
  ? readdirSync(ENV_DIR).filter((d) => statSync(path.join(ENV_DIR, d)).isDirectory())
  : [];

if (!existsSync(path.join(ROOT, "packages/evaluator/src/execution-choice-extractor.ts"))) {
  errors.push({ env: "-", message: "execution-choice-extractor.ts 가 없습니다." });
}

for (const env of envIds) {
  const file = path.join(ENV_DIR, env, "compatibility-rules.json");
  if (!existsSync(file)) { errors.push({ env, message: "compatibility-rules.json 이 없습니다." }); continue; }
  const doc = JSON.parse(readFileSync(file, "utf-8"));
  const rules = doc.rules ?? [];

  const exec = rules.filter((r) => {
    const src = r.target?.source ?? "";
    return r.evaluationScope === "EXECUTION_CHOICE" || EXEC_SOURCES.has(src);
  });
  const candidate = rules.length - exec.length;

  for (const r of exec) {
    if (!EXEC_SOURCES.has(r.target?.source)) errors.push({ env, message: `${r.ruleId}: 실행 선택 규칙은 execution* target 이어야 합니다.` });
    if (!EXEC_OPERATORS.has(r.operator)) errors.push({ env, message: `${r.ruleId}: 실행 선택 규칙 operator 는 EQUALS_SELECTED / CONTAINS_SELECTED 여야 합니다 (현재 ${r.operator}).` });
    if (!/^SELECTED_/.test(r.errorCode)) errors.push({ env, message: `${r.ruleId}: 실행 선택 오류코드는 SELECTED_ 로 시작해야 합니다 (현재 ${r.errorCode}).` });
    if (r.evaluationScope !== "EXECUTION_CHOICE") errors.push({ env, message: `${r.ruleId}: evaluationScope 를 EXECUTION_CHOICE 로 명시하세요.` });
  }

  const targets = new Set(exec.map((r) => r.target?.key));
  for (const need of REQUIRED_TARGETS[env] ?? []) {
    if (!targets.has(need)) errors.push({ env, message: `실행 선택 규칙 누락: ${need}` });
  }
  if ((REQUIRED_TARGETS[env] ?? []).length > 0 && exec.length === 0) {
    errors.push({ env, message: "실행 선택(Stage B) 규칙이 하나도 없습니다." });
  }

  // Error codes must be meaning-accurate, not recycled.
  for (const r of rules) {
    if (/SPICY|SIZE|BONE|CUP|QUANTITY/.test(r.ruleId) && /SERVICE_TYPE_MISMATCH$/.test(r.errorCode)) {
      errors.push({ env, message: `${r.ruleId}: SERVICE_TYPE 오류코드를 재사용합니다 (${r.errorCode}).` });
    }
  }
  perEnv.push({ env, candidate, exec: exec.length });
}

console.log("EXECUTION CHOICE RULE VERIFICATION");
console.log("=".repeat(52));
for (const e of perEnv) console.log(`  ${e.env.padEnd(16)} 후보 ${String(e.candidate).padStart(2)} · 실행선택 ${String(e.exec).padStart(2)}`);
console.log("");
if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) console.error(`  [${e.env}] ${e.message}`);
  process.exit(1);
}
console.log("모든 환경이 실행 선택(Stage B) 규칙을 선언하고 있습니다.");
