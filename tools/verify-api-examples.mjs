#!/usr/bin/env node
/**
 * API 예제 문서가 실제로 쓸 수 있는지 검사합니다.
 *
 *   node tools/verify-api-examples.mjs [projectRoot]
 *
 * 막으려는 실패: 문서를 그대로 복사했는데 경로가 틀렸거나, 없는 SDK 메서드를
 * 부르거나, timeout 없이 멈추는 코드를 참가팀이 그대로 쓰는 것.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const DIR = path.join(ROOT, "docs", "API_EXAMPLES");
const read = (f) => readFileSync(path.join(DIR, f), "utf-8");

const FILES = ["README.md", "CURL.md", "JAVASCRIPT_FETCH.md", "TYPESCRIPT_SDK.md",
  "PYTHON_REQUESTS.md", "JAVA_SPRING.md"];
const MIN_BYTES = 1500;

/** 서버가 실제로 제공하는 경로. 문서가 이 밖의 /api/v1 경로를 쓰면 오타입니다. */
const REAL_PATHS = [
  "/health",
  "/api/v1/environments",
  "/api/v1/environments/{env}/fixture",
  "/api/v1/environments/{env}/compatibility-rules",
  "/api/v1/environments/{env}/review-mapping",
  "/api/v1/vocabularies/{env}",
  "/api/v1/contracts",
  "/api/v1/sessions",
  "/api/v1/sessions/{id}/submission",
  "/api/v1/sessions/{id}/validate",
  "/api/v1/sessions/{id}/execute",
  "/api/v1/sessions/{id}/evidence",
];
const normalisePath = (p) =>
  p.replace(/\$\{[^}]+\}/g, "{x}").replace(/\{[^}]+\}/g, "{x}")
   .replace(/\/(sandbox|chicken-store|hospital|public-office)\b/g, "/{x}");
const REAL_SET = new Set(REAL_PATHS.map(normalisePath));

const errors = [];
const notes = [];

/* 1. 파일이 존재하고 비어 있지 않다 */
for (const f of FILES) {
  const full = path.join(DIR, f);
  if (!existsSync(full)) { errors.push(`없음: docs/API_EXAMPLES/${f}`); continue; }
  const size = readFileSync(full).length;
  if (size < MIN_BYTES) errors.push(`${f} 이 너무 짧습니다 (${size} bytes, 최소 ${MIN_BYTES})`);
}
if (errors.length > 0) { report(); process.exit(1); }
notes.push(`문서 ${FILES.length}개 · 합계 ${FILES.reduce((n, f) => n + readFileSync(path.join(DIR, f)).length, 0)} bytes`);

const all = FILES.map(read).join("\n");

/* 2. 미완성 표시가 남아 있지 않다 */
for (const [re, label] of [[/\bTODO\b/, "TODO"], [/나중에 작성/, "나중에 작성"],
  [/작성 예정/, "작성 예정"], [/coming soon/i, "coming soon"], [/lorem ipsum/i, "lorem ipsum"]]) {
  if (re.test(all)) errors.push(`API 예제에 미완성 표시가 있습니다: ${label}`);
}

/* 3. 공식 환경의 완성 제출물을 넣지 않았다 */
for (const env of ["chicken-store", "hospital", "public-office"]) {
  if (all.includes(`submission-format-example/${env}.json`)) {
    errors.push(`공식 환경 완성 제출물을 참조합니다: ${env}.json`);
  }
  try {
    for (const c of JSON.parse(readFileSync(path.join(ROOT, "environments", env, "candidates.json"), "utf-8"))) {
      if (all.includes(c.candidateId)) errors.push(`정답 후보 ID 노출: ${c.candidateId}`);
    }
  } catch { /* 환경 누락은 다른 검증기가 잡습니다 */ }
}
/* Sandbox 예제 또는 placeholder 는 있어야 합니다 */
if (!all.includes("submission-format-example/sandbox.json") && !all.includes("<YOUR_SUBMISSION>")) {
  errors.push("Sandbox 예제 경로나 <YOUR_SUBMISSION> placeholder 가 없습니다.");
}

/* 4. 문서가 부르는 API 경로가 실제로 존재한다 */
const seen = new Set();
for (const m of all.matchAll(/["'`(\s](\/api\/v1\/[A-Za-z0-9_${}/.\-]*)/g)) {
  const raw = m[1].replace(/[`"'),.]+$/, "");
  const norm = normalisePath(raw);
  if (!REAL_SET.has(norm)) { seen.add(raw); }
}
if (seen.size > 0) errors.push(`서버에 없는 API 경로: ${[...seen].join(", ")}`);
notes.push(`검사한 공식 경로 ${REAL_PATHS.length}개`);

/* 5. SDK 메서드가 실제로 존재한다 */
const sdkSource = readFileSync(path.join(ROOT, "packages/participant-sdk/src/index.ts"), "utf-8");
const tsDoc = read("TYPESCRIPT_SDK.md");
const missingSdk = [];
for (const m of tsDoc.matchAll(/\bclient\.([a-zA-Z]+)\s*\(/g)) {
  const name = m[1];
  if (!new RegExp(`\\b${name}\\s*\\(`).test(sdkSource)) missingSdk.push(name);
}
for (const named of ["validateCanonicalInput", "nowIso8601Utc", "isIso8601UtcTimestamp",
  "extractExecutionChoices", "KioBridgeSimulationClient", "KioBridgeApiError"]) {
  if (tsDoc.includes(named) && !sdkSource.includes(named)) missingSdk.push(named);
}
if (missingSdk.length > 0) errors.push(`SDK 에 없는 메서드: ${[...new Set(missingSdk)].join(", ")}`);

/* 6. timeout 과 오류 처리를 설명한다 */
for (const f of ["CURL.md", "JAVASCRIPT_FETCH.md", "PYTHON_REQUESTS.md", "JAVA_SPRING.md"]) {
  const text = read(f);
  if (!/timeout|max-time|Timeout/i.test(text)) errors.push(`${f} 에 timeout 설명이 없습니다.`);
  if (!/catch|except|StatusHandler|오류|error/i.test(text)) errors.push(`${f} 에 오류 처리 설명이 없습니다.`);
}
if (!/CORS/i.test(read("JAVASCRIPT_FETCH.md"))) errors.push("JAVASCRIPT_FETCH.md 에 CORS 설명이 없습니다.");
if (!/PowerShell/i.test(read("CURL.md"))) errors.push("CURL.md 에 PowerShell 차이 설명이 없습니다.");
if (!/pip install|requirements/i.test(read("PYTHON_REQUESTS.md"))) errors.push("PYTHON_REQUESTS.md 에 설치 명령이 없습니다.");
if (!/API Key|api-key/i.test(read("JAVA_SPRING.md"))) errors.push("JAVA_SPRING.md 에 API Key 보관 설명이 없습니다.");

/* 7. 코드 블록 문법 — 실행 가능한 언어는 실제 파서로 확인합니다 */
const tmp = mkdtempSync(path.join(tmpdir(), "kio-api-ex-"));
try {
  checkBlocks("JAVASCRIPT_FETCH.md", "js", (code, i) => {
    // 문서 예제는 최상위 await 을 쓰므로 module 로 감싸 문법만 확인합니다.
    const file = path.join(tmp, `js-${i}.mjs`);
    writeFileSync(file, code);
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  });
  checkBlocks("PYTHON_REQUESTS.md", "python", (code, i) => {
    const file = path.join(tmp, `py-${i}.py`);
    writeFileSync(file, code);
    execFileSync("python3", ["-m", "py_compile", file], { stdio: "pipe" });
  });
  // Java 는 컴파일러를 요구하지 않고 구조만 정적 확인합니다.
  const java = read("JAVA_SPRING.md");
  for (const [re, label] of [[/import\s+[\w.]+;/, "import 문"], [/class|record/, "타입 선언"],
    [/RestClient|WebClient/, "HTTP 클라이언트"], [/Timeout/, "timeout 설정"]]) {
    if (!re.test(java)) errors.push(`JAVA_SPRING.md 에 ${label} 이 없습니다.`);
  }
  // curl 블록의 경로도 실제 경로여야 합니다 (위 4번에서 함께 검사됨).
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function checkBlocks(file, lang, run) {
  const text = read(file);
  const re = new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g");
  let i = 0;
  for (const m of text.matchAll(re)) {
    const code = m[1];
    // 발췌 조각(선언 없이 이어지는 몇 줄)은 문법 검사 대상이 아닙니다.
    if (code.trim().split("\n").length < 4) { i += 1; continue; }
    if (/^\s*(\||\/\/ \.\.\.)/.test(code)) { i += 1; continue; }
    try { run(code, i); notes.push(`${file} ${lang} 블록 #${i} 문법 OK`); }
    catch (err) {
      const detail = `${err.stdout ?? ""}${err.stderr ?? ""}`.split("\n").filter(Boolean).slice(0, 2).join(" ");
      errors.push(`${file} 의 ${lang} 코드 블록 #${i} 문법 오류: ${detail || err.message}`);
    }
    i += 1;
  }
}

function report() {
  console.log("API EXAMPLE VERIFICATION");
  console.log("=".repeat(52));
  for (const n of notes) console.log(`  ${n}`);
  console.log("");
  if (errors.length > 0) {
    console.error(`실패 ${errors.length}건\n`);
    for (const e of errors) console.error(`  - ${e}`);
  }
}

report();
if (errors.length > 0) process.exit(1);
console.log("API 예제가 실제 서버 경로·SDK 메서드와 일치하며 복사 실행 가능합니다.");
