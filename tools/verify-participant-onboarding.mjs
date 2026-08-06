#!/usr/bin/env node
/**
 * Verifies the Participant Edition holds together.
 *
 *   node tools/verify-participant-onboarding.mjs [projectRoot]
 *
 * The failure this guards against is quiet: a team opens the ZIP, follows the
 * first document, and hits a dead link or a command that does not exist. None
 * of that shows up in a unit test.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf-8");
const exists = (rel) => existsSync(path.join(ROOT, rel));

const errors = [];
const notes = [];
const bad = (m) => errors.push(m);

const PKG = JSON.parse(read("package.json"));
const VERSION = PKG.version;
const CONTRACT = "1.0.0";
const WEB_PORT = "3000";
const API_PORT = "4000";

/* 1. entry points a team meets first */
const ENTRY = [
  "00_START_HERE.html", "00_START_HERE.md", "README_FIRST.md",
  "PARTICIPANT_CHECKLIST.md", "FINAL_SUBMISSION_CHECKLIST.md",
  "DO_NOT_EDIT_PLATFORM_FILES.md",
  "participant-workspace/EDIT_ONLY_THIS_FOLDER.md",
  "participant-workspace/README.md",
  "participant-workspace/src/participant.ts",
  "submission-output/README.md",
];
for (const f of ENTRY) if (!exists(f)) bad(`시작 파일 없음: ${f}`);

/* 2. the offline page must really be offline */
if (exists("00_START_HERE.html")) {
  const html = read("00_START_HERE.html");
  for (const [re, what] of [
    [/<script[^>]+\ssrc=/i, "외부 script"],
    [/<link[^>]+href=["']https?:/i, "외부 stylesheet"],
    [/@import\s+url\(["']?https?:/i, "외부 @import"],
    [/https?:\/\/(?!localhost|127\.0\.0\.1|nodejs\.org)[^"'\s)]+/i, "외부 URL"],
  ]) {
    const m = html.match(re);
    if (m) bad(`00_START_HERE.html 에 ${what} 이 있습니다: ${String(m[0]).slice(0, 60)}`);
  }
  if (!html.includes("lang=\"ko\"")) bad("00_START_HERE.html 에 lang=\"ko\" 가 없습니다.");
  if (!html.includes("localStorage")) bad("00_START_HERE.html 에 체크 상태 저장이 없습니다.");
  if (!html.includes(VERSION)) bad(`00_START_HERE.html 에 제품 버전 ${VERSION} 표시가 없습니다.`);
  if (!html.includes(CONTRACT)) bad(`00_START_HERE.html 에 inputContractVersion ${CONTRACT} 표시가 없습니다.`);
  if (!/aria-|role=/.test(html)) bad("00_START_HERE.html 에 접근성 속성이 없습니다.");

  // Every relative href must resolve.
  const broken = [];
  for (const m of html.matchAll(/href="([^"#][^"]*)"/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    if (!existsSync(path.join(ROOT, decodeURIComponent(target)))) broken.push(target);
  }
  if (broken.length > 0) bad(`00_START_HERE.html 의 깨진 링크: ${broken.join(", ")}`);
  notes.push("00_START_HERE.html — 외부 요청 0 · 상대링크 유효");
}

/* 3. the nine steps, each properly documented */
if (exists("participant-workspace/src/participant.ts")) {
  const src = read("participant-workspace/src/participant.ts");
  const STEPS = ["collectProfile", "mapToCanonicalInput", "createSessionContext",
    "filterCandidates", "recommend", "explainRecommendation",
    "buildAlternatives", "collectUserDecision", "buildExecutionPlan"];
  let documented = 0;
  for (const [i, fn] of STEPS.entries()) {
    if (!new RegExp(`function ${fn}\\b`).test(src)) { bad(`participant.ts 에 ${fn} 이 없습니다.`); continue; }
    if (!new RegExp(`todo\\("${fn}"`).test(src)) bad(`${fn} 이 TODO 상태가 아닙니다.`);
    // The doc block sits immediately above the declaration.
    const at = src.indexOf(`export ${src.includes(`export async function ${fn}`) ? "async " : ""}function ${fn}`);
    const block = src.slice(Math.max(0, at - 2600), at);
    const missing = [];
    if (!block.includes(`STEP ${i + 1} — ${fn}`)) missing.push("STEP 번호");
    for (const [needle, label] of [["목적:", "목적"], ["입력", "입력"], ["반환", "반환"],
      ["금지", "금지"], ["완료 확인", "완료 확인"]]) {
      if (!block.includes(needle)) missing.push(label);
    }
    if (missing.length > 0) bad(`${fn} 주석에 없음: ${missing.join(", ")}`);
    else documented += 1;
  }
  notes.push(`participant.ts — 9단계 중 ${documented}개 주석 완비`);

  // A leaked answer would defeat the whole exercise.
  for (const env of ["chicken-store", "hospital", "public-office"]) {
    try {
      for (const c of JSON.parse(read(`environments/${env}/candidates.json`))) {
        if (src.includes(c.candidateId)) bad(`participant.ts 에 정답 후보 ID 노출: ${c.candidateId}`);
      }
    } catch { /* environment missing is reported elsewhere */ }
  }
}

/* 4. annotated examples — explanatory only, never executable */
const annotatedDir = path.join(ROOT, "examples", "annotated");
if (!existsSync(annotatedDir)) bad("examples/annotated 가 없습니다.");
else {
  const files = readdirSync(annotatedDir).filter((f) => f.endsWith(".jsonc"));
  if (files.length < 7) bad(`annotated JSONC 가 ${files.length}개 (7개 필요).`);
  for (const f of files) {
    const text = read(`examples/annotated/${f}`);
    if (!text.includes("직접 제출하지 마세요")) bad(`${f} 에 제출 금지 경고가 없습니다.`);
    if (!text.includes("submission-format-example/sandbox.json")) bad(`${f} 에 실행 예제 안내가 없습니다.`);
    for (const env of ["chicken-store", "hospital", "public-office"]) {
      try {
        for (const c of JSON.parse(read(`environments/${env}/candidates.json`))) {
          if (text.includes(c.candidateId)) bad(`${f} 에 정답 후보 ID 노출: ${c.candidateId}`);
        }
      } catch { /* handled above */ }
    }
  }
  notes.push(`annotated JSONC ${files.length}개 — 정답 노출 없음`);
}
// A .jsonc must never be wired in as a runnable example.
for (const dir of ["tools", "tests", "apps", "packages", "examples/minimal-participant-client"]) {
  const full = path.join(ROOT, dir);
  if (!existsSync(full)) continue;
  (function scan(d) {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const fp = path.join(d, entry);
      if (statSync(fp).isDirectory()) { scan(fp); continue; }
      if (!/\.(ts|tsx|mjs|js)$/.test(entry)) continue;
      if (/annotated[^"'\s]*\.jsonc/.test(readFileSync(fp, "utf-8"))) {
        bad(`${path.relative(ROOT, fp)} 가 annotated JSONC 를 실행 예제로 참조합니다.`);
      }
    }
  })(full);
}

/* 5. environment guides */
const GUIDES = ["README", "CHICKEN_STORE_PARTICIPANT_GUIDE", "HOSPITAL_PARTICIPANT_GUIDE",
  "PUBLIC_OFFICE_PARTICIPANT_GUIDE", "SANDBOX_PARTICIPANT_GUIDE"];
for (const g of GUIDES) if (!exists(`docs/environments/${g}.md`)) bad(`환경 가이드 없음: docs/environments/${g}.md`);
notes.push(`환경 가이드 ${GUIDES.length}개`);

/* 6. error catalog covers the codes teams actually meet */
if (!exists("docs/ERROR_CATALOG.md")) bad("docs/ERROR_CATALOG.md 가 없습니다.");
else {
  const cat = read("docs/ERROR_CATALOG.md");
  const MUST = ["INVALID_UTC_TIMESTAMP", "DOMAIN_CONTEXT_MISMATCH", "SCHEMA_INVALID",
    "CANDIDATE_NOT_FOUND", "CANDIDATE_UNAVAILABLE", "ALLERGEN_CONFLICT",
    "AUTH_METHOD_UNAVAILABLE", "SELECTED_AUTH_METHOD_UNAVAILABLE",
    "ACTIONS_WITHOUT_APPROVAL", "REQUIRED_OPTION_MISSING", "STATE_MISMATCH",
    "FORBIDDEN_ACTION", "MISSING_VERIFIER", "BOUNDARY_NOT_REACHED", "REVIEW_FIELD_UNRESOLVED"];
  const missing = MUST.filter((c) => !cat.includes(c));
  if (missing.length > 0) bad(`ERROR_CATALOG 에 없는 코드: ${missing.join(", ")}`);
  notes.push(`ERROR_CATALOG — 필수 코드 ${MUST.length - missing.length}/${MUST.length}`);
}
if (!exists("docs/TROUBLESHOOTING_DECISION_TREE.md")) bad("docs/TROUBLESHOOTING_DECISION_TREE.md 가 없습니다.");
if (!exists("docs/FINAL_SUBMISSION_GUIDE.md")) bad("docs/FINAL_SUBMISSION_GUIDE.md 가 없습니다.");

/* 7. CLI commands exist and are wired */
const CLI = ["doctor", "demo", "init", "progress", "validate", "package"];
for (const c of CLI) {
  const key = `participant:${c}`;
  if (!PKG.scripts[key]) bad(`npm script 없음: ${key}`);
  else if (!PKG.scripts[key].includes("participant-cli.mjs")) bad(`${key} 가 participant-cli.mjs 를 호출하지 않습니다.`);
}
if (!exists("tools/participant-cli.mjs")) bad("tools/participant-cli.mjs 가 없습니다.");
notes.push(`참가팀 CLI ${CLI.length}개`);

/* 7b. 사용자 접점 자료 (v5.1.1) — 파일 존재 + 최소 크기 */
const UX_ASSETS = [
  ["participant-workspace/example-ui/index.html", 3000],
  ["participant-workspace/example-ui/app.js", 6000],
  ["participant-workspace/example-ui/styles.css", 1500],
  ["participant-workspace/example-ui/README.md", 1500],
  ["participant-workspace/example-ui/mock-context.json", 200],
  ["participant-workspace/example-ui/tests/example-ui.spec.ts", 100],
  ["participant-workspace/participant-ux.template.json", 200],
  ["docs/API_EXAMPLES/README.md", 1500], ["docs/API_EXAMPLES/CURL.md", 1500],
  ["docs/API_EXAMPLES/JAVASCRIPT_FETCH.md", 1500], ["docs/API_EXAMPLES/TYPESCRIPT_SDK.md", 1500],
  ["docs/API_EXAMPLES/PYTHON_REQUESTS.md", 1500], ["docs/API_EXAMPLES/JAVA_SPRING.md", 1500],
  ["docs/PARTICIPANT_IDEA_CATALOG.md", 4000],
  ["docs/LOGINLESS_QR_PROFILE_GUIDE.md", 2500],
  ["docs/CONTEXT_AWARE_RECOMMENDATION_GUIDE.md", 2500],
  ["docs/EXPLAINABLE_RECOMMENDATION_GUIDE.md", 2500],
  ["docs/EXTERNAL_API_SAFETY_GUIDE.md", 2500],
  ["tests/e2e/offline-start-here.spec.ts", 2000],
  ["tests/e2e/participant-example-ui.spec.ts", 3000],
];
for (const [f, min] of UX_ASSETS) {
  if (!exists(f)) { bad(`${f} 가 없습니다.`); continue; }
  const n = readFileSync(path.join(ROOT, f)).length;
  if (n < min) bad(`${f} 이 너무 작습니다 (${n} bytes, 최소 ${min}).`);
}
notes.push(`사용자 접점 자료 ${UX_ASSETS.length}개`);

for (const sc of ["verify:api-examples", "verify:participant-ux-guidance",
  "verify:participant-auth-privacy-copy"]) {
  if (!PKG.scripts[sc]) bad(`npm script 없음: ${sc}`);
  if (!(PKG.scripts["release:verify"] ?? "").includes(sc)) bad(`release:verify 가 ${sc} 를 부르지 않습니다.`);
}

// START_HERE 에서 예제 UI 와 아이디어 카탈로그로 가는 길이 있어야 합니다.
for (const d of ["00_START_HERE.html"]) {
  if (!exists(d)) continue;
  const t = read(d);
  for (const link of ["participant-workspace/example-ui/index.html", "docs/PARTICIPANT_IDEA_CATALOG.md"]) {
    if (!t.includes(link)) bad(`${d} 에 ${link} 링크가 없습니다.`);
  }
}

/* 7c. Windows 최종 체크리스트 — 참가팀 루트에 있어야 합니다 (v5.1.2)
 *
 * v5.1.1 은 release/ 에만 두어 참가팀이 받지 못했습니다. release/ 는 배포본에
 * 들어가지 않으므로, 여기서는 오직 프로젝트 루트만 인정합니다.
 */
const CHECKLIST = "WINDOWS_FINAL_CHECKLIST.md";
if (!exists(CHECKLIST)) {
  bad(`PARTICIPANT_WINDOWS_CHECKLIST_MISSING: 루트에 ${CHECKLIST} 가 없습니다.`);
  if (exists(`release/${CHECKLIST}`)) {
    bad(`${CHECKLIST} 가 release/ 에만 있습니다. 참가팀 배포본에는 release/ 가 들어가지 않습니다.`);
  }
} else {
  const text = read(CHECKLIST);
  const bytes = readFileSync(path.join(ROOT, CHECKLIST)).length;
  if (bytes === 0) bad(`${CHECKLIST} 이 비어 있습니다.`);

  if (!text.includes(VERSION)) bad(`${CHECKLIST} 에 제품 버전 ${VERSION} 표시가 없습니다.`);
  if (!text.includes(CONTRACT)) bad(`${CHECKLIST} 에 inputContractVersion ${CONTRACT} 표시가 없습니다.`);

  // 현재 안내에 이전 버전이 남아 있으면 실패입니다.
  for (const oldVersion of ["5.1.1", "5.1.0"]) {
    if (oldVersion !== VERSION && text.includes(oldVersion)) {
      bad(`WINDOWS_CHECKLIST_VERSION_MISMATCH: ${CHECKLIST} 에 이전 버전 ${oldVersion} 이 남아 있습니다.`);
    }
  }

  for (const needle of ["start-windows.bat", "stop-windows.bat", WEB_PORT, API_PORT,
    ...["doctor", "demo", "init", "progress", "validate", "package"].map((c) => `participant:${c}`)]) {
    if (!text.includes(needle)) bad(`${CHECKLIST} 에 ${needle} 안내가 없습니다.`);
  }

  // 실행 검증을 하지 않았다면 NOT_RUN 이어야 합니다.
  if (!/WINDOWS_RUNTIME_VALIDATION/.test(text)) {
    bad(`${CHECKLIST} 에 WINDOWS_RUNTIME_VALIDATION 표기가 없습니다.`);
  } else if (!/WINDOWS_RUNTIME_VALIDATION[^\n]*NOT_RUN/.test(text)
    && !/WINDOWS_RUNTIME_VALIDATION[^\n]*PASS[^\n]*(증거|evidence)/i.test(text)) {
    bad(`${CHECKLIST} 의 WINDOWS_RUNTIME_VALIDATION 은 NOT_RUN 이거나 증거를 함께 적어야 합니다.`);
  }
  if (!/WINDOWS_STATIC_VALIDATION/.test(text)) bad(`${CHECKLIST} 에 WINDOWS_STATIC_VALIDATION 표기가 없습니다.`);

  // 템플릿 단일 원본에서 나왔는지
  if (!exists("tools/templates/WINDOWS_FINAL_CHECKLIST.template.md")) {
    bad("체크리스트 원본 템플릿이 없습니다: tools/templates/WINDOWS_FINAL_CHECKLIST.template.md");
  }
  notes.push(`Windows 체크리스트 ${bytes} bytes — 루트 포함`);
}

/* 7d. 진입 문서에서 체크리스트로 가는 길 */
for (const [doc, needle] of [
  ["00_START_HERE.html", "WINDOWS_FINAL_CHECKLIST.md"],
  ["00_START_HERE.md", "WINDOWS_FINAL_CHECKLIST.md"],
  ["README_FIRST.md", "WINDOWS_FINAL_CHECKLIST.md"],
  ["PARTICIPANT_CHECKLIST.md", "WINDOWS_FINAL_CHECKLIST.md"],
]) {
  if (!exists(doc)) { bad(`${doc} 가 없습니다.`); continue; }
  if (!read(doc).includes(needle)) bad(`${doc} 에 ${needle} 링크가 없습니다.`);
}
// 링크 대상이 실제로 존재하는지 (상대경로 그대로)
if (exists("00_START_HERE.html")) {
  const html = read("00_START_HERE.html");
  const hrefs = [...html.matchAll(/href="([^"]*WINDOWS_FINAL_CHECKLIST\.md)"/g)].map((m) => m[1]);
  if (hrefs.length === 0) bad("00_START_HERE.html 에 체크리스트 href 가 없습니다.");
  for (const h of hrefs) {
    if (/^https?:/i.test(h)) bad(`00_START_HERE.html 의 체크리스트 링크가 외부 URL 입니다: ${h}`);
    if (!existsSync(path.join(ROOT, h.replace(/^\.\//, "")))) {
      bad(`00_START_HERE.html 의 체크리스트 링크 대상이 없습니다: ${h}`);
    }
  }
}

/* 7e. 참가팀이 읽는 안내에 이전 제품 버전이 남아 있으면 실패
 *
 * 역사 기록(RELEASE_NOTES/CHANGELOG/MIGRATION)과 의존성 lock 은 예외입니다.
 * 나머지는 지금 배포되는 버전만 말해야 합니다.
 */
const HISTORICAL = /RELEASE_NOTES|CHANGELOG|MIGRATION|DO_NOT_SHARE/i;
const PARTICIPANT_FACING = [
  "00_START_HERE.html", "00_START_HERE.md", "README.md", "README_FIRST.md",
  "PARTICIPANT_CHECKLIST.md", "FINAL_SUBMISSION_CHECKLIST.md",
  "DO_NOT_EDIT_PLATFORM_FILES.md", "WINDOWS_FINAL_CHECKLIST.md",
  "start-windows.bat", "start-macos.command", "start-linux.sh", "Dockerfile",
];
for (const dir of ["docs", "participant-workspace", "examples/annotated"]) {
  const full = path.join(ROOT, dir);
  if (!existsSync(full)) continue;
  (function walk(d) {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules") continue;
      const fp = path.join(d, entry);
      if (statSync(fp).isDirectory()) { walk(fp); continue; }
      if (/\.(md|html)$/.test(entry)) PARTICIPANT_FACING.push(path.relative(ROOT, fp));
    }
  })(full);
}
const staleVersions = [];
for (const f of PARTICIPANT_FACING) {
  if (!exists(f) || HISTORICAL.test(f)) continue;
  for (const m of read(f).matchAll(/\b5\.\d+\.\d+\b/g)) {
    if (m[0] !== VERSION) staleVersions.push(`${f}: ${m[0]}`);
  }
}
if (staleVersions.length > 0) {
  bad(`현재 안내에 이전 제품 버전이 남아 있습니다 (${staleVersions.length}건): ${staleVersions.slice(0, 5).join(", ")}`);
}
notes.push(`참가팀 안내 ${PARTICIPANT_FACING.length}개 — 이전 버전 문자열 ${staleVersions.length}건`);

/* 8. every npm command printed in participant docs must exist */
const DOCS = ["00_START_HERE.md", "00_START_HERE.html", "README_FIRST.md",
  "PARTICIPANT_CHECKLIST.md", "FINAL_SUBMISSION_CHECKLIST.md",
  "participant-workspace/README.md", "participant-workspace/EDIT_ONLY_THIS_FOLDER.md",
  "docs/environments/README.md"];
const scriptNames = new Set(Object.keys(PKG.scripts));
for (const d of DOCS) {
  if (!exists(d)) continue;
  const text = read(d);
  for (const m of text.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
    if (!scriptNames.has(m[1])) bad(`${d}: 존재하지 않는 명령 npm run ${m[1]}`);
  }
  // One recommended path: docs must not print a rival port.
  for (const wrong of ["5173", "8080"]) {
    if (text.includes(`localhost:${wrong}`)) bad(`${d}: 잘못된 포트 ${wrong}`);
  }
}

/* 9. one flow, one version */
for (const d of ["00_START_HERE.md", "00_START_HERE.html"]) {
  if (!exists(d)) continue;
  const text = read(d);
  for (const step of ["participant:doctor", "participant:demo", "participant:init",
    "participant:progress", "participant:validate", "participant:package"]) {
    if (!text.includes(step)) bad(`${d} 에 권장 경로 단계 누락: ${step}`);
  }
  if (!text.includes(WEB_PORT) || !text.includes(API_PORT)) bad(`${d} 에 공식 포트 표시가 없습니다.`);
}

console.log("PARTICIPANT ONBOARDING VERIFICATION");
console.log("=".repeat(52));
console.log(`  제품 버전   : ${VERSION}`);
console.log(`  입력계약    : ${CONTRACT}`);
console.log(`  공식 포트   : Web ${WEB_PORT} · API ${API_PORT}`);
for (const n of notes) console.log(`  ${n}`);
console.log("");

if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("참가팀 온보딩 경로가 일관되게 구성되어 있습니다.");
