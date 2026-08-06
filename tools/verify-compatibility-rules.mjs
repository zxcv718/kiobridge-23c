#!/usr/bin/env node
/**
 * Structural check of every environments/<env>/compatibility-rules.json.
 *
 *   node tools/verify-compatibility-rules.mjs [projectRoot]
 *
 * The deep semantic check (does any candidate actually declare this key?) runs
 * in verify-environment-data; this one is a fast, dependency-free gate that
 * works on a bare checkout.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const ENV_DIR = path.join(ROOT, "environments");

const SECTIONS = new Set(["facts", "preferences", "hardConstraints", "capabilities", "intent"]);
const CANDIDATE_SOURCES = new Set(["supportedOptions", "requirements", "attributes", "field"]);
/** New unified form; the legacy `candidate` form maps onto these. */
const TARGET_SOURCES = new Set([
  "candidateSupportedOptions", "candidateRequirements", "candidateAttributes", "candidateField",
  "executionSelectedOption", "executionSelectedValue",
]);
const LEGACY_TARGET_MAP = {
  supportedOptions: "candidateSupportedOptions",
  requirements: "candidateRequirements",
  attributes: "candidateAttributes",
  field: "candidateField",
};
const OPERATORS = new Set([
  "IN", "INTERSECTS", "EQUALS", "CONTAINS", "MAX", "DISJOINT",
  "CONTAINS_SELECTED", "EQUALS_SELECTED",
]);
const SCOPES = new Set(["CANDIDATE", "EXECUTION_CHOICE"]);
const SEVERITIES = new Set(["BLOCK", "WARN"]);
const UNKNOWN_POLICIES = new Set(["ALLOW", "RECONFIRM", "BLOCK", "IGNORE"]);
const ABSENT_MEANS = new Set(["NONE", "UNKNOWN"]);

/** Official codes, read from the contract so the two can never drift. */
const contractSrc = readFileSync(path.join(ROOT, "packages/contracts/src/index.ts"), "utf-8");
const block = contractSrc.slice(contractSrc.indexOf("export const VALIDATION_CODES"));
const OFFICIAL_CODES = new Set([...block.slice(0, block.indexOf("} as const;")).matchAll(/^\s*([A-Z_]+):/gm)].map((m) => m[1]));

const errors = [];
const envIds = existsSync(ENV_DIR)
  ? readdirSync(ENV_DIR).filter((d) => statSync(path.join(ENV_DIR, d)).isDirectory())
  : [];

let ruleCount = 0;
const perEnv = [];

for (const env of envIds) {
  const file = path.join(ENV_DIR, env, "compatibility-rules.json");
  if (!existsSync(file)) {
    errors.push({ env, message: "compatibility-rules.json 이 없습니다." });
    continue;
  }
  let doc;
  try { doc = JSON.parse(readFileSync(file, "utf-8")); }
  catch (err) { errors.push({ env, message: `JSON 파싱 실패: ${err.message}` }); continue; }

  if (doc.environmentId !== env) errors.push({ env, message: `environmentId 불일치: ${doc.environmentId}` });
  if (!doc.version) errors.push({ env, message: "version 이 없습니다." });
  if (!Array.isArray(doc.rules)) { errors.push({ env, message: "rules 가 배열이 아닙니다." }); continue; }

  const seen = new Set();
  for (const r of doc.rules) {
    ruleCount += 1;
    const at = `${env}/${r.ruleId ?? "(ruleId 없음)"}`;
    if (!r.ruleId) errors.push({ env, message: "ruleId 가 없습니다." });
    else if (seen.has(r.ruleId)) errors.push({ env, message: `중복 ruleId: ${r.ruleId}` });
    seen.add(r.ruleId);
    if (!SECTIONS.has(r.source?.section)) errors.push({ env, message: `${at}: 잘못된 source.section "${r.source?.section}"` });
    if (!r.source?.path) errors.push({ env, message: `${at}: source.path 가 없습니다.` });
    // A rule declares its target either in the new `target` form or the legacy
    // `candidate` form; exactly one of them must be present and valid.
    const t = r.target
      ? { source: r.target.source, key: r.target.key ?? r.target.path }
      : r.candidate
        ? { source: LEGACY_TARGET_MAP[r.candidate.source], key: r.candidate.key }
        : null;
    if (!t) errors.push({ env, message: `${at}: target 또는 candidate 가 필요합니다.` });
    else {
      if (!TARGET_SOURCES.has(t.source)) errors.push({ env, message: `${at}: 잘못된 target.source "${t.source}"` });
      if (!t.key) errors.push({ env, message: `${at}: target.key 가 없습니다.` });
      // Scope and target must agree, or Evidence would file the result wrongly.
      const inferred = String(t.source).startsWith("execution") ? "EXECUTION_CHOICE" : "CANDIDATE";
      if (r.evaluationScope !== undefined && !SCOPES.has(r.evaluationScope)) {
        errors.push({ env, message: `${at}: 잘못된 evaluationScope "${r.evaluationScope}"` });
      } else if (r.evaluationScope !== undefined && r.evaluationScope !== inferred) {
        errors.push({ env, message: `${at}: evaluationScope(${r.evaluationScope}) 와 target(${t.source}) 이 어긋납니다.` });
      }
      // Selection operators only make sense against a selected value.
      const selectionOperator = r.operator === "EQUALS_SELECTED" || r.operator === "CONTAINS_SELECTED";
      if (selectionOperator && inferred !== "EXECUTION_CHOICE") {
        errors.push({ env, message: `${at}: ${r.operator} 는 실행 선택 target 에만 쓸 수 있습니다.` });
      }
    }
    if (!OPERATORS.has(r.operator)) errors.push({ env, message: `${at}: 잘못된 operator "${r.operator}"` });
    if (!SEVERITIES.has(r.severity)) errors.push({ env, message: `${at}: 잘못된 severity "${r.severity}"` });
    if (!UNKNOWN_POLICIES.has(r.unknownPolicy)) errors.push({ env, message: `${at}: 잘못된 unknownPolicy "${r.unknownPolicy}"` });
    if (r.absentMeans !== undefined && !ABSENT_MEANS.has(r.absentMeans)) errors.push({ env, message: `${at}: 잘못된 absentMeans "${r.absentMeans}"` });
    if (!OFFICIAL_CODES.has(r.errorCode)) errors.push({ env, message: `${at}: 공식 오류코드가 아닙니다 "${r.errorCode}"` });
    if (r.minConfidence !== undefined && (typeof r.minConfidence !== "number" || r.minConfidence < 0 || r.minConfidence > 1)) {
      errors.push({ env, message: `${at}: minConfidence 는 0~1 이어야 합니다 (${r.minConfidence})` });
    }
    for (const key of Object.keys(r)) {
      if (key.startsWith("_")) errors.push({ env, message: `${at}: 임시 필드 "${key}" 를 제거하세요.` });
    }
  }
  perEnv.push({ env, rules: doc.rules.length });
}

console.log("COMPATIBILITY RULE VERIFICATION");
console.log("=".repeat(52));
for (const e of perEnv) console.log(`  ${e.env.padEnd(16)} 규칙 ${e.rules}개`);
console.log(`  합계 ${ruleCount}개 · 공식 오류코드 ${OFFICIAL_CODES.size}종`);
console.log("");

if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) console.error(`  [${e.env}] ${e.message}`);
  process.exit(1);
}
console.log("모든 호환규칙 선언이 유효합니다.");
