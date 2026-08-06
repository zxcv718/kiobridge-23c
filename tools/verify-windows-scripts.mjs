#!/usr/bin/env node
/**
 * WINDOWS_STATIC_VALIDATION — syntax checks for .bat / .cmd files.
 *
 * This is a STATIC check. It does NOT prove the scripts run on Windows; a real
 * Windows host is required for that. Never report its result as runtime proof.
 *
 *   node tools/verify-windows-scripts.mjs [projectRoot]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const SKIP = new Set(["node_modules", "dist", "build", "release", ".git", "playwright-report", "test-results"]);

/** Unix-only constructs that break in CMD. Patterns are built at runtime so
 *  this file never matches its own rules when it is itself scanned. */
const FORBIDDEN = [
  { id: "DEV_NULL", re: new RegExp(["/dev", "/null"].join("")), msg: "CMD 에서는 >nul 을 쓰세요." },
  { id: "SHEBANG", re: /#!\s*\/bin\//, msg: "배치파일에 shebang 을 쓸 수 없습니다." },
  { id: "CMD_SUBST", re: /\$\([^)]*\)/, msg: "$(...) 는 POSIX 문법입니다. for /f 를 쓰세요." },
  { id: "DIRNAME", re: /\bdirname\b/, msg: "dirname 대신 %~dp0 을 쓰세요." },
  { id: "PWD", re: /\$\(pwd\)|\bpwd\b/, msg: "pwd 대신 %CD% 를 쓰세요." },
  { id: "EXPORT", re: /^\s*export\s+/m, msg: "export 대신 set 을 쓰세요." },
  { id: "SET_E", re: /^\s*set\s+-e\b/m, msg: "set -e 는 bash 전용입니다. errorlevel 을 검사하세요." },
  { id: "BASH_TEST", re: /\[\[\s|\s\]\]/, msg: "[[ ]] 는 bash 전용입니다." },
  { id: "UNQUOTED_CD", re: /cd\s+\/d\s+%~dp0/, msg: 'cd /d "%~dp0" 처럼 따옴표로 감싸세요.' },
];

/** Every .bat must have these. */
const REQUIRED = [
  { id: "CD_SCRIPT_DIR", re: /cd\s+\/d\s+"%~dp0"/, msg: 'cd /d "%~dp0" 이 필요합니다.' },
  { id: "NUL_REDIRECT", re: />nul\b/i, msg: ">nul 리다이렉션이 필요합니다." },
  { id: "ERRORLEVEL", re: /if\s+errorlevel\s+1/i, msg: "errorlevel 검사가 필요합니다." },
  { id: "EXIT_B", re: /exit\s+\/b\b/i, msg: "exit /b 로 종료코드를 반환하세요." },
];

/** Per-file extra requirements. */
const PER_FILE = {
  "start-windows.bat": [
    { id: "NPM_CI", re: /call\s+npm\s+ci/i, msg: "call npm ci 가 필요합니다." },
    { id: "PACKAGE_JSON_CHECK", re: /if\s+not\s+exist\s+"package\.json"/i, msg: "package.json 존재 확인이 필요합니다." },
    { id: "NODE_CHECK", re: /where\s+node\s+>nul/i, msg: "Node.js 존재 확인이 필요합니다." },
    { id: "NPM_CHECK", re: /where\s+npm\s+>nul/i, msg: "npm 존재 확인이 필요합니다." },
    { id: "NODE_MAJOR", re: /NODE_MAJOR/, msg: "Node major 버전 확인이 필요합니다." },
    { id: "RUNNER", re: /call\s+node\s+"tools\\|call\s+npm\s+run\s+dev/i, msg: "dev 러너 실행이 필요합니다." },
    { id: "PAUSE_ON_ERROR", re: /pause/i, msg: "오류 시 pause 가 필요합니다." },
    { id: "PORTS", re: /3000[\s\S]{0,200}4000/, msg: "Web/API 주소 안내가 필요합니다." },
  ],
  "stop-windows.bat": [
    { id: "STOP_RUNNER", re: /call\s+node\s+"tools\\stop-dev\.mjs"/i, msg: "tools\\stop-dev.mjs 를 호출해야 합니다." },
  ],
};

function findBatFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const fp = path.join(dir, entry);
    if (statSync(fp).isDirectory()) findBatFiles(fp, out);
    else if (/\.(bat|cmd)$/i.test(entry)) out.push(fp);
  }
  return out;
}

const errors = [];
const files = findBatFiles(ROOT);

if (files.length === 0) errors.push({ file: "-", code: "NO_BAT_FILES", message: "검사할 .bat 파일이 없습니다." });

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const buf = readFileSync(file);
  const text = buf.toString("utf-8");
  const base = path.basename(file);

  // BOM would be echoed as garbage by CMD.
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    errors.push({ file: rel, code: "UTF8_BOM", message: "BOM 을 제거하세요. CMD 가 첫 줄을 오해석합니다." });
  }

  // Line endings must be CRLF throughout.
  const lfOnly = text.split("\n").length - 1 - (text.split("\r\n").length - 1);
  if (lfOnly > 0) {
    errors.push({ file: rel, code: "NOT_CRLF", message: `LF 전용 줄 ${lfOnly}개. CRLF 로 저장하세요.` });
  }

  const lines = text.split(/\r?\n/);
  for (const { id, re, msg } of FORBIDDEN) {
    lines.forEach((line, i) => {
      if (re.test(line)) errors.push({ file: rel, line: i + 1, code: `FORBIDDEN_${id}`, message: msg, snippet: line.trim() });
    });
  }
  for (const { id, re, msg } of REQUIRED) {
    if (!re.test(text)) errors.push({ file: rel, code: `MISSING_${id}`, message: msg });
  }
  for (const { id, re, msg } of PER_FILE[base] ?? []) {
    if (!re.test(text)) errors.push({ file: rel, code: `MISSING_${id}`, message: msg });
  }

  // `for /f ... in (cmd)` must quote the command; only file-set / literal
  // parenthesised strings may go unquoted.
  lines.forEach((line, i) => {
    const m = line.match(/for\s+\/f\s+[^(]*\(\s*([^)]*)\)/i);
    if (!m) return;
    const inner = m[1].trim();
    if (inner.startsWith("'") || inner.startsWith('"') || inner.startsWith("%")) return;
    errors.push({
      file: rel, line: i + 1, code: "FOR_F_UNQUOTED_COMMAND",
      message: "외부 명령은 작은따옴표로 감싸세요: for /f ... in ('node -v') do ...",
      snippet: line.trim(),
    });
  });

  // npm invoked without `call` inside a .bat returns to the shell, not the script.
  lines.forEach((line, i) => {
    if (/^\s*(npm|npx)\s+/i.test(line)) {
      errors.push({ file: rel, line: i + 1, code: "NPM_WITHOUT_CALL", message: "npm/npx 는 call 로 실행하세요.", snippet: line.trim() });
    }
  });
}

console.log("WINDOWS_STATIC_VALIDATION");
console.log("=".repeat(46));
console.log(`대상 파일 : ${files.length}개`);
for (const f of files) console.log(`  - ${path.relative(ROOT, f)}`);
console.log("");

if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) {
    console.error(`  [${e.code}] ${e.file}${e.line ? `:${e.line}` : ""}`);
    console.error(`      ${e.message}`);
    if (e.snippet) console.error(`      > ${e.snippet}`);
  }
  process.exit(1);
}

console.log("정적 검사 통과 (CMD 문법 · CRLF · 필수 구문).");
console.log("주의: 이것은 정적 검사입니다. 실제 Windows 실행을 보장하지 않습니다.");
