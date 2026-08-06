#!/usr/bin/env node
/**
 * Verifies every enum-ish value in every environment pack exists in an official
 * vocabulary or option group.
 *
 *   node tools/verify-vocabulary-membership.mjs [projectRoot]
 *
 * UPPER_SNAKE_CASE is spelling, not membership: "ANY" and "AUTO" look official
 * and mean nothing.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

const script = `
import path from "node:path";
import { discoverEnvironmentIds, loadEnvironmentPack, REPO_ROOT } from ${JSON.stringify(path.join(ROOT, "apps/simulation-api/src/loader.ts"))};
import { buildVocabularyRegistry, checkVocabularyMembership } from ${JSON.stringify(path.join(ROOT, "packages/evaluator/src/vocabulary-registry.ts"))};
const report = [];
let failed = 0;
for (const id of discoverEnvironmentIds()) {
  try {
    const pack = loadEnvironmentPack(id);
    const reg = buildVocabularyRegistry(id, path.join(REPO_ROOT, "schemas"), pack);
    const problems = checkVocabularyMembership(pack, reg);
    report.push({ id, ok: problems.length === 0, vocabulary: reg.all.size, groups: reg.byOptionGroup.size, problems });
    if (problems.length) failed += 1;
  } catch (err) {
    report.push({ id, ok: false, problems: [{ where: "load", value: "-", reason: String(err.message ?? err).split("\\n")[0] }] });
    failed += 1;
  }
}
console.log(JSON.stringify({ report, failed }));
`;

let parsed;
try {
  const out = execFileSync(process.execPath, [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", script], {
    cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"],
  });
  parsed = JSON.parse(out.trim().split("\n").pop());
} catch (err) {
  console.error("VOCABULARY MEMBERSHIP VERIFICATION\n");
  console.error("환경팩을 로딩할 수 없습니다.\n");
  console.error(`${err.stdout ?? ""}${err.stderr ?? ""}`);
  process.exit(1);
}

console.log("VOCABULARY MEMBERSHIP VERIFICATION");
console.log("=".repeat(52));
let unknown = 0;
for (const r of parsed.report) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(16)} 어휘 ${String(r.vocabulary ?? "-").padStart(3)} · 옵션그룹 ${r.groups ?? "-"}`);
  for (const p of r.problems ?? []) { console.log(`         - ${p.where} = "${p.value}" — ${p.reason}`); unknown += 1; }
}
console.log("");
console.log(`unknownVocabularyValues = ${unknown}`);
if (parsed.failed > 0) { console.error(`\n실패 ${parsed.failed}개 환경`); process.exit(1); }
console.log("모든 공식 값이 Vocabulary 또는 OptionGroup 에 존재합니다.");
