#!/usr/bin/env node
/**
 * Verifies every environment pack loads AND passes its integrity rules.
 *
 *   node tools/verify-environment-data.mjs [projectRoot]
 *
 * Catches the failures that would otherwise be silent: a legacy lowercase enum,
 * an attribute that drifted out of sync with its option list, a duplicate
 * candidate id, or a rule aimed at a key no candidate declares (a dead rule
 * looks exactly like a passing check).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

const script = `
import { discoverEnvironmentIds, loadEnvironmentPack, validateEnvironmentPack } from ${JSON.stringify(path.join(ROOT, "apps/simulation-api/src/loader.ts"))};
const ids = discoverEnvironmentIds();
const report = [];
let failed = 0;
for (const id of ids) {
  try {
    const pack = loadEnvironmentPack(id);
    const problems = validateEnvironmentPack(pack);
    report.push({ id, ok: problems.length === 0, problems,
      candidates: pack.candidates.length,
      rules: pack.compatibilityRules.rules.length,
      reviewFields: pack.reviewMapping.fields.length });
    if (problems.length) failed += 1;
  } catch (err) {
    report.push({ id, ok: false, problems: [String(err.message ?? err).split("\\n").slice(0, 6).join(" | ")] });
    failed += 1;
  }
}
console.log(JSON.stringify({ ids, report, failed }));
`;

let parsed;
try {
  const out = execFileSync(process.execPath, [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", script], {
    cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"],
  });
  parsed = JSON.parse(out.trim().split("\n").pop());
} catch (err) {
  console.error("ENVIRONMENT DATA VERIFICATION\n");
  console.error("환경팩을 로딩할 수 없습니다.\n");
  console.error(`${err.stdout ?? ""}${err.stderr ?? ""}`);
  process.exit(1);
}

console.log("ENVIRONMENT DATA VERIFICATION");
console.log("=".repeat(52));
for (const r of parsed.report) {
  const stat = r.ok ? "PASS" : "FAIL";
  console.log(`  ${stat}  ${r.id.padEnd(16)} 후보 ${String(r.candidates ?? "-").padStart(2)} · 규칙 ${String(r.rules ?? "-").padStart(2)} · review ${String(r.reviewFields ?? "-").padStart(2)}`);
  for (const p of r.problems) console.log(`         - ${p}`);
}
console.log("");

if (parsed.ids.length === 0) { console.error("환경팩을 찾을 수 없습니다."); process.exit(1); }
if (parsed.failed > 0) { console.error(`실패 ${parsed.failed}개 환경`); process.exit(1); }
console.log("모든 환경팩이 Canonical enum · 단일 진실 공급원 · 규칙 무결성 검사를 통과했습니다.");
