#!/usr/bin/env node
/**
 * Verifies the Canonical Input timestamp policy is wired end to end.
 *
 *   node tools/verify-canonical-timestamps.mjs [projectRoot]
 *
 * The failure this guards against was silent: AJV had no format handlers, so
 * every `format` keyword in the schemas was ignored and "not-a-date" validated
 * cleanly through the API, the CLI and the SDK alike.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf-8");
const exists = (rel) => existsSync(path.join(ROOT, rel));

const FORMAT_NAME = "iso-8601-utc";
const SHARED_SCHEMA = "schemas/core/iso-8601-utc.schema.json";
/** The three participant-supplied timestamps governed by the policy. */
const FIELDS = [
  ["schemas/core/canonical-profile.schema.json", ["properties", "source", "properties", "collectedAt"], "profile.source.collectedAt"],
  ["schemas/core/field-metadata.schema.json", ["properties", "capturedAt"], "sessionContext.fieldMetadata.*.capturedAt"],
  ["schemas/core/user-decision.schema.json", ["properties", "confirmedAt"], "userDecision.confirmedAt"],
];
/** UTC instant, capital Z, optional fraction. */
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", "release", ".git", "playwright-report", "test-results", "__MACOSX",
]);
/**
 * Files that intentionally contain rejected values: the timestamp test suite
 * and migration docs showing the old form. Everything else must be valid.
 */
const INTENTIONAL_BAD = [
  "tests/public/contracts/timestamp.test.ts",
  "docs/MIGRATION_FROM_V4.md",
  "packages/profile-contract/src/timestamp.ts",
  "packages/profile-contract/src/legacy-v4-adapter.ts",
  "tools/verify-canonical-timestamps.mjs",
];

const errors = [];
const notes = [];

/* 1. shared definition exists and declares the custom format */
if (!exists(SHARED_SCHEMA)) errors.push(`${SHARED_SCHEMA} 이 없습니다 (공통 정의).`);
else {
  const shared = JSON.parse(read(SHARED_SCHEMA));
  if (shared.format !== FORMAT_NAME) errors.push(`${SHARED_SCHEMA} 의 format 이 ${FORMAT_NAME} 이 아닙니다.`);
  if (shared.type !== "string") errors.push(`${SHARED_SCHEMA} 의 type 이 string 이 아닙니다.`);
  notes.push(`공통 정의: ${SHARED_SCHEMA} (format=${shared.format})`);
}

/* 2. the three fields all $ref the shared definition — no duplicate date-time */
for (const [file, keys, label] of FIELDS) {
  if (!exists(file)) { errors.push(`${file} 이 없습니다.`); continue; }
  let cur = JSON.parse(read(file));
  for (const k of keys) {
    cur = cur?.[k];
    if (cur === undefined) break;
  }
  if (cur === undefined) { errors.push(`${label}: 스키마에서 필드를 찾을 수 없습니다.`); continue; }
  if (cur.$ref !== `https://kiobridge.local/schemas/core/${path.basename(SHARED_SCHEMA)}`) {
    errors.push(`${label}: 공통 정의를 $ref 하지 않습니다 (${JSON.stringify(cur).slice(0, 80)}).`);
  }
}

/* 3. no stale date-time declarations anywhere in schemas */
const staleDateTime = [];
(function scanSchemas(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const fp = path.join(dir, entry);
    if (statSync(fp).isDirectory()) { scanSchemas(fp); continue; }
    if (!entry.endsWith(".json")) continue;
    if (readFileSync(fp, "utf-8").includes('"format": "date-time"')) staleDateTime.push(path.relative(ROOT, fp));
  }
})(path.join(ROOT, "schemas"));
if (staleDateTime.length > 0) {
  errors.push(`남은 date-time 선언 ${staleDateTime.length}건: ${staleDateTime.join(", ")}`);
}

/* 4. AJV factory registers formats, and nothing builds a bare Ajv */
const FACTORY = "packages/profile-contract/src/create-ajv.ts";
if (!exists(FACTORY)) errors.push(`${FACTORY} 이 없습니다 (공통 AJV factory).`);
else {
  const f = read(FACTORY);
  if (!f.includes("ajv-formats")) errors.push("AJV factory 가 ajv-formats 를 등록하지 않습니다.");
  if (!f.includes(`addFormat("${FORMAT_NAME}"`) && !f.includes(`addFormat(UTC_TIMESTAMP_FORMAT_NAME`)) {
    errors.push(`AJV factory 가 ${FORMAT_NAME} custom format 을 등록하지 않습니다.`);
  }
  notes.push(`AJV factory: ${FACTORY}`);
}

const bareAjv = [];
(function scanSource(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fp = path.join(dir, entry);
    if (statSync(fp).isDirectory()) { scanSource(fp); continue; }
    if (!/\.(ts|tsx|mjs|js)$/.test(entry)) continue;
    const rel = path.relative(ROOT, fp);
    // The factory itself, and its generated mirror inside the participant SDK
    // deliverable, are the same file — not a second, unconfigured instance.
    if (rel === FACTORY || rel.endsWith(path.basename(FACTORY))) continue;
    if (/new\s+Ajv\s*\(/.test(readFileSync(fp, "utf-8"))) bareAjv.push(rel);
  }
})(ROOT);
if (bareAjv.length > 0) {
  errors.push(`공통 factory 를 쓰지 않고 AJV 를 직접 생성: ${bareAjv.join(", ")}`);
}

/* 5. ajv-formats is a declared dependency and locked */
const pkgFiles = ["packages/profile-contract/package.json"];
if (!pkgFiles.some((f) => exists(f) && JSON.parse(read(f)).dependencies?.["ajv-formats"])) {
  errors.push("ajv-formats 가 정식 의존성으로 선언되지 않았습니다.");
}
if (!read("package-lock.json").includes("ajv-formats")) {
  errors.push("package-lock.json 에 ajv-formats 가 없습니다.");
}

/* 6. the hand-written validators check all three fields */
const validator = exists("packages/profile-contract/src/validator.ts") ? read("packages/profile-contract/src/validator.ts") : "";
for (const [needle, label] of [
  ["source/collectedAt", "collectedAt"],
  ["capturedAt", "capturedAt"],
  ["confirmedAt", "confirmedAt"],
]) {
  if (!validator.includes(needle)) errors.push(`직접 Validator 가 ${label} 을 검사하지 않습니다.`);
}
if (!validator.includes("checkTimestamp")) errors.push("직접 Validator 가 공통 timestamp 검사를 쓰지 않습니다.");
if (!exists("packages/profile-contract/src/timestamp.ts")) errors.push("timestamp 유틸리티가 없습니다.");

/* 7. required tests exist */
for (const t of ["tests/public/contracts/timestamp.test.ts"]) {
  if (!exists(t)) errors.push(`${t} 이 없습니다.`);
}
if (exists("tests/public/contracts/timestamp.test.ts")) {
  const t = read("tests/public/contracts/timestamp.test.ts");
  for (const [needle, label] of [
    ["unknown format", "AJV unknown format 경고 회귀 테스트"],
    ["/profile/source/collectedAt", "collectedAt 필드 테스트"],
    ["capturedAt", "capturedAt 필드 테스트"],
    ["/userDecision/confirmedAt", "confirmedAt 필드 테스트"],
    ["check-submission.mjs", "CLI 교차 채널 테스트"],
  ]) {
    if (!t.includes(needle)) errors.push(`timestamp 테스트에 ${label} 이 없습니다.`);
  }
}

/* 8. every Canonical example timestamp is a real UTC instant */
const RE = /"(collectedAt|capturedAt|confirmedAt)"\s*:\s*"([^"]*)"/g;
const badExamples = [];
let scanned = 0;
(function scanExamples(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fp = path.join(dir, entry);
    if (statSync(fp).isDirectory()) { scanExamples(fp); continue; }
    if (!/\.(json|md|ts|tsx)$/.test(entry)) continue;
    const rel = path.relative(ROOT, fp);
    if (INTENTIONAL_BAD.includes(rel)) continue;
    const text = readFileSync(fp, "utf-8");
    let m; RE.lastIndex = 0;
    while ((m = RE.exec(text)) !== null) {
      scanned += 1;
      if (!UTC.test(m[2])) badExamples.push(`${rel}: ${m[1]} = "${m[2]}"`);
    }
  }
})(ROOT);
if (badExamples.length > 0) {
  errors.push(`공식 예제에 비UTC timestamp ${badExamples.length}건: ${badExamples.slice(0, 5).join(" | ")}`);
}

/* 9. release chain runs this verifier */
const scripts = JSON.parse(read("package.json")).scripts ?? {};
if (!scripts["verify:canonical-timestamps"]) errors.push("verify:canonical-timestamps script 가 없습니다.");
if (!(scripts["release:verify"] ?? "").includes("verify:canonical-timestamps")) {
  errors.push("release:verify 가 verify:canonical-timestamps 를 호출하지 않습니다.");
}

console.log("CANONICAL TIMESTAMP VERIFICATION");
console.log("=".repeat(52));
for (const n of notes) console.log(`  ${n}`);
console.log(`  적용 필드   : ${FIELDS.map(([, , l]) => l).join(", ")}`);
console.log(`  허용 형식   : YYYY-MM-DDTHH:mm:ss(.fraction)?Z`);
console.log(`  검사한 예제 : ${scanned}건 · 비UTC ${badExamples.length}건`);
console.log(`  남은 date-time 선언 : ${staleDateTime.length}건`);
console.log("");

if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("Canonical timestamp 정책이 스키마·Validator·AJV·예제·테스트에 일관되게 적용되어 있습니다.");
