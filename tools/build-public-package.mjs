#!/usr/bin/env node
/**
 * Builds the public release ZIP using an ALLOW-LIST STAGING approach.
 *
 * Rather than zipping the working tree with exclude patterns (which is how
 * node_modules/dist/__MACOSX leaked into earlier releases), this copies only
 * explicitly permitted files into a clean staging directory, re-checks that
 * directory, zips it, and then re-inspects the ZIP's own entry list.
 *
 * Output:
 *   release/kiobridge-simulation-kit-v<version>/          (staging = exact ZIP contents)
 *   release/kiobridge-simulation-kit-v<version>-public.zip
 *   release/kiobridge-simulation-kit-v<version>-public.zip.sha256
 *   release/SHARE_THIS_ZIP.txt                            (배포 안내)
 *
 * <version> 은 package.json 의 version 을 그대로 씁니다.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { generateWindowsFinalChecklist, CHECKLIST_BASENAME, TEMPLATE_PATH } from "./lib/windows-checklist.mjs";
import {
  ALLOWED_STAGING_ONLY, CRITICAL_FILES, GENERATED_IN_PACKAGE,
  compare, hashTree, listFiles, snapshotDigest, sourceCopiedFiles,
} from "./lib/package-parity.mjs";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = path.join(ROOT, "release");
const PRODUCT_VERSION = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8")).version;
const PROJECT_NAME = `kiobridge-simulation-kit-v${PRODUCT_VERSION}`;
/** Participant Edition: same contents, a name teams recognise. */
const EDITION = process.env.KIO_EDITION === "participant" ? "participant" : "public";
const CONTRACT_VERSION = "1.0.0";
const STAGING = path.join(RELEASE_DIR, PROJECT_NAME);
const ZIP_NAME = `${PROJECT_NAME}-${EDITION}.zip`;
const ZIP_PATH = path.join(RELEASE_DIR, ZIP_NAME);

/** Files copied individually from the project root. */
const ROOT_FILES = [
  "package.json", "package-lock.json",
  "00_START_HERE.html", "00_START_HERE.md",
  "PARTICIPANT_CHECKLIST.md", "FINAL_SUBMISSION_CHECKLIST.md",
  "DO_NOT_EDIT_PLATFORM_FILES.md", "official-package-manifest.json",
  "README.md", "README_FIRST.md",
  "compose.yaml", "Dockerfile",
  ".gitignore", ".dockerignore",
  "tsconfig.json", "tsconfig.base.json",
  "vitest.config.ts", "playwright.config.ts",
  "start-macos.command", "start-windows.bat", "start-linux.sh",
  "stop-macos.command", "stop-windows.bat", "stop-linux.sh",
];

/** Directory trees copied wholesale (filtered by DENY rules below). */
const ROOT_DIRS = [
  "apps", "packages", "environments", "schemas",
  "examples", "docs", "tools", "tests", "extensions",
  "participant-deliverables", "participant-workspace", ".devcontainer",
];

/** Never copied, at any depth. */
/** 배포본에 넣지 않는 경로. 회귀 fixture 는 소스에만 둡니다. */
const DENY_PATH_PREFIXES = ["tests/fixtures/"];

/** 운영진 릴리스 전용 테스트. 참가팀 트리에서는 성립하지 않습니다. */
const DENY_EXACT_PATHS = new Set([
  "tests/contract/package-source-parity.test.ts",
  "tests/contract/windows-checklist-packaging.test.ts",
]);

const DENY_DIRS = new Set([
  "node_modules", "dist", "build", "coverage",
  "playwright-report", "test-results", "__MACOSX", "screenshots", "traces", "videos",
  "ms-playwright", "blob-report",
  ".git", ".tmp", ".cache", "release", ".build", ".release-tmp",
  "hidden-profiles", "hidden-scenarios", "expected-results",
  "private-tests", "kiobridge-private-evaluation",
]);
const DENY_FILES = new Set([".DS_Store", ".env", ".env.local", "npm-debug.log", "DO_NOT_SHARE_THIS_FOLDER.md"]);
const DENY_PATTERNS = [/\.log$/i, /^\.env\..*/i];

const denied = (name, isDir) => isDir
  ? DENY_DIRS.has(name)
  : DENY_FILES.has(name) || DENY_PATTERNS.some((re) => re.test(name));

function copyTree(src, dest) {
  const rel = path.relative(ROOT, src).split(path.sep).join("/");
  if (DENY_PATH_PREFIXES.some((prefix) => rel === prefix.replace(/\/$/, "") || rel.startsWith(prefix))) return;
  if (DENY_EXACT_PATHS.has(rel)) return;
  const stats = statSync(src);
  if (stats.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      if (denied(entry.name, entry.isDirectory())) continue;
      copyTree(path.join(src, entry.name), path.join(dest, entry.name));
    }
  } else {
    cpSync(src, dest);
  }
}

function run(cmd, args, cwd = ROOT) {
  return execFileSync(cmd, args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function fail(msg) {
  console.error(`\n[패키징 실패] ${msg}\n`);
  process.exit(1);
}

console.log("PUBLIC PACKAGE BUILD");
console.log("====================\n");

// 1. contract deliverables must be in sync before anything is packaged.
console.log("1) 계약자료 동기화 확인…");
try {
  run(process.execPath, [path.join(ROOT, "tools", "check-contract-drift.mjs")]);
  console.log("   OK — drift 없음");
} catch (err) {
  fail(`계약자료가 원본과 다릅니다. 먼저 \`npm run sync:contracts\` 를 실행하세요.\n${err.stdout ?? ""}${err.stderr ?? ""}`);
}

// 1b. usability gates: broken docs / bad commands / Unix-only .bat / stale E2E.
console.log("1b) 사용성 검사 (문서 링크 · npm 명령 · Windows · E2E · 릴리스 체인)…");
for (const [tool, label] of [
  ["verify-environment-data.mjs", "환경팩 데이터 무결성"],
  ["verify-execution-choice-rules.mjs", "실행 선택 규칙"],
  ["verify-vocabulary-membership.mjs", "Vocabulary membership"],
  ["verify-review-item-labels.mjs", "검토 배열 라벨"],
  ["verify-canonical-timestamps.mjs", "Canonical timestamp 정책"],
  ["verify-participant-onboarding.mjs", "참가팀 온보딩 경로"],
  ["verify-public-environment-api.mjs", "공개 환경 API"],
  ["verify-compatibility-rules.mjs", "호환규칙 선언"],
  ["verify-review-mappings.mjs", "검토화면 매핑"],
  ["verify-doc-links.mjs", "문서 로컬 링크"],
  ["verify-documented-scripts.mjs", "문서 npm 명령"],
  ["verify-windows-scripts.mjs", "Windows 배치 (정적)"],
  ["verify-e2e-references.mjs", "E2E 참조 파일"],
  ["verify-release-chain.mjs", "릴리스 체인"],
]) {
  try {
    run(process.execPath, [path.join(ROOT, "tools", tool)]);
    console.log(`   OK — ${label}`);
  } catch (err) {
    fail(`${label} 검사 실패\n${err.stdout ?? ""}${err.stderr ?? ""}`);
  }
}

// 1c. Regenerate the Windows checklist from its single template BEFORE anything
//     else. v5.1.1 shipped a hand-made release/ copy that never reached the ZIP;
//     now both copies come from one render, so they cannot disagree.
console.log("1c) Windows 최종 체크리스트 생성…");
let WINDOWS_CHECKLIST;
try {
  if (!existsSync(TEMPLATE_PATH)) fail(`체크리스트 원본이 없습니다: ${path.relative(ROOT, TEMPLATE_PATH)}`);
  WINDOWS_CHECKLIST = generateWindowsFinalChecklist({
    productVersion: PRODUCT_VERSION,
    inputContractVersion: CONTRACT_VERSION,
    edition: EDITION,
  });
  writeFileSync(path.join(ROOT, CHECKLIST_BASENAME), WINDOWS_CHECKLIST);
  console.log(`   OK — ${CHECKLIST_BASENAME} ${Buffer.byteLength(WINDOWS_CHECKLIST)} bytes`);
} catch (err) {
  fail(`체크리스트 생성 실패\n${err.message ?? err}`);
}

// 2. required files present in the source tree.
console.log("2) 필수 파일 확인…");
for (const f of ["package.json", "package-lock.json", "README_FIRST.md", "playwright.config.ts",
  "start-macos.command", "start-windows.bat", "start-linux.sh"]) {
  if (!existsSync(path.join(ROOT, f))) fail(`필수 파일 없음: ${f}`);
}
console.log("   OK");

// 2b. Snapshot the source we are about to ship. v5.1.3 shipped a ZIP built
//     before the last source edit; nothing noticed because every check looked
//     only *inside* the ZIP. From here on, the source is pinned.
console.log("2b) 배포 대상 소스 스냅샷…");
const SOURCE_FILES = sourceCopiedFiles(ROOT);
const SOURCE_BEFORE = hashTree(ROOT, SOURCE_FILES);
const SOURCE_DIGEST = snapshotDigest(SOURCE_BEFORE);
const BUILD_DIR = path.join(ROOT, ".build");
mkdirSync(BUILD_DIR, { recursive: true });
const SNAPSHOT_PATH = path.join(BUILD_DIR, "package-source-snapshot.json");
const BUILT_AT = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
writeFileSync(SNAPSHOT_PATH, JSON.stringify({
  createdAt: BUILT_AT,
  productVersion: PRODUCT_VERSION,
  inputContractVersion: CONTRACT_VERSION,
  edition: EDITION,
  sourceSnapshotSha256: SOURCE_DIGEST,
  fileCount: Object.keys(SOURCE_BEFORE).length,
  files: Object.keys(SOURCE_BEFORE).sort().map((p) => ({ path: p, ...SOURCE_BEFORE[p] })),
}, null, 2) + "\n");
console.log(`   OK — ${Object.keys(SOURCE_BEFORE).length}개 파일 · ${SOURCE_DIGEST.slice(0, 16)}…`);

// 3. clean staging. Old ZIPs are removed so only ONE artefact is shareable.
console.log("3) staging 폴더 생성…");
if (existsSync(RELEASE_DIR)) {
  for (const entry of readdirSync(RELEASE_DIR)) {
    const keep = entry === PROJECT_NAME || entry === ZIP_NAME
      || entry === `${ZIP_NAME}.sha256` || entry === "SHARE_THIS_ZIP.txt"
      || entry === "WINDOWS_FINAL_CHECKLIST.md" || entry === "PARTICIPANT_DISTRIBUTION_GUIDE.md"
      || entry === `RELEASE_NOTES_v${PRODUCT_VERSION}.md`;
    if (!keep) rmSync(path.join(RELEASE_DIR, entry), { recursive: true, force: true });
  }
}
rmSync(STAGING, { recursive: true, force: true });
mkdirSync(STAGING, { recursive: true });

for (const f of ROOT_FILES) {
  const src = path.join(ROOT, f);
  if (existsSync(src)) cpSync(src, path.join(STAGING, f));
}
// Team folders ship as empty scaffolding with their README, never with output.
for (const dir of ["workspace", "submission-output"]) {
  mkdirSync(path.join(STAGING, dir), { recursive: true });
  const readme = path.join(ROOT, dir, "README.md");
  if (existsSync(readme)) cpSync(readme, path.join(STAGING, dir, "README.md"));
  writeFileSync(path.join(STAGING, dir, ".gitkeep"), "");
}
for (const d of ROOT_DIRS) {
  const src = path.join(ROOT, d);
  if (existsSync(src)) copyTree(src, path.join(STAGING, d));
}
// keep the executable bit for shell launchers
for (const f of ["start-macos.command", "start-linux.sh", "stop-macos.command", "stop-linux.sh"]) {
  const p = path.join(STAGING, f);
  if (existsSync(p)) chmodSync(p, 0o755);
}

// 3b. The checklist lands at the ZIP ROOT — never under a release/ folder.
//     Written from the same render as the organiser copy, so the bytes match.
writeFileSync(path.join(STAGING, CHECKLIST_BASENAME), WINDOWS_CHECKLIST);
writeFileSync(path.join(RELEASE_DIR, CHECKLIST_BASENAME), WINDOWS_CHECKLIST);
{
  const a = createHash("sha256").update(readFileSync(path.join(STAGING, CHECKLIST_BASENAME))).digest("hex");
  const b = createHash("sha256").update(readFileSync(path.join(RELEASE_DIR, CHECKLIST_BASENAME))).digest("hex");
  if (a !== b) fail(`체크리스트 두 사본의 SHA 가 다릅니다:\n  staging ${a}\n  release ${b}`);
  console.log(`   OK — 체크리스트 SHA 일치 ${a.slice(0, 16)}…`);
}

// 3c. source ↔ staging parity, BEFORE the manifest describes the tree.
//     A copy step that silently drops or rewrites a file is exactly what we are
//     guarding against, so we measure it rather than assume it.
console.log("3c) source ↔ staging parity…");
{
  const stagingFiles = listFiles(STAGING)
    .filter((f) => !GENERATED_IN_PACKAGE.has(f) && !ALLOWED_STAGING_ONLY.has(f));
  const stagingHashes = hashTree(STAGING, stagingFiles);
  const { mismatches, missing } = compare(stagingHashes, SOURCE_BEFORE);
  if (mismatches.length > 0) {
    fail(`PACKAGE_SOURCE_PARITY_MISMATCH (staging ↔ source) ${mismatches.length}건\n` +
      mismatches.slice(0, 5).map((m) =>
        `  ${m.path}\n    staging ${m.aSha} (${m.aSize})\n    source  ${m.bSha} (${m.bSize})`).join("\n"));
  }
  if (missing.length > 0) {
    fail(`staging 에만 있는 파일 ${missing.length}건 (허용 목록에 없음):\n  ${missing.slice(0, 10).join("\n  ")}`);
  }
  console.log(`   OK — ${Object.keys(stagingHashes).length}개 파일 일치`);
}

// 3d. Only now is staging final, so the integrity manifest can describe it.
//     Generating it any earlier is what made the manifest stale before.
console.log("3d) 공식 파일 무결성 매니페스트 갱신…");
try {
  run(process.execPath, [path.join(ROOT, "tools", "generate-package-manifest.mjs")]);
  cpSync(path.join(ROOT, "official-package-manifest.json"), path.join(STAGING, "official-package-manifest.json"));
} catch (err) {
  fail(`매니페스트 생성 실패\n${err.stdout ?? ""}${err.stderr ?? ""}`);
}
{
  const manifest = JSON.parse(readFileSync(path.join(STAGING, "official-package-manifest.json"), "utf-8"));
  const entry = manifest.files?.[CHECKLIST_BASENAME];
  if (!entry) fail(`매니페스트에 ${CHECKLIST_BASENAME} 항목이 없습니다.`);
  const actual = createHash("sha256").update(readFileSync(path.join(STAGING, CHECKLIST_BASENAME))).digest("hex");
  if (entry !== actual) fail(`매니페스트의 체크리스트 SHA 가 staging 과 다릅니다.\n  manifest ${entry}\n  staging  ${actual}`);
  console.log(`   OK — 매니페스트 ${manifest.fileCount}개 · 체크리스트 포함`);
}

console.log(`   OK — ${STAGING}`);

// 4. re-scan staging for anything forbidden that slipped through.
console.log("4) staging 청결성 검사…");
const offenders = [];
(function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (denied(entry.name, entry.isDirectory())) offenders.push(path.relative(STAGING, p));
    if (entry.isDirectory()) scan(p);
  }
})(STAGING);
if (offenders.length) fail(`staging 에 금지 항목이 있습니다:\n  ${offenders.slice(0, 20).join("\n  ")}`);
if (!existsSync(path.join(STAGING, "package.json"))) fail("staging 루트에 package.json 이 없습니다.");
if (!existsSync(path.join(STAGING, "package-lock.json"))) fail("staging 루트에 package-lock.json 이 없습니다.");
console.log("   OK — 금지 항목 없음");

// 4b. Re-hash the source. If anything changed while we were staging, the ZIP
//     we are about to write would not match the tree it claims to come from.
//     We stop rather than silently re-copying — the operator must start over so
//     that every generated artefact (manifest included) is rebuilt together.
console.log("4b) 패키징 중 소스 변경 검사…");
{
  const after = hashTree(ROOT, SOURCE_FILES);
  const { mismatches } = compare(SOURCE_BEFORE, after);
  const vanished = SOURCE_FILES.filter((f) => !after[f]);
  if (mismatches.length > 0 || vanished.length > 0) {
    const lines = mismatches.map((m) =>
      `  path       : ${m.path}\n  beforeSha  : ${m.aSha}\n  afterSha   : ${m.bSha}\n` +
      `  beforeSize : ${m.aSize}\n  afterSize  : ${m.bSize}`);
    for (const v of vanished) lines.push(`  path       : ${v}\n  afterSha   : (삭제됨)`);
    fail(`SOURCE_CHANGED_AFTER_STAGING — staging 이후 소스가 바뀌었습니다.\n${lines.join("\n\n")}\n\n` +
      "해결: 처음부터 다시 패키징하세요 (npm run package:public).\n" +
      "      staging 에 덮어쓰고 계속 진행하지 않습니다 — 매니페스트가 어긋납니다.");
  }
  console.log(`   OK — ${SOURCE_FILES.length}개 파일 변경 없음`);
}

// 5. zip into a temporary area. Nothing reaches release/ until the extracted
//    copy verifies itself; a half-built ZIP must never look shareable.
console.log("5) ZIP 생성 (임시 영역)…");
const TMP_RELEASE = path.join(ROOT, ".release-tmp");
rmSync(TMP_RELEASE, { recursive: true, force: true });
mkdirSync(path.join(TMP_RELEASE, "reports"), { recursive: true });
const TMP_ZIP = path.join(TMP_RELEASE, ZIP_NAME);
try {
  // -x '.DS_Store' as belt-and-braces; staging is already clean.
  run("zip", ["-r", "-q", "-X", TMP_ZIP, PROJECT_NAME, "-x", "*.DS_Store"], RELEASE_DIR);
} catch (err) {
  fail(`zip 실행 실패: ${err.message}`);
}
const size = statSync(TMP_ZIP).size;
console.log(`   OK — ${ZIP_NAME} (${(size / 1024 / 1024).toFixed(2)} MB)`);

// 6. inspect the ZIP's own entry list.
console.log("6) ZIP 내부 목록 재검사…");
const entries = run("unzip", ["-Z1", TMP_ZIP]).split("\n").filter(Boolean);
const tops = [...new Set(entries.map((e) => e.split("/")[0]))];
if (tops.length !== 1 || tops[0] !== PROJECT_NAME) {
  fail(`ZIP 최상위가 정확히 하나의 프로젝트 폴더가 아닙니다: ${JSON.stringify(tops)}`);
}
const bad = entries.filter((e) =>
  e.split("/").some((seg) => DENY_DIRS.has(seg)) ||
  DENY_FILES.has(path.basename(e)) ||
  DENY_PATTERNS.some((re) => re.test(path.basename(e))));
if (bad.length) fail(`ZIP 에 금지 항목 ${bad.length}건:\n  ${bad.slice(0, 20).join("\n  ")}`);
if (!entries.includes(`${PROJECT_NAME}/package.json`)) fail("ZIP 루트에 package.json 이 없습니다.");
console.log(`   OK — 항목 ${entries.length}개, 최상위 폴더 1개`);

// 6b. compressed-data integrity.
console.log("6b) ZIP 압축 무결성…");
try { run("unzip", ["-tqq", TMP_ZIP]); } catch (err) { fail(`ZIP 무결성 실패: ${err.message}`); }
console.log("   OK");

// 7. extract and let the package verify ITSELF. v5.1.3 passed every check that
//    looked inside the ZIP while shipping a stale verifier; the decisive test is
//    running the shipped tools from the shipped tree.
console.log("7) 압축 해제본 자기검증…");
const EXTRACT_DIR = path.join(TMP_RELEASE, "extracted");
mkdirSync(EXTRACT_DIR, { recursive: true });
run("unzip", ["-qq", TMP_ZIP, "-d", EXTRACT_DIR]);
const EXTRACTED_ROOT = path.join(EXTRACT_DIR, PROJECT_NAME);

// 7a. staging ↔ extracted parity
{
  const stagingFiles = listFiles(STAGING);
  const a = hashTree(STAGING, stagingFiles);
  const b = hashTree(EXTRACTED_ROOT, stagingFiles);
  const { mismatches } = compare(a, b);
  const missing = stagingFiles.filter((f) => !b[f]);
  if (mismatches.length > 0 || missing.length > 0) {
    fail(`PACKAGE_SOURCE_PARITY_MISMATCH (staging ↔ zip)\n` +
      mismatches.slice(0, 5).map((m) => `  ${m.path}: ${m.aSha} ≠ ${m.bSha}`).join("\n") +
      (missing.length ? `\n  누락 ${missing.length}건: ${missing.slice(0, 5).join(", ")}` : ""));
  }
  console.log(`   OK — staging ↔ ZIP ${stagingFiles.length}개 파일 일치`);
}

// 7b. the shipped verifiers, run from the shipped tree.
const SELF_CHECKS = [
  ["verify-public-package.mjs", ["--mode", "extracted-participant"]],
  ["verify-participant-onboarding.mjs", []],
  ["verify-participant-ux-guidance.mjs", []],
  ["verify-participant-auth-privacy-copy.mjs", []],
  ["verify-api-examples.mjs", []],
  ["verify-doc-links.mjs", []],
  ["verify-windows-scripts.mjs", []],
  ["generate-windows-checklist.mjs", ["--check"]],
];
for (const [tool, args] of SELF_CHECKS) {
  const toolPath = path.join(EXTRACTED_ROOT, "tools", tool);
  if (!existsSync(toolPath)) fail(`배포본에 tools/${tool} 이 없습니다.`);
  try {
    const out = run(process.execPath, [toolPath, ...args], EXTRACTED_ROOT);
    if (/release\/ 사본이 없습니다/.test(out)) {
      fail(`배포본 자기검증에서 release/ 사본 오류가 났습니다 (stale verifier):\n${out}`);
    }
    console.log(`   OK — ${tool}`);
  } catch (err) {
    fail(`배포본 자기검증 실패: tools/${tool}\n${err.stdout ?? ""}${err.stderr ?? ""}`);
  }
}

// 7c. the critical files must be byte-identical to source, checked here rather
//     than trusting that the copy step did the right thing.
{
  const bad = [];
  for (const rel of CRITICAL_FILES) {
    const src = SOURCE_BEFORE[rel];
    const out = hashTree(EXTRACTED_ROOT, [rel])[rel];
    if (!src) { bad.push(`${rel}: 소스에 없음`); continue; }
    if (!out) { bad.push(`${rel}: 배포본에 없음`); continue; }
    if (src.sha256 !== out.sha256) {
      bad.push(`${rel}\n    source ${src.sha256} (${src.size})\n    zip    ${out.sha256} (${out.size})`);
    }
  }
  if (bad.length > 0) fail(`PUBLIC_PACKAGE_VERIFIER_STALE — 핵심 파일 불일치\n  ${bad.join("\n  ")}`);
  console.log(`   OK — 핵심 파일 ${CRITICAL_FILES.length}개 소스와 동일`);
}

// 8. only now does the artefact become the release. Moving last means a failed
//    run cannot leave a half-verified ZIP where an operator would find it.
console.log("8) release 로 원자적 이동…");
rmSync(ZIP_PATH, { force: true });
rmSync(`${ZIP_PATH}.sha256`, { force: true });
renameSync(TMP_ZIP, ZIP_PATH);
const sha = createHash("sha256").update(readFileSync(ZIP_PATH)).digest("hex");
writeFileSync(`${ZIP_PATH}.sha256`, `${sha}  ${ZIP_NAME}\n`);
writeFileSync(path.join(BUILD_DIR, "package-build-metadata.json"), JSON.stringify({
  productVersion: PRODUCT_VERSION,
  inputContractVersion: CONTRACT_VERSION,
  builtAt: BUILT_AT,
  edition: EDITION,
  sourceSnapshotSha256: SOURCE_DIGEST,
  packageManifestSha256: createHash("sha256")
    .update(readFileSync(path.join(STAGING, "official-package-manifest.json"))).digest("hex"),
  zipSha256: sha,
  zipName: ZIP_NAME,
}, null, 2) + "\n");
rmSync(TMP_RELEASE, { recursive: true, force: true });
console.log(`   OK — ${ZIP_NAME}`);

// 운영진 배포 가이드도 매번 다시 씁니다 (버전·SHA 가 자동으로 맞습니다).
const guideTemplate = path.join(ROOT, "tools", "templates", "PARTICIPANT_DISTRIBUTION_GUIDE.template.md");
if (existsSync(guideTemplate)) {
  const guide = readFileSync(guideTemplate, "utf-8")
    .replaceAll("{{VERSION}}", PRODUCT_VERSION)
    .replaceAll("{{CONTRACT_VERSION}}", CONTRACT_VERSION)
    .replaceAll("{{SHA256}}", sha)
    .replaceAll("{{ZIP_NAME}}", ZIP_NAME);
  writeFileSync(path.join(RELEASE_DIR, "PARTICIPANT_DISTRIBUTION_GUIDE.md"), guide);
}

// 릴리스 노트도 산출물과 함께 생성해 버전·SHA 가 어긋나지 않게 합니다.
writeFileSync(path.join(RELEASE_DIR, `RELEASE_NOTES_v${PRODUCT_VERSION}.md`), `# KioBridge Participant Edition v${PRODUCT_VERSION}

배포 ZIP : \`${ZIP_NAME}\`
SHA-256  : \`${sha}\`
제품 버전 : ${PRODUCT_VERSION}
inputContractVersion : ${CONTRACT_VERSION} (변경 없음)
소스 스냅샷 : \`${SOURCE_DIGEST}\`
빌드 시각 : ${BUILT_AT}

## 기존 v5.1.3 문제

소스 저장소의 \`tools/verify-public-package.mjs\` 와
Participant ZIP 내부의 같은 파일이 달랐습니다.

\`\`\`
SOURCE_SIZE = 38273
ZIP_SIZE    = 37819
공통 파일 393개 중 392개 일치 · 1개 불일치
\`\`\`

패키징 뒤에 검증기를 고치고 ZIP 을 다시 만들지 않았기 때문입니다.
그 결과 배포본의 이전 검증기가, 참가팀 압축 해제본에 \`release/\` 가 없는
정상 상태를 오류로 처리했습니다. 기존 검사들은 모두 ZIP "안" 만 보았기 때문에
이 어긋남을 알 수 없었습니다.

## 수정 내용

- 최신 공개 패키지 검증기를 Participant ZIP 에 반영
- Participant 압축 해제본의 \`release/\` 미포함 상태를 정상 처리
  (\`[NOT_APPLICABLE] Outer release checklist\`)
- 소스 저장소에서는 \`release/\` 사본 검사를 그대로 유지 — 예외가 소스 검증을
  느슨하게 만들지 않습니다
- 실행 모드를 명시적으로 구분 (\`--mode source-release\` / \`--mode extracted-participant\`)
  자동 감지는 \`release/\` 유무만이 아니라 배포본 지문 전체로 판정합니다
- 소스·staging·ZIP 파일 해시 일치 검증 추가 (\`verify:package-source-parity\`)
- 패키징 중 소스 변경 탐지 추가 (\`SOURCE_CHANGED_AFTER_STAGING\`)
- 압축 해제본 자기검증 필수화 — 배포본의 도구를 배포본 트리에서 실제로 실행
- 원자적 릴리스 생성 — 자기검증을 통과한 뒤에만 \`release/\` 로 이동
- \`official-package-manifest.json\` criticalFiles 에 검증기 SHA·size 고정
- stale verifier 주입 회귀테스트 추가
- 빌드 metadata 기록 (\`.build/package-build-metadata.json\`)

## 계약 영향

- ParticipantSubmission 변경 없음
- Canonical Contract 변경 없음
- \`inputContractVersion\` ${CONTRACT_VERSION} 유지
- 기존 참가팀 제출물 재작성 불필요
- 시뮬레이션 실행 로직 변경 없음
- Stage A/B · Vocabulary Membership · Timestamp 검증 · Safety Engine 변경 없음

## Windows 검증 상태

\`\`\`
WINDOWS_STATIC_VALIDATION: PASS
WINDOWS_RUNTIME_VALIDATION: NOT_RUN
\`\`\`

실제 Windows PC 에서의 실행 검증은 별도로 수행해야 합니다.
`);

writeFileSync(path.join(RELEASE_DIR, "SHARE_THIS_ZIP.txt"), [
  "KioBridge Simulation Kit — 배포 안내",
  "=".repeat(46),
  "",
  `참가팀에게 전달할 파일은 이것 하나입니다:`,
  "",
  `    ${ZIP_NAME}`,
  "",
  `무결성 확인 : ${ZIP_NAME}.sha256`,
  `SHA256      : ${sha}`,
  `제품 버전   : ${PRODUCT_VERSION}`,
  `계약 버전   : ${CONTRACT_VERSION} (제품 버전과 별개로 관리됩니다)`,
  "",
  "전달하지 마세요",
  "-".repeat(46),
  "  - 소스 폴더 전체 (node_modules 와 이전 release 가 함께 들어갑니다)",
  `  - staging 폴더 (release/${PROJECT_NAME}/) — ZIP 과 중복입니다`,
  "  - 비공개 평가 자산 (hidden-profiles, expected-results)",
  "",
  "참가팀 첫 단계",
  "-".repeat(46),
  "  1. ZIP 을 압축 해제합니다 (경로에 한글/공백이 있어도 됩니다)",
  "  2. macOS: start-macos.command / Windows: start-windows.bat / Linux: start-linux.sh",
  "  3. 브라우저가 열리면 README_FIRST.md 를 따라갑니다",
  "  Windows 사용자는 start-windows.bat 전에 WINDOWS_FINAL_CHECKLIST.md 를 먼저 보세요",
  "",
  "이 ZIP 의 출처",
  "-".repeat(46),
  `  소스 스냅샷 : ${SOURCE_DIGEST}`,
  `  빌드 시각   : ${BUILT_AT}`,
  "  소스를 고쳤다면 이 ZIP 을 그대로 쓰지 말고 npm run package:public 을 다시 실행하세요.",
  "",
  "PASS 의 의미",
  "-".repeat(46),
  "  SIMULATION PASS 는 계약·안전·상태 전환 검증만 통과했다는 뜻입니다.",
  "  추천 품질, 접근성 UX, 창의성은 별도 심사에서 평가합니다.",
  "  자세한 내용: docs/PRIVATE_EVALUATION_BOUNDARY.md",
  "",
].join("\n"));

console.log("\n패키징 완료");
console.log(`  크기   : ${(size / 1024 / 1024).toFixed(2)} MB (${size} bytes)`);
console.log(`  항목수 : ${entries.length}`);
console.log(`  SHA256 : ${sha}`);

const BANNER = "=".repeat(56);
console.log(`\n${BANNER}`);
console.log("참가팀에게 전달할 파일");
console.log(`release/${ZIP_NAME}`);
console.log(BANNER);
console.log("");
console.log("프로젝트 전체 폴더를 Finder 나 탐색기로 다시 압축하지 마세요.");
console.log("node_modules 와 이전 release 가 함께 들어갑니다.");
console.log("자세한 내용: DO_NOT_SHARE_THIS_FOLDER.md");
console.log("\n다음: npm run verify:public-package");
