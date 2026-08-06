#!/usr/bin/env node
/**
 * Independently verifies the produced public ZIP by reading the archive itself
 * (not the staging folder). Exits non-zero on any failure so packaging cannot be
 * reported as successful when it is not.
 */
import { execFileSync } from "node:child_process";
import { generateWindowsFinalChecklist } from "./lib/windows-checklist.mjs";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_VERSION = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8")).version;
const PROJECT_NAME = `kiobridge-simulation-kit-v${PRODUCT_VERSION}`;
const CONTRACT_VERSION = "1.0.0";
let EDITION = process.env.KIO_EDITION === "participant" ? "participant" : "public";

/* ─────────────────────────── 실행 모드 ───────────────────────────
 *
 * 이 검증기는 두 자리에서 돌아갑니다. 무엇을 검사하는지가 다릅니다.
 *
 *   source-release        운영진의 소스 저장소에서 만들어진 ZIP 을 검사합니다.
 *                         release/ 사본까지 대조합니다.
 *
 *   extracted-participant 참가팀이 푼 배포본 자기 자신을 검사합니다.
 *                         이 트리에는 release/ 가 없는 것이 정상이므로
 *                         해당 검사는 NOT_APPLICABLE 로 보고합니다.
 *
 * 자동 감지는 "release/ 가 없다" 만으로 판단하지 않습니다. 그러면 아직
 * 패키징하지 않은 소스 저장소가 배포본으로 오인됩니다. 배포본은 아래를
 * 모두 만족할 때만 배포본으로 봅니다.
 */
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const explicitMode = argOf("--mode");
const explicitZip = argOf("--zip") ?? argv.find((a) => !a.startsWith("--") && /\.zip$/i.test(a));

/** 배포본의 지문. 하나라도 어긋나면 배포본이 아닙니다. */
function participantPackageFingerprint(root) {
  const reasons = [];
  const manifestPath = path.join(root, "official-package-manifest.json");
  if (!existsSync(manifestPath)) reasons.push("official-package-manifest.json 없음");
  if (!existsSync(path.join(root, "tools", "templates", "WINDOWS_FINAL_CHECKLIST.template.md"))) {
    reasons.push("체크리스트 템플릿 없음");
  }
  if (!existsSync(path.join(root, "WINDOWS_FINAL_CHECKLIST.md"))) reasons.push("루트 체크리스트 없음");
  if (!existsSync(path.join(root, "00_START_HERE.html"))) reasons.push("00_START_HERE.html 없음");
  if (!existsSync(path.join(root, "participant-workspace"))) reasons.push("participant-workspace 없음");
  // 소스 저장소에만 있는 표식이 남아 있으면 배포본이 아닙니다.
  if (existsSync(path.join(root, "release"))) reasons.push("release/ 가 있음 (소스 저장소)");
  if (existsSync(path.join(root, "DO_NOT_SHARE_THIS_FOLDER.md"))) reasons.push("소스 전용 표식이 있음");
  return reasons;
}

const fingerprintReasons = participantPackageFingerprint(ROOT);
const looksLikeParticipantTree = fingerprintReasons.length === 0;

let MODE;
if (explicitMode === "source-release" || explicitMode === "extracted-participant") {
  MODE = explicitMode;
} else if (explicitMode) {
  console.error(`[오류] 알 수 없는 --mode: ${explicitMode}`);
  console.error("       source-release 또는 extracted-participant 를 쓰세요.");
  process.exit(1);
} else if (explicitZip) {
  MODE = "source-release";
} else {
  MODE = looksLikeParticipantTree ? "extracted-participant" : "source-release";
}

// 배포본 자기검증이라면 그 패키지는 Participant Edition 입니다.
// 참가팀이 KIO_EDITION 을 손수 지정해야 한다면 그 검사는 조용히 건너뛰게 됩니다.
if (MODE === "extracted-participant") EDITION = "participant";

const ZIP_PATH = MODE === "source-release"
  ? path.resolve(explicitZip ?? path.join(ROOT, "release", `${PROJECT_NAME}-${EDITION}.zip`))
  : null;

if (MODE === "source-release" && !existsSync(ZIP_PATH)) {
  console.error(`[오류] ZIP 을 찾을 수 없습니다: ${ZIP_PATH}`);
  if (fingerprintReasons.length > 0) {
    console.error("       이 폴더를 배포본으로도 볼 수 없습니다:");
    for (const r of fingerprintReasons) console.error(`         - ${r}`);
  }
  console.error("       먼저 `npm run package:public` 을 실행하세요.");
  process.exit(1);
}

/**
 * 검사 대상 목록. ZIP 이면 항목 목록을, 배포본 자기검증이면 트리를 훑어
 * 같은 모양(`<프로젝트폴더>/경로`)으로 만듭니다. 아래 검사들은 두 경우에
 * 같은 코드로 동작합니다.
 */
const RUNTIME_ONLY = new Set(["node_modules", ".git", "test-results", "playwright-report",
  ".build", ".release-tmp", "dist", "build", ".cache", "coverage"]);
function walkTree(root) {
  const out = [];
  (function rec(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (RUNTIME_ONLY.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) { out.push(`${PROJECT_NAME}/${rel}/`); rec(full); }
      else out.push(`${PROJECT_NAME}/${rel}`);
    }
  })(root);
  return out;
}

const entries = MODE === "source-release"
  ? execFileSync("unzip", ["-Z1", ZIP_PATH], { encoding: "utf-8" }).split("\n").filter(Boolean)
  : [`${PROJECT_NAME}/`, ...walkTree(ROOT)];
const has = (p) => entries.includes(p);
const countSeg = (seg) => entries.filter((e) => e.split("/").includes(seg)).length;
const countBase = (name) => entries.filter((e) => path.basename(e) === name).length;

const results = [];
const check = (label, ok, detail = "") => results.push({ label, ok, detail });
/** 이 환경에서는 판정할 대상이 없는 검사. 실패도 통과도 아닙니다. */
const notApplicable = (label, detail = "") => results.push({ label, skipped: true, ok: true, detail });

// --- structure --------------------------------------------------------------
const tops = [...new Set(entries.map((e) => e.split("/")[0]))];
check("Single project root", tops.length === 1 && tops[0] === PROJECT_NAME, `top-level: ${tops.join(", ")}`);
check("Root package.json", has(`${PROJECT_NAME}/package.json`));
check("Root package-lock.json", has(`${PROJECT_NAME}/package-lock.json`));
check("No nested project folder", !has(`${PROJECT_NAME}/kiobridge-simulation-kit/package.json`));
check("README_FIRST", has(`${PROJECT_NAME}/README_FIRST.md`));
check("Start scripts", ["start-macos.command", "start-windows.bat", "start-linux.sh"].every((f) => has(`${PROJECT_NAME}/${f}`)));
check("Stop scripts", ["stop-macos.command", "stop-windows.bat", "stop-linux.sh"].every((f) => has(`${PROJECT_NAME}/${f}`)));
check("compose.yaml", has(`${PROJECT_NAME}/compose.yaml`));

// --- cleanliness ------------------------------------------------------------
// 배포본 자기검증에서는 node_modules 등 런타임 산출물이 있는 것이 정상입니다.
// 그것은 ZIP 의 청결성이 아니라 참가팀의 작업 상태이기 때문입니다.
const zipOnly = MODE === "source-release";
const nodeModules = countSeg("node_modules");
const dist = countSeg("dist");
const build = countSeg("build");
const macosx = countSeg("__MACOSX");
const dsStore = countBase(".DS_Store");
if (zipOnly) check("No node_modules", nodeModules === 0, `${nodeModules}건`);
else notApplicable("No node_modules", "배포본 자기검증 — 설치 산출물은 정상");
if (zipOnly) check("No dist", dist === 0, `${dist}건`);
else notApplicable("No dist", "배포본 자기검증 — 설치 산출물은 정상");
if (zipOnly) check("No build", build === 0, `${build}건`);
else notApplicable("No build", "배포본 자기검증 — 설치 산출물은 정상");
check("No __MACOSX", macosx === 0, `${macosx}건`);
check("No .DS_Store", dsStore === 0, `${dsStore}건`);
check("No .env", entries.filter((e) => /(^|\/)\.env($|\.)/.test(e)).length === 0);
check("No log files", entries.filter((e) => /\.log$/i.test(e)).length === 0);

// --- private evaluation data -----------------------------------------------
const privateSegs = ["private-tests", "hidden-profiles", "hidden-scenarios", "expected-results", "kiobridge-private-evaluation"];
const privateHits = privateSegs.reduce((n, s) => n + countSeg(s), 0);
check("No private evaluation data", privateHits === 0, `${privateHits}건`);

// Playwright artefacts and stale release ZIPs must never ride along.
const pwArtefacts = ["playwright-report", "test-results", "screenshots", "traces", "videos", "coverage"]
  .reduce((n, seg) => n + countSeg(seg), 0);
if (zipOnly) check("No Playwright artefacts", pwArtefacts === 0, `${pwArtefacts}건`);
else notApplicable("No Playwright artefacts", "배포본 자기검증 — 실행 산출물은 정상");
const nestedZips = entries.filter((e) => /\.zip$/i.test(e));
check("No nested release ZIPs", nestedZips.length === 0, nestedZips.slice(0, 3).join(", "));

// E2E sources SHOULD ship (participants can rerun them); browsers must not.
check("Playwright config shipped", has(`${PROJECT_NAME}/playwright.config.ts`));
check("E2E specs shipped", entries.some((e) => e.startsWith(`${PROJECT_NAME}/tests/e2e/`) && e.endsWith(".ts")));
if (zipOnly) check("No browser binaries", countSeg("ms-playwright") === 0 && countSeg(".cache") === 0);
else notApplicable("No browser binaries", "배포본 자기검증");

// --- participant contract deliverables --------------------------------------
const deliverable = `${PROJECT_NAME}/participant-deliverables/04_PROFILE_AND_INPUT_CONTRACT`;
const contractDocs = ["README.md", "PROFILE_DATA_DICTIONARY.md", "SESSION_CONTEXT_DICTIONARY.md",
  "MAPPING_GUIDE.md", "ENUM_REFERENCE.md", "UNKNOWN_POLICY.md",
  "SCHEMA_VERSIONING_POLICY.md", "SCHEMA_NEGOTIATION_GUIDE.md", "MIGRATION_FROM_V4.md"];
check("Participant contract files", contractDocs.every((d) => has(`${deliverable}/${d}`)));
check("Contract schemas + vocabularies", entries.some((e) => e.startsWith(`${deliverable}/schemas/`)) && entries.some((e) => e.startsWith(`${deliverable}/vocabularies/`)));

// --- sandbox example present, official answers absent -----------------------
check("Sandbox example", has(`${PROJECT_NAME}/examples/submission-format-example/sandbox.json`));
const officialPlans = ["chicken-store", "hospital", "public-office"]
  .filter((env) => has(`${PROJECT_NAME}/examples/submission-format-example/${env}.json`));
check("No official env answer plans", officialPlans.length === 0, officialPlans.join(", "));
check("No env scenarios (answer keys)", countSeg("scenarios") === 0);

// --- required documents -----------------------------------------------------
const requiredDocs = [
  "docs/PRIVATE_EVALUATION_BOUNDARY.md", "docs/WHAT_YOU_BUILD.md",
  "docs/WHAT_WE_PROVIDE.md", "docs/UNKNOWN_POLICY.md",
];
const missingDocs = requiredDocs.filter((d) => !has(`${PROJECT_NAME}/${d}`));
check("Required boundary docs", missingDocs.length === 0, missingDocs.join(", "));
check("Source-only marker excluded", !has(`${PROJECT_NAME}/DO_NOT_SHARE_THIS_FOLDER.md`));
check("실행 모드", true, MODE === "source-release" ? `source-release (${path.basename(ZIP_PATH)})` : "extracted-participant (자기검증)");

// --- extract once for content-level checks ----------------------------------
let tmp;
let EXTRACTED;
/** 이 실행이 직접 만든 임시 디렉터리. 여기에 담긴 것만 지웁니다. */
let SCRATCH_DIR = null;
if (MODE === "source-release") {
  // 프로세스마다 다른 폴더를 씁니다. 고정 경로를 쓰면 검증기를 동시에 돌릴 때
  // 서로의 추출본을 지웁니다 (테스트가 병렬로 부를 때 실제로 그랬습니다).
  tmp = mkdtempSync(path.join(tmpdir(), "kio-verify-"));
  SCRATCH_DIR = tmp;
  execFileSync("unzip", ["-qq", ZIP_PATH, "-d", tmp]);
  EXTRACTED = path.join(tmp, PROJECT_NAME);
} else {
  // 배포본 자기검증: 지금 이 트리가 검사 대상입니다.
  tmp = path.dirname(ROOT);
  EXTRACTED = ROOT;
}
const readOut = (rel) => readFileSync(path.join(EXTRACTED, rel), "utf-8");
/**
 * 배포되는 파일만 훑습니다. 배포본 자기검증에서는 참가팀이 설치한
 * node_modules 가 같은 트리에 있는데, 그 안의 절대경로는 서드파티 패키지의
 * 것이지 이 배포물의 것이 아닙니다.
 */
const GREP_EXCLUDE_DIRS = ["node_modules", "dist", "build", "coverage",
  "test-results", "playwright-report", ".git", ".cache", ".build", ".release-tmp"];
const grepFiles = (...patterns) => {
  try {
    const args = ["-rIl"];
    for (const d of GREP_EXCLUDE_DIRS) args.push(`--exclude-dir=${d}`);
    for (const p of patterns) args.push("-e", p);
    args.push(EXTRACTED);
    return execFileSync("grep", args, { encoding: "utf-8" })
      .split("\n").filter(Boolean).map((p) => path.relative(tmp, p));
  } catch { return []; } // grep exits 1 when nothing matches
};

// absolute local paths. Patterns are assembled at runtime so this file does not
// match its own check.
const MAC_HOME = ["/Us", "ers/"].join("");
const WIN_HOME = ["C:\\\\Us", "ers\\\\"].join("");
/**
 * Placeholder paths in Windows documentation are not leaks — `C:\\Users\\사용자\\`
 * is the Korean word for "user", written for the reader to substitute.
 * A real machine path (an actual account name) still fails.
 */
const PLACEHOLDER_USER = /^(사용자|username|USERNAME|user|<[^>\\/]+>|%USERNAME%)$/;
const hasRealUserPath = (text) => {
  for (const m of text.matchAll(/C:\\Users\\([^\\\s"'`)]+)/g)) {
    if (!PLACEHOLDER_USER.test(m[1])) return true;
  }
  return /\/Users\/[^/\s"'`)]+\//.test(text);
};
const leaked = grepFiles(MAC_HOME, WIN_HOME).filter((rel) => {
  try { return hasRealUserPath(readFileSync(path.join(tmp, rel), "utf-8")); }
  catch { return true; }
});
check("No absolute local paths", leaked.length === 0, leaked.slice(0, 5).join(", "));

// Answer keys must not appear in DATA files. Tools, tests and the boundary doc
// name these markers on purpose (that is how they block them), so only .json
// payload is scanned.
const answerLeak = entries
  .filter((e) => e.endsWith(".json") && !e.includes("/node_modules/"))
  .filter((e) => {
    try { return /expectedRecommendation|hiddenProfile|expectedResult/.test(readOut(path.relative(PROJECT_NAME, e))); }
    catch { return false; }
  });
check("No answer keys in data files", answerLeak.length === 0, answerLeak.slice(0, 5).join(", "));

// --- role boundary ----------------------------------------------------------
let roleErrors = [];
try {
  // 1. the only shipped plan builder is sandbox-gated.
  const builders = entries.filter((e) => /plan-builder\.ts$/.test(e));
  if (builders.length !== 1 || !builders[0].endsWith("tests/public/sandbox/sandbox-plan-builder.ts")) {
    roleErrors.push(`plan builder: ${builders.join(", ") || "none"}`);
  } else {
    const src = readOut("tests/public/sandbox/sandbox-plan-builder.ts");
    if (!/SANDBOX_ONLY/.test(src) || !/실행계획은 생성할 수 없습니다/.test(src)) {
      roleErrors.push("sandbox-plan-builder 에 환경 게이트가 없습니다");
    }
  }
  // 2. participant starter keeps its nine functions unimplemented.
  const starter = readOut("examples/minimal-participant-client/src/participant.ts");
  for (const fn of ["collectProfile", "mapToCanonicalInput", "createSessionContext",
    "filterCandidates", "recommend", "explainRecommendation",
    "buildAlternatives", "collectUserDecision", "buildExecutionPlan"]) {
    if (!new RegExp(`todo\\("${fn}"`).test(starter)) roleErrors.push(`starter ${fn}() 가 구현되어 있음`);
  }
  // 3. official environments ship profile+context examples but no answers.
  for (const env of ["chicken-store", "hospital", "public-office"]) {
    const dir = `${PROJECT_NAME}/examples/public-canonical-input/${env}/`;
    const files = entries.filter((e) => e.startsWith(dir) && e.endsWith(".json"));
    if (files.length === 0) { roleErrors.push(`${env}: canonical 예제 없음`); continue; }
    for (const f of files) {
      const doc = JSON.parse(readOut(path.relative(PROJECT_NAME, f)));
      if (doc.recommendation || doc.executionPlan) roleErrors.push(`${f}: 정답 포함`);
    }
    if (entries.some((e) => e.startsWith(`${PROJECT_NAME}/environments/${env}/profiles/`))) {
      roleErrors.push(`${env}: legacy profiles 폴더가 남아 있음`);
    }
  }
} catch (err) {
  roleErrors.push(`검사 실패: ${err.message}`);
}
check("Role boundary (참가팀 몫 미포함)", roleErrors.length === 0, roleErrors.slice(0, 5).join(" | "));

// --- PASS scope separation --------------------------------------------------
let scopeErrors = [];
try {
  const evSchema = JSON.parse(readOut("schemas/core/evidence.schema.json"));
  for (const f of ["resultScope", "simulationValidation", "recommendationEvaluation", "hackathonEvaluation"]) {
    if (!evSchema.properties?.[f]) scopeErrors.push(`evidence.schema.json 에 ${f} 없음`);
  }
  const app = readOut("apps/simulator-web/src/App.tsx");
  if (!/SIMULATION/.test(app) || !/심사/.test(app)) scopeErrors.push("웹 UI 에 PASS 범위 구분 표시 없음");
} catch (err) {
  scopeErrors.push(`검사 실패: ${err.message}`);
}
check("PASS scope separation", scopeErrors.length === 0, scopeErrors.slice(0, 5).join(" | "));

// --- version consistency ----------------------------------------------------
let versionErrors = [];
try {
  const pkg = JSON.parse(readOut("package.json"));
  if (pkg.version !== PRODUCT_VERSION) versionErrors.push(`package.json ${pkg.version}`);
  const server = readOut("apps/simulation-api/src/server.ts");
  if (!server.includes(`PLATFORM_VERSION = "${PRODUCT_VERSION}"`)) versionErrors.push("server.ts PLATFORM_VERSION 불일치");
  if (!server.includes('INPUT_CONTRACT_VERSION') && !server.includes('"1.0.0"')) versionErrors.push("server.ts 계약 버전 없음");
} catch (err) {
  versionErrors.push(`검사 실패: ${err.message}`);
}
check(`Version ${PRODUCT_VERSION} consistent`, versionErrors.length === 0, versionErrors.join(" | "));

// --- run the verifiers against the EXTRACTED package, not the source tree ----
const inPackage = (tool, label) => {
  try {
    execFileSync(process.execPath, [path.join(EXTRACTED, "tools", tool), EXTRACTED], { encoding: "utf-8", stdio: "pipe" });
    check(label, true);
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.split("\n").filter(Boolean).slice(-4).join(" | ");
    check(label, false, out.slice(0, 400));
  }
};
inPackage("verify-doc-links.mjs", "ZIP: doc links");
inPackage("verify-documented-scripts.mjs", "ZIP: documented npm scripts");
inPackage("verify-windows-scripts.mjs", "ZIP: Windows batch (static)");
inPackage("verify-e2e-references.mjs", "ZIP: E2E references");
inPackage("verify-release-chain.mjs", "ZIP: release chain");
inPackage("verify-compatibility-rules.mjs", "ZIP: compatibility rules");
inPackage("verify-review-mappings.mjs", "ZIP: review mappings");
inPackage("verify-execution-choice-rules.mjs", "ZIP: execution choice rules");
inPackage("verify-review-item-labels.mjs", "ZIP: review item labels");
inPackage("verify-public-environment-api.mjs", "ZIP: public environment API");
inPackage("verify-canonical-timestamps.mjs", "ZIP: canonical timestamps");
inPackage("verify-participant-onboarding.mjs", "ZIP: participant onboarding");

// --- participant edition -----------------------------------------------------
let onboardingErrors = [];
try {
  for (const f of ["00_START_HERE.html", "00_START_HERE.md", "PARTICIPANT_CHECKLIST.md",
    "FINAL_SUBMISSION_CHECKLIST.md", "DO_NOT_EDIT_PLATFORM_FILES.md",
    "official-package-manifest.json",
    "participant-workspace/src/participant.ts",
    "participant-workspace/EDIT_ONLY_THIS_FOLDER.md",
    "tools/participant-cli.mjs", "docs/ERROR_CATALOG.md",
    "docs/TROUBLESHOOTING_DECISION_TREE.md", "docs/FINAL_SUBMISSION_GUIDE.md",
    "docs/environments/README.md", "examples/annotated/README.md",
    "workspace/README.md", "submission-output/README.md"]) {
    if (!has(`${PROJECT_NAME}/${f}`)) onboardingErrors.push(`${f} 없음`);
  }
  const annotated = entries.filter((e) => e.startsWith(`${PROJECT_NAME}/examples/annotated/`) && e.endsWith(".jsonc"));
  if (annotated.length < 7) onboardingErrors.push(`annotated JSONC ${annotated.length}개 (7개 필요)`);
  const guides = entries.filter((e) => e.startsWith(`${PROJECT_NAME}/docs/environments/`) && e.endsWith(".md"));
  if (guides.length < 5) onboardingErrors.push(`환경 가이드 ${guides.length}개 (5개 필요)`);

  // The offline page must stay offline inside the ZIP too.
  const html = readOut("00_START_HERE.html");
  if (/<script[^>]+\ssrc=|<link[^>]+href=["']https?:/i.test(html)) onboardingErrors.push("START_HERE 에 외부 리소스");
  if (!html.includes(PRODUCT_VERSION)) onboardingErrors.push("START_HERE 에 제품 버전 표시 없음");

  // Team output must never ship.
  const teamOutput = entries.filter((e) =>
    /\/(workspace|submission-output)\/[^/]+\/(src|output|input)\//.test(e));
  if (teamOutput.length > 0) onboardingErrors.push(`팀 작업물 포함: ${teamOutput.slice(0, 3).join(", ")}`);

  const pkgOut = JSON.parse(readOut("package.json"));
  for (const c of ["doctor", "demo", "init", "progress", "validate", "package"]) {
    if (!pkgOut.scripts[`participant:${c}`]) onboardingErrors.push(`participant:${c} script 없음`);
  }
  if (!pkgOut.scripts["verify:participant-onboarding"]) onboardingErrors.push("verify:participant-onboarding script 없음");
} catch (err) {
  onboardingErrors.push(`검사 실패: ${err.message}`);
}
check("Participant Edition (START_HERE · CLI · 가이드)", onboardingErrors.length === 0, onboardingErrors.slice(0, 5).join(" | "));

// --- 사용자 접점 자료 (v5.1.1) -------------------------------------------------
// v5.1.0 은 빈 디렉터리만 담아 내보낸 적이 있습니다. 여기서는 크기까지 봅니다.
let uxErrors = [];
try {
  const sizeOf = (rel) => {
    try { return statSync(path.join(EXTRACTED, rel)).size; } catch { return -1; }
  };
  for (const [f, min] of [
    ["docs/API_EXAMPLES/README.md", 1500], ["docs/API_EXAMPLES/CURL.md", 1500],
    ["docs/API_EXAMPLES/JAVASCRIPT_FETCH.md", 1500], ["docs/API_EXAMPLES/TYPESCRIPT_SDK.md", 1500],
    ["docs/API_EXAMPLES/PYTHON_REQUESTS.md", 1500], ["docs/API_EXAMPLES/JAVA_SPRING.md", 1500],
    ["participant-workspace/example-ui/index.html", 3000],
    ["participant-workspace/example-ui/app.js", 6000],
    ["participant-workspace/example-ui/styles.css", 1500],
    ["participant-workspace/example-ui/README.md", 1500],
    ["participant-workspace/example-ui/mock-context.json", 200],
    ["participant-workspace/example-ui/tests/example-ui.spec.ts", 100],
    ["docs/PARTICIPANT_IDEA_CATALOG.md", 4000],
    ["docs/LOGINLESS_QR_PROFILE_GUIDE.md", 2500],
    ["docs/CONTEXT_AWARE_RECOMMENDATION_GUIDE.md", 2500],
    ["docs/EXPLAINABLE_RECOMMENDATION_GUIDE.md", 2500],
    ["docs/EXTERNAL_API_SAFETY_GUIDE.md", 2500],
    ["participant-workspace/participant-ux.template.json", 200],
    ["tests/e2e/offline-start-here.spec.ts", 2000],
    ["tests/e2e/participant-example-ui.spec.ts", 3000],
    ["tools/verify-api-examples.mjs", 1000],
    ["tools/verify-participant-ux-guidance.mjs", 1000],
  ]) {
    const n = sizeOf(f);
    if (n < 0) uxErrors.push(`${f} 없음`);
    else if (n < min) uxErrors.push(`${f} ${n} bytes (최소 ${min})`);
  }

  const pkgOut = JSON.parse(readOut("package.json"));
  for (const sc of ["verify:api-examples", "verify:participant-ux-guidance"]) {
    if (!pkgOut.scripts?.[sc]) uxErrors.push(`${sc} script 없음`);
    if (!(pkgOut.scripts?.["release:verify"] ?? "").includes(sc)) uxErrors.push(`release:verify 가 ${sc} 를 부르지 않음`);
  }

  // 빈 파일 0 · 미완성 표시 0
  const textEntries = entries.filter((e) =>
    /\.(md|jsonc|html|css)$/.test(e) && !e.includes("/node_modules/"));
  const emptyOnes = textEntries.filter((e) => sizeOf(path.relative(PROJECT_NAME, e)) === 0);
  if (emptyOnes.length > 0) uxErrors.push(`빈 파일 ${emptyOnes.length}건: ${emptyOnes.slice(0, 3).join(", ")}`);

  const unfinished = grepFiles("나중에 작성", "작성 예정", "여기에 내용을 채우세요", "coming soon")
    .filter((f) => !f.includes("/tools/"));
  if (unfinished.length > 0) uxErrors.push(`미완성 표시 ${unfinished.length}건: ${unfinished.slice(0, 3).join(", ")}`);

  // example-ui 는 인터넷 없이 열려야 합니다.
  const uiHtml = readOut("participant-workspace/example-ui/index.html");
  if (/<script[^>]+\ssrc=["']https?:|<link[^>]+href=["']https?:/i.test(uiHtml)) {
    uxErrors.push("example-ui 에 외부 리소스");
  }
} catch (err) {
  uxErrors.push(`검사 실패: ${err.message}`);
}
check("사용자 접점 자료 (API 예제 · example-ui · 가이드)", uxErrors.length === 0, uxErrors.slice(0, 6).join(" | "));

// --- Windows 최종 체크리스트 (v5.1.2) ------------------------------------------
// v5.1.1 은 release/ 에만 있고 ZIP 에는 없었는데 이 검증기가 통과시켰습니다.
// 그래서 여기서는 ZIP 내부의 정확한 경로를 직접 봅니다.
if (EDITION === "participant") {
  const CHECKLIST = "WINDOWS_FINAL_CHECKLIST.md";
  const zipRootEntry = `${PROJECT_NAME}/${CHECKLIST}`;

  check("Participant ZIP root Windows checklist", has(zipRootEntry),
    has(zipRootEntry) ? zipRootEntry : "PARTICIPANT_WINDOWS_CHECKLIST_MISSING");

  // release/ 를 ZIP 안에 넣어 우회하는 것도 실패입니다.
  const insideRelease = entries.filter((e) => /\/release\//.test(e));
  check("ZIP 내부 release 디렉터리 없음", insideRelease.length === 0, insideRelease.slice(0, 3).join(", "));

  let clErrors = [];
  let outerCopyChecked = true;
  try {
    if (!has(zipRootEntry)) {
      clErrors.push("PARTICIPANT_WINDOWS_CHECKLIST_MISSING");
    } else {
      const inZipPath = path.join(EXTRACTED, CHECKLIST);
      const inZipBuf = readFileSync(inZipPath);
      if (inZipBuf.length === 0) clErrors.push("ZIP 내부 체크리스트가 비어 있습니다");
      const inZipText = inZipBuf.toString("utf-8");
      const inZipSha = createHash("sha256").update(inZipBuf).digest("hex");

      // 1) 템플릿에서 다시 렌더한 결과와 같아야 합니다 — 손으로 만든 사본을 배제합니다.
      const rendered = generateWindowsFinalChecklist({
        productVersion: PRODUCT_VERSION, inputContractVersion: CONTRACT_VERSION, edition: EDITION,
      });
      const renderedSha = createHash("sha256").update(Buffer.from(rendered)).digest("hex");
      if (renderedSha !== inZipSha) {
        clErrors.push(`WINDOWS_CHECKLIST_TEMPLATE_MISMATCH (template ${renderedSha.slice(0, 12)} vs zip ${inZipSha.slice(0, 12)})`);
      }

      // 2) 운영진 사본과 SHA 가 같아야 합니다.
      //    배포본에는 release/ 가 들어가지 않으므로, 배포본 자기검증에서는
      //    이 검사를 NOT_APPLICABLE 로 보고합니다. 소스 저장소에서는
      //    사본이 없으면 실패입니다 — 예외가 소스 검증을 느슨하게 만들면 안 됩니다.
      const outer = path.join(ROOT, "release", CHECKLIST);
      if (MODE === "extracted-participant") {
        outerCopyChecked = false;
      } else if (!existsSync(outer)) {
        clErrors.push("release/ 사본이 없습니다 (소스 저장소에서는 필수입니다)");
      } else {
        const outerSha = createHash("sha256").update(readFileSync(outer)).digest("hex");
        if (outerSha !== inZipSha) clErrors.push(`CHECKLIST_SHA_MISMATCH (release ${outerSha.slice(0, 12)} vs zip ${inZipSha.slice(0, 12)})`);
      }

      // 3) 이전 버전 문자열이 남아 있으면 실패입니다.
      for (const oldVersion of ["5.1.1", "5.1.0"]) {
        if (oldVersion !== PRODUCT_VERSION && inZipText.includes(oldVersion)) {
          clErrors.push(`WINDOWS_CHECKLIST_VERSION_MISMATCH (${oldVersion})`);
        }
      }
      if (!inZipText.includes(PRODUCT_VERSION)) clErrors.push(`제품 버전 ${PRODUCT_VERSION} 표시 없음`);
      if (!inZipText.includes(CONTRACT_VERSION)) clErrors.push(`계약 버전 ${CONTRACT_VERSION} 표시 없음`);
      if (!/WINDOWS_RUNTIME_VALIDATION/.test(inZipText)) clErrors.push("WINDOWS_RUNTIME_VALIDATION 표기 없음");

      // 4) 매니페스트에 있고 SHA 가 맞아야 합니다.
      const manifest = JSON.parse(readOut("official-package-manifest.json"));
      const critical = (manifest.criticalFiles ?? []).find((c) => c.path === CHECKLIST);
      if (!critical) clErrors.push("매니페스트 criticalFiles 에 체크리스트가 없습니다");
      else {
        if (critical.sha256 !== inZipSha) clErrors.push("OFFICIAL_PACKAGE_MANIFEST_MISMATCH (sha)");
        if (critical.size !== inZipBuf.length) clErrors.push("OFFICIAL_PACKAGE_MANIFEST_MISMATCH (size)");
      }
      if (manifest.files?.[CHECKLIST] !== inZipSha) clErrors.push("매니페스트 files 항목 SHA 불일치");

      // 5) START_HERE 에서 열 수 있어야 합니다.
      for (const doc of ["00_START_HERE.html", "00_START_HERE.md", "README_FIRST.md", "PARTICIPANT_CHECKLIST.md"]) {
        if (!has(`${PROJECT_NAME}/${doc}`)) { clErrors.push(`${doc} 없음`); continue; }
        if (!readOut(doc).includes(CHECKLIST)) clErrors.push(`${doc} 에 체크리스트 링크 없음`);
      }
    }
  } catch (err) {
    clErrors.push(`검사 실패: ${err.message}`);
  }
  check("Windows checklist (템플릿·SHA·매니페스트·START_HERE)", clErrors.length === 0,
    clErrors.slice(0, 6).join(" | "));
  if (outerCopyChecked) {
    check("Outer release checklist", true, "소스 저장소 사본과 SHA 일치");
  } else {
    notApplicable("Outer release checklist", "participant package — release/ 는 배포본에 없습니다");
  }
}

// --- 로그인·저장·개인정보 안내 (v5.1.3) ----------------------------------------
// Example UI 의 "로그인 없음" 이 과제 전체의 금지로 읽히던 문제를 막습니다.
let copyErrors = [];
try {
  for (const f of ["tools/verify-participant-auth-privacy-copy.mjs"]) {
    if (!has(`${PROJECT_NAME}/${f}`)) copyErrors.push(`${f} 없음`);
  }
  const pkgOut = JSON.parse(readOut("package.json"));
  const SELF = "verify:participant-auth-privacy-copy";
  if (!pkgOut.scripts?.[SELF]) copyErrors.push(`${SELF} script 없음`);
  if (!(pkgOut.scripts?.["release:verify"] ?? "").includes(SELF)) {
    copyErrors.push(`release:verify 가 ${SELF} 를 부르지 않음`);
  }

  const ui = readOut("participant-workspace/example-ui/index.html");
  for (const [re, label] of [
    [/Sandbox 참고 예제/, "Sandbox 참고 예제 안내"],
    [/이 예제는 로그인 없이 동작/, "예제의 무로그인 동작 설명"],
    [/로그인 기능은 선택사항/, "로그인 선택사항 안내"],
    [/핵심 이용 흐름은 로그인 없이/, "핵심 흐름 무로그인 원칙"],
    [/가상 데이터/, "가상 데이터 안내"],
    [/공식 정답이나 필수 디자인이 아닙니다/, "공식 정답 아님 안내"],
    [/실제 서비스로 확장/, "실제 서비스 개인정보 요건 안내"],
    [/이번만 사용하기/, "이번만 사용하기 버튼"],
    [/저장된 설정으로 시작/, "저장된 설정으로 시작 버튼"],
  ]) if (!re.test(ui)) copyErrors.push(`example-ui 에 ${label} 없음`);

  // 범위 없는 옛 문구가 배포본에 남아 있으면 실패입니다.
  for (const [re, label] of [
    [/로그인은 필요 없으며/, "로그인은 필요 없으며"],
    [/계정을 만들 필요가 없습니다/, "계정을 만들 필요가 없습니다"],
    [/>\s*아무것도 저장하지 않습니다\s*</, "아무것도 저장하지 않습니다"],
    [/그냥 시작하기/, "그냥 시작하기"],
  ]) if (re.test(ui)) copyErrors.push(`example-ui 에 옛 문구 "${label}" 잔존`);

  const uxTpl = JSON.parse(readOut("participant-workspace/participant-ux.template.json"));
  if (!/차단되지 않는다|막히지 않/.test(uxTpl._loginRequired ?? "")) {
    copyErrors.push("participant-ux 템플릿에 loginRequired 의미 설명 없음");
  }

  const spec = readOut("tests/e2e/participant-example-ui.spec.ts");
  for (const [needle, label] of [
    ["로그인 기능은 선택사항입니다", "로그인 선택사항 E2E"],
    ["이번만 사용하기", "시작 버튼 E2E"],
    ["로컬 HTTP 서버", "HTTP 모드 E2E"],
  ]) if (!spec.includes(needle)) copyErrors.push(`example-ui E2E 에 ${label} 없음`);
} catch (err) {
  copyErrors.push(`검사 실패: ${err.message}`);
}
check("로그인·저장·개인정보 안내 (문구 일관성)", copyErrors.length === 0, copyErrors.slice(0, 6).join(" | "));

// --- timestamp policy shipped -----------------------------------------------
let tsErrors = [];
try {
  const pkgOut = JSON.parse(readOut("package.json"));
  if (!pkgOut.scripts?.["verify:canonical-timestamps"]) tsErrors.push("verify:canonical-timestamps script 없음");
  if (!(pkgOut.scripts?.["release:verify"] ?? "").includes("verify:canonical-timestamps")) {
    tsErrors.push("release:verify 가 timestamp 검증을 호출하지 않음");
  }
  const contractPkg = JSON.parse(readOut("packages/profile-contract/package.json"));
  if (!contractPkg.dependencies?.["ajv-formats"]) tsErrors.push("ajv-formats 의존성 없음");
  if (!readOut("package-lock.json").includes("ajv-formats")) tsErrors.push("package-lock 에 ajv-formats 없음");
  for (const f of ["packages/profile-contract/src/timestamp.ts",
    "packages/profile-contract/src/create-ajv.ts",
    "schemas/core/iso-8601-utc.schema.json",
    "tests/public/contracts/timestamp.test.ts"]) {
    if (!has(`${PROJECT_NAME}/${f}`)) tsErrors.push(`${f} 없음`);
  }
  const factory = readOut("packages/profile-contract/src/create-ajv.ts");
  if (!factory.includes("ajv-formats")) tsErrors.push("AJV factory 에 ajv-formats 미등록");
  if (!factory.includes("iso-8601-utc")) tsErrors.push("iso-8601-utc custom format 미등록");
  // No unconfigured AJV anywhere in the shipped payload.
  const bare = entries
    .filter((e) => /\.(ts|mjs|js)$/.test(e) && !e.includes("create-ajv"))
    .filter((e) => { try { return /new\s+Ajv\s*\(/.test(readOut(path.relative(PROJECT_NAME, e))); } catch { return false; } });
  if (bare.length > 0) tsErrors.push(`공통 factory 미사용 AJV: ${bare.slice(0, 3).join(", ")}`);
  // The three fields must reference the shared definition.
  for (const [f, keys] of [
    ["schemas/core/canonical-profile.schema.json", ["properties", "source", "properties", "collectedAt"]],
    ["schemas/core/field-metadata.schema.json", ["properties", "capturedAt"]],
    ["schemas/core/user-decision.schema.json", ["properties", "confirmedAt"]],
  ]) {
    let cur = JSON.parse(readOut(f));
    for (const k of keys) cur = cur?.[k];
    if (!cur?.$ref?.includes("iso-8601-utc")) tsErrors.push(`${f} 가 공통 timestamp 정의를 쓰지 않음`);
  }
  const validator = readOut("packages/profile-contract/src/validator.ts");
  for (const need of ["collectedAt", "capturedAt", "checkTimestamp"]) {
    if (!validator.includes(need)) tsErrors.push(`직접 Validator 에 ${need} 없음`);
  }
  if (!validator.includes("validateUserDecisionTimestamps")) tsErrors.push("confirmedAt 검증기 없음");
  const tsTest = readOut("tests/public/contracts/timestamp.test.ts");
  for (const need of ["unknown format", "/profile/source/collectedAt", "/userDecision/confirmedAt", "check-submission.mjs"]) {
    if (!tsTest.includes(need)) tsErrors.push(`timestamp 테스트에 ${need} 없음`);
  }
} catch (err) {
  tsErrors.push(`검사 실패: ${err.message}`);
}
check("Canonical timestamp policy", tsErrors.length === 0, tsErrors.slice(0, 5).join(" | "));

// --- v5.0.4 semantics shipped ------------------------------------------------
let stageBErrors = [];
try {
  if (!has(`${PROJECT_NAME}/packages/evaluator/src/execution-choice-extractor.ts`)) stageBErrors.push("execution-choice-extractor 없음");
  if (!has(`${PROJECT_NAME}/packages/evaluator/src/vocabulary-registry.ts`)) stageBErrors.push("vocabulary-registry 없음");
  for (const t of ["tests/public/domain/execution-choice.test.ts", "tests/e2e/two-page-grid.spec.ts"]) {
    if (!has(`${PROJECT_NAME}/${t}`)) stageBErrors.push(`${t} 없음`);
  }
  const need = { hospital: ["VISIT_TYPE", "APPOINTMENT", "DEPARTMENT"], "public-office": ["AUTH_METHOD"],
    "chicken-store": ["SERVICE_TYPE", "SPICY_LEVEL", "BONE_TYPE"] };
  for (const [env, keys] of Object.entries(need)) {
    const doc = JSON.parse(readOut(`environments/${env}/compatibility-rules.json`));
    const exec = doc.rules.filter((r) => r.evaluationScope === "EXECUTION_CHOICE");
    if (exec.length === 0) stageBErrors.push(`${env}: 실행 선택 규칙 없음`);
    for (const k of keys) {
      if (!exec.some((r) => r.target?.key === k)) stageBErrors.push(`${env}: ${k} 실행 선택 규칙 없음`);
    }
    for (const r of doc.rules) {
      if (/SPICY|SIZE|BONE|CUP|QUANTITY/.test(r.ruleId) && /SERVICE_TYPE_MISMATCH$/.test(r.errorCode)) {
        stageBErrors.push(`${env}/${r.ruleId}: SERVICE_TYPE 오류코드 재사용`);
      }
    }
  }
  // Sandbox must genuinely need two pages, and its example must use page 2.
  const sandbox = JSON.parse(readOut("environments/sandbox/candidates.json"));
  if (sandbox.length < 5) stageBErrors.push(`sandbox 후보가 ${sandbox.length}개 — 2페이지가 되지 않음`);
  const example = JSON.parse(readOut("examples/submission-format-example/sandbox.json"));
  const idxOf = sandbox.findIndex((c) => c.candidateId === example.recommendation.recommendedCandidateId);
  if (Math.floor(idxOf / 4) !== 1) stageBErrors.push("sandbox 예제가 두 번째 페이지 후보를 선택하지 않음");
  // Stable hooks the E2E depends on.
  const kiosk = readOut("apps/simulator-web/src/Kiosk.tsx");
  for (const hook of ['data-testid="candidate-card"', 'data-testid="candidate-page-prev"',
    'data-testid="candidate-page-next"', 'data-testid="candidate-page-indicator"',
    "data-candidate-id", "data-page-index", "data-slot-index"]) {
    if (!kiosk.includes(hook)) stageBErrors.push(`Kiosk 에 ${hook} 없음`);
  }
  // No legacy pseudo-sentinels anywhere in candidate data.
  for (const env of ["chicken-store", "hospital", "public-office", "sandbox"]) {
    const text = readOut(`environments/${env}/candidates.json`);
    for (const bad of ['"ANY"', '"ALL"', '"AUTO"', '"DEFAULT"']) {
      if (text.includes(bad)) stageBErrors.push(`${env}/candidates.json 에 미등록 sentinel ${bad}`);
    }
  }
  // Language fallback.
  if (!readOut("packages/evaluator/src/index.ts").includes('language ?? "ko-KR"')) {
    stageBErrors.push("Evidence 언어 fallback 이 ko-KR 이 아님");
  }
} catch (err) {
  stageBErrors.push(`검사 실패: ${err.message}`);
}
check("Stage B · vocabulary · 2page · labels", stageBErrors.length === 0, stageBErrors.slice(0, 5).join(" | "));

// --- domain artefacts inside the ZIP ---------------------------------------
let domainErrors = [];
try {
  const envs = ["chicken-store", "hospital", "public-office", "sandbox"];
  for (const env of envs) {
    for (const f of ["compatibility-rules.json", "review-mapping.json"]) {
      if (!has(`${PROJECT_NAME}/environments/${env}/${f}`)) domainErrors.push(`${env}/${f} 없음`);
    }
    // Candidate data must be canonical: no legacy lowercase domain enum.
    const candidates = JSON.parse(readOut(`environments/${env}/candidates.json`));
    for (const c of candidates) {
      for (const bag of ["attributes", "supportedOptions", "requirements"]) {
        for (const [k, v] of Object.entries(c[bag] ?? {})) {
          for (const one of Array.isArray(v) ? v : [v]) {
            if (typeof one === "string" && one && !/^[A-Z][A-Z0-9_]*$/.test(one)) {
              domainErrors.push(`${env}/${c.candidateId}.${bag}.${k} = "${one}" (소문자 enum)`);
            }
          }
        }
      }
    }
    // FOUR_CARD_GRID must page at four.
    const binding = JSON.parse(readOut(`environments/${env}/bindings/simulation.binding.json`));
    for (const [state, b] of Object.entries(binding.screens ?? {})) {
      if (b.template === "FOUR_CARD_GRID" && b.pageSize !== 4) domainErrors.push(`${env}/${state} pageSize=${b.pageSize}`);
    }
  }
  // Domain review promises.
  const hospital = JSON.parse(readOut("environments/hospital/review-mapping.json"));
  if (!hospital.fields.some((f) => f.fieldId === "departmentId")) domainErrors.push("병원 review 에 departmentId 매핑 없음");
  const office = JSON.parse(readOut("environments/public-office/review-mapping.json"));
  if (!office.fields.some((f) => f.fieldId === "authMethod")) domainErrors.push("관공서 review 에 authMethod 매핑 없음");

  // Official error codes must have a real emit path in the shipped sources.
  const engine = ["packages/evaluator/src/compatibility.ts", "packages/evaluator/src/index.ts",
    "packages/kiosk-driver-contract/src/review-resolver.ts", "apps/simulation-api/src/loader.ts"]
    .map((f) => { try { return readOut(f); } catch { return ""; } }).join("\n")
    + envs.map((e) => readOut(`environments/${e}/compatibility-rules.json`)).join("\n");
  for (const code of ["VISIT_TYPE_MISMATCH", "APPOINTMENT_MISMATCH", "DEPARTMENT_MISMATCH",
    "AUTH_METHOD_UNAVAILABLE", "REQUESTED_SERVICE_MISMATCH", "SERVICE_TYPE_MISMATCH",
    "ALLERGEN_CONFLICT", "PRICE_LIMIT_EXCEEDED", "LOW_CONFIDENCE_RECONFIRMATION_REQUIRED",
    "REVIEW_FIELD_UNRESOLVED", "ENVIRONMENT_CANDIDATE_DATA_CONFLICT"]) {
    if (!engine.includes(code)) domainErrors.push(`${code} 의 발생 경로 없음`);
  }
} catch (err) {
  domainErrors.push(`검사 실패: ${err.message}`);
}
check("Domain rules · review mappings · canonical enums", domainErrors.length === 0, domainErrors.slice(0, 5).join(" | "));

// --- the new tests must actually ship ---------------------------------------
const testFiles = [
  "tests/public/domain/compatibility.test.ts",
  "tests/public/domain/four-card-grid.test.ts",
  "tests/public/domain/review-and-data.test.ts",
  "tests/e2e/domain-validation.spec.ts",
  "tests/e2e/sandbox-flow.spec.ts",
];
const missingTests = testFiles.filter((f) => !has(`${PROJECT_NAME}/${f}`));
check("Domain · grid · E2E tests shipped", missingTests.length === 0, missingTests.join(", "));

// --- README promises must hold inside the package ---------------------------
let readmeErrors = [];
try {
  const readmeFirst = readOut("README_FIRST.md");
  for (const f of ["start-macos.command", "start-windows.bat", "start-linux.sh"]) {
    if (!readmeFirst.includes(f)) readmeErrors.push(`README_FIRST 가 ${f} 를 안내하지 않음`);
    if (!has(`${PROJECT_NAME}/${f}`)) readmeErrors.push(`${f} 가 ZIP 에 없음`);
  }
  if (!/localhost:3000/.test(readmeFirst)) readmeErrors.push("README_FIRST 에 Web 포트 3000 안내 없음");
  if (!/localhost:4000/.test(readmeFirst)) readmeErrors.push("README_FIRST 에 API 포트 4000 안내 없음");
  if (/localhost:5173/.test(readmeFirst)) readmeErrors.push("README_FIRST 에 잘못된 포트 5173");
  const pkgOut = JSON.parse(readOut("package.json"));
  if (!pkgOut.scripts?.["test:e2e"]) readmeErrors.push("test:e2e 스크립트 없음");
} catch (err) {
  readmeErrors.push(`검사 실패: ${err.message}`);
}
check("README 약속 일치 (시작파일 · 포트 · 스크립트)", readmeErrors.length === 0, readmeErrors.slice(0, 4).join(" | "));

// 우리가 만든 임시 디렉터리만 지웁니다. 배포본 자기검증에서는 tmp 가 참가팀의
// 상위 폴더이므로, 그것을 지우면 남의 파일을 지우는 셈이 됩니다.
if (SCRATCH_DIR) execFileSync("rm", ["-rf", SCRATCH_DIR]);

// --- report -----------------------------------------------------------------
console.log("PUBLIC PACKAGE VERIFICATION\n");
const width = Math.max(...results.map((r) => r.label.length)) + 2;
for (const r of results) {
  const state = r.skipped ? "NOT_APPLICABLE" : r.ok ? "PASS" : "FAIL";
  const showDetail = r.detail && (!r.ok || r.skipped || r.label === "실행 모드");
  console.log(`${r.label.padEnd(width)}${state}${showDetail ? `  (${r.detail})` : ""}`);
}
const failed = results.filter((r) => !r.ok);
console.log("");
if (MODE === "source-release") {
  const size = statSync(ZIP_PATH).size;
  const sha = createHash("sha256").update(readFileSync(ZIP_PATH)).digest("hex");
  console.log(`ZIP     : ${ZIP_PATH}`);
  console.log(`크기    : ${(size / 1024 / 1024).toFixed(2)} MB (${size} bytes)`);
  console.log(`항목수  : ${entries.length}`);
  console.log(`SHA256  : ${sha}`);
  console.log("");
  console.log(`node_modules ${nodeModules} · dist ${dist} · build ${build} · __MACOSX ${macosx} · .DS_Store ${dsStore} · private ${privateHits}`);
} else {
  console.log(`검사 대상: ${ROOT}`);
  console.log(`항목수   : ${entries.length} (설치·실행 산출물 제외)`);
  console.log(`제품 버전: ${PRODUCT_VERSION} · inputContractVersion ${CONTRACT_VERSION}`);
}

if (failed.length) {
  console.error(`\n검증 실패 ${failed.length}건:`);
  for (const f of failed) console.error(`  ✗ ${f.label} ${f.detail}`);
  process.exit(1);
}
console.log("\n모든 검사 통과.");
