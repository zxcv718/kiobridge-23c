#!/usr/bin/env node
/**
 * 사용자 접점 자료가 실제로 들어 있는지 검사합니다.
 *
 *   node tools/verify-participant-ux-guidance.mjs [projectRoot]
 *
 * v5.1.0 에서 빈 디렉터리만 만들고 넘어간 일이 있었습니다. 이 검증기는
 * 파일 존재가 아니라 내용을 봅니다.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf-8");
const exists = (rel) => existsSync(path.join(ROOT, rel));
const size = (rel) => (exists(rel) ? readFileSync(path.join(ROOT, rel)).length : 0);

const errors = [];
const notes = [];

/* 1. example-ui — 실제 동작하는 파일이어야 합니다 */
const UI_DIR = "participant-workspace/example-ui";
const UI_FILES = [
  ["index.html", 3000], ["app.js", 6000], ["styles.css", 1500],
  ["README.md", 1500], ["mock-context.json", 200], ["tests/example-ui.spec.ts", 100],
];
for (const [f, min] of UI_FILES) {
  const rel = `${UI_DIR}/${f}`;
  if (!exists(rel)) { errors.push(`없음: ${rel}`); continue; }
  if (size(rel) < min) errors.push(`${rel} 이 너무 작습니다 (${size(rel)} bytes, 최소 ${min})`);
}
if (exists(`${UI_DIR}/index.html`)) {
  const html = read(`${UI_DIR}/index.html`);
  // 인터넷 없이 열려야 합니다.
  for (const [re, what] of [
    [/<script[^>]+\ssrc=["']https?:/i, "외부 script"],
    [/<link[^>]+href=["']https?:/i, "외부 stylesheet"],
    [/@import\s+url\(["']?https?:/i, "외부 @import"],
  ]) if (re.test(html)) errors.push(`example-ui 에 ${what} 이 있습니다.`);

  if (!/lang="ko"/.test(html)) errors.push("example-ui index.html 에 lang=\"ko\" 가 없습니다.");
  if (!/class="skip"/.test(html)) errors.push("example-ui 에 skip link 가 없습니다.");
  if (!/aria-live/.test(html)) errors.push("example-ui 에 aria-live 영역이 없습니다.");
  // 로그인을 요구하는 컨트롤이 없어야 합니다.
  if (/type="password"|type="email"/.test(html)) errors.push("example-ui 가 로그인 입력을 요구합니다.");
  // 필수 흐름 요소
  for (const [id, label] of [
    ["start-anon", "익명 시작"], ["p-large", "큰 글씨"], ["p-contrast", "고대비"],
    ["save-no", "이번만 사용"], ["a11y-forget", "저장정보 삭제"], ["qr-mock", "Mock QR"],
    ["rec-reasons", "추천 이유"], ["rec-alts", "대안"], ["rec-reject", "추천 거절"],
    ["confirm-yes", "사용자 최종 확인"], ["preview-submission", "Canonical 미리보기"],
    ["preview-plan", "Semantic Plan 미리보기"], ["download-json", "JSON 내려받기"],
    ["rec-staff", "직원 도움"],
  ]) if (!html.includes(`id="${id}"`)) errors.push(`example-ui 에 ${label}(${id}) 이 없습니다.`);
  notes.push(`example-ui — 파일 ${UI_FILES.length}개 · 외부 리소스 0`);
}
if (exists(`${UI_DIR}/app.js`)) {
  const js = read(`${UI_DIR}/app.js`);
  for (const [needle, label] of [
    ["LOCAL UI PREVIEW ONLY", "미리보기 모드 표시"],
    ["SIMULATION SERVER RESULT", "서버 결과 표시"],
    ["localStorage", "기기 내 저장"],
    ["contextSignals", "상황 정보 확장"],
    ["userConfirmed", "사용자 확인 게이트"],
  ]) if (!js.includes(needle)) errors.push(`example-ui app.js 에 ${label} 이 없습니다.`);
  // 서버가 없을 때 가짜 PASS 를 만들면 안 됩니다.
  if (/result\s*[:=]\s*["']PASS["']/.test(js)) errors.push("example-ui 가 PASS 를 직접 만들어 냅니다.");
  // 공식 환경 정답 노출 금지
  for (const env of ["chicken-store", "hospital", "public-office"]) {
    try {
      for (const c of JSON.parse(read(`environments/${env}/candidates.json`))) {
        if (js.includes(c.candidateId)) errors.push(`example-ui 에 정답 후보 ID 노출: ${c.candidateId}`);
      }
    } catch { /* 다른 검증기가 잡습니다 */ }
  }
}

/* 2. 사용자 접점 가이드 5종 */
const GUIDES = [
  ["docs/PARTICIPANT_IDEA_CATALOG.md", 4000],
  ["docs/LOGINLESS_QR_PROFILE_GUIDE.md", 2500],
  ["docs/CONTEXT_AWARE_RECOMMENDATION_GUIDE.md", 2500],
  ["docs/EXPLAINABLE_RECOMMENDATION_GUIDE.md", 2500],
  ["docs/EXTERNAL_API_SAFETY_GUIDE.md", 2500],
];
for (const [f, min] of GUIDES) {
  if (!exists(f)) { errors.push(`없음: ${f}`); continue; }
  if (size(f) < min) errors.push(`${f} 이 너무 짧습니다 (${size(f)} bytes, 최소 ${min})`);
}
notes.push(`사용자 접점 가이드 ${GUIDES.length}개`);

/* 3. 핵심 원칙이 문서에 담겨 있다 */
const PRINCIPLE_DOCS = ["00_START_HERE.html", "00_START_HERE.md", "docs/WHAT_YOU_BUILD.md",
  "participant-workspace/README.md", `${UI_DIR}/README.md`, "docs/PARTICIPANT_IDEA_CATALOG.md"];
for (const d of PRINCIPLE_DOCS) {
  if (!exists(d)) { errors.push(`없음: ${d}`); continue; }
  const t = read(d);
  if (!/키오스크\s*(자체|를)\s*(를\s*)?(다시|새로)\s*만드/.test(t)) {
    errors.push(`${d} 에 "키오스크를 새로 만들지 않는다" 원칙이 없습니다.`);
  }
}

/* 4. 원칙별 필수 내용 */
const REQUIRED_CONTENT = [
  ["docs/LOGINLESS_QR_PROFILE_GUIDE.md", [["로그인", "무로그인"], ["삭제", "삭제 경로"],
    ["이번 한 번만", "일회성 사용"], ["개인정보", "개인정보 주의"]]],
  ["docs/CONTEXT_AWARE_RECOMMENDATION_GUIDE.md", [["contextSignals", "확장 예제"],
    ["observedAt", "수집시각"], ["hardConstraint", "제약 우선순위"], ["namespace", "namespace 규칙"]]],
  ["docs/EXPLAINABLE_RECOMMENDATION_GUIDE.md", [["AI가 추천", "나쁜 설명 예"],
    ["대안", "대안"], ["거절", "거절"], ["확인", "사용자 확인"]]],
  ["docs/EXTERNAL_API_SAFETY_GUIDE.md", [["timeout", "timeout"], ["fallback", "fallback"],
    ["cache", "캐시"], ["API Key", "Key 보관"], ["expiresAt", "만료"]]],
];
for (const [f, needles] of REQUIRED_CONTENT) {
  if (!exists(f)) continue;
  const t = read(f);
  for (const [needle, label] of needles) {
    if (!t.includes(needle)) errors.push(`${f} 에 ${label} 설명이 없습니다.`);
  }
}

/* 5. UX 선언 템플릿과 CLI 검사 */
const TPL = "participant-workspace/participant-ux.template.json";
if (!exists(TPL)) errors.push(`없음: ${TPL}`);
else {
  const doc = JSON.parse(read(TPL));
  for (const k of ["anonymousStartSupported", "loginRequired", "localProfileStorage",
    "deleteStoredProfileSupported", "oneTimeUseSupported", "recommendationReasonsShown",
    "alternativesShown", "recommendationCanBeRejected", "userConfirmationRequired",
    "externalApiUsed", "externalApiFallbackDocumented", "accessibilityChannels", "manualReviewNotes"]) {
    if (!(k in doc)) errors.push(`${TPL} 에 ${k} 가 없습니다.`);
  }
  if (doc.loginRequired !== false) errors.push(`${TPL} 의 loginRequired 기본값은 false 여야 합니다.`);
}
const cli = exists("tools/participant-cli.mjs") ? read("tools/participant-cli.mjs") : "";
for (const [needle, label] of [
  ["participant-ux.json", "UX 선언 생성"],
  ["MANUAL_REVIEW_REQUIRED", "수동 검토 표시"],
  ["MANUAL_REVIEW_CHECKLIST.md", "제출 체크리스트"],
  ["recommendationReasons", "추천 이유 검사"],
  ["contextSignals", "contextSignal 검사"],
]) if (!cli.includes(needle)) errors.push(`participant-cli 에 ${label} 이 없습니다.`);

/* 6. E2E 두 개 */
for (const [f, min] of [["tests/e2e/offline-start-here.spec.ts", 2000],
  ["tests/e2e/participant-example-ui.spec.ts", 3000]]) {
  if (!exists(f)) { errors.push(`없음: ${f}`); continue; }
  if (size(f) < min) errors.push(`${f} 이 너무 짧습니다.`);
}

/* 7. 빈 파일·미완성 표시 0 */
const SCAN_DIRS = ["docs", "participant-workspace", "examples/annotated"];
const empty = [];
const placeholders = [];
for (const dir of SCAN_DIRS) {
  const full = path.join(ROOT, dir);
  if (!existsSync(full)) continue;
  (function walk(d) {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules") continue;
      const fp = path.join(d, entry);
      if (statSync(fp).isDirectory()) { walk(fp); continue; }
      if (!/\.(md|jsonc|json|html|js|css)$/.test(entry)) continue;
      const rel = path.relative(ROOT, fp);
      const text = readFileSync(fp, "utf-8");
      if (text.trim().length === 0) empty.push(rel);
      // 팀이 채우도록 남겨둔 테스트 뼈대는 예외입니다.
      if (rel.includes("/tests/")) continue;
      for (const re of [/^\s*TODO\s*$/m, /^\s*[-*]\s*TODO\s*$/m, /나중에 작성/, /작성 예정/,
        /\(작성 중\)/, /\bTBD\b/, /coming soon/i, /여기에 내용을 채우세요/]) {
        if (re.test(text)) { placeholders.push(rel); break; }
      }
    }
  })(full);
}
if (empty.length > 0) errors.push(`빈 파일 ${empty.length}건: ${empty.slice(0, 5).join(", ")}`);
if (placeholders.length > 0) errors.push(`미완성 표시 ${placeholders.length}건: ${placeholders.slice(0, 5).join(", ")}`);

/* 8. 정답 누출 0 */
const leakScan = [...GUIDES.map(([f]) => f), `${UI_DIR}/README.md`, `${UI_DIR}/app.js`];
for (const f of leakScan) {
  if (!exists(f)) continue;
  const t = read(f);
  for (const env of ["chicken-store", "hospital", "public-office"]) {
    try {
      for (const c of JSON.parse(read(`environments/${env}/candidates.json`))) {
        if (t.includes(c.candidateId)) errors.push(`${f} 에 정답 후보 ID 노출: ${c.candidateId}`);
      }
    } catch { /* 다른 검증기 */ }
  }
}

console.log("PARTICIPANT UX GUIDANCE VERIFICATION");
console.log("=".repeat(52));
for (const n of notes) console.log(`  ${n}`);
console.log(`  빈 파일 ${empty.length} · 미완성 표시 ${placeholders.length}`);
console.log("");
if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("사용자 접점 자료가 실제 내용으로 존재하며 원칙이 일관되게 표시됩니다.");
