#!/usr/bin/env node
/**
 * Verifies the Playwright suite only references files that exist, and that the
 * only COMPLETED submission it loads is the sandbox one.
 *
 *   node tools/verify-e2e-references.mjs [projectRoot]
 *
 * The three evaluated environments ship no finished execution plan on purpose.
 * An E2E test that loads or builds one would leak the answer participants are
 * supposed to produce.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E2E_DIR = path.join(ROOT, "tests", "e2e");
const CONFIG = path.join(ROOT, "playwright.config.ts");

const EVALUATED = ["chicken-store", "hospital", "public-office"];
/** Only this completed submission may be loaded by E2E. */
const ALLOWED_SUBMISSION = "examples/submission-format-example/sandbox.json";
/** Path fragments that must never be referenced. */
const FORBIDDEN_FRAGMENTS = [
  "private-tests", "hidden-profiles", "hidden-scenarios", "expected-results",
  "kiobridge-private-evaluation",
];

const errors = [];

if (!existsSync(CONFIG)) errors.push({ code: "MISSING_PLAYWRIGHT_CONFIG", file: "playwright.config.ts", message: "playwright.config.ts 가 없습니다." });
if (!existsSync(E2E_DIR)) errors.push({ code: "MISSING_E2E_DIR", file: "tests/e2e", message: "tests/e2e 디렉터리가 없습니다." });
if (!existsSync(path.join(ROOT, ALLOWED_SUBMISSION))) {
  errors.push({ code: "MISSING_SANDBOX_EXAMPLE", file: ALLOWED_SUBMISSION, message: "Sandbox 완성 예제가 없습니다." });
}

function collect(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const fp = path.join(dir, entry);
    if (statSync(fp).isDirectory()) collect(fp, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(fp);
  }
  return out;
}

const specFiles = collect(E2E_DIR);
if (specFiles.length === 0 && existsSync(E2E_DIR)) {
  errors.push({ code: "NO_E2E_SPECS", file: "tests/e2e", message: "E2E 스펙 파일이 없습니다." });
}

const scanned = [...specFiles];
if (existsSync(CONFIG)) scanned.push(CONFIG);

/** String literals that look like local paths (contain a slash and a dot/dir). */
const LITERAL = /["'`]([^"'`\n]*\/[^"'`\n]*)["'`]/g;
let refsChecked = 0;

for (const file of scanned) {
  const rel = path.relative(ROOT, file);
  const lines = readFileSync(file, "utf-8").split("\n");

  lines.forEach((line, idx) => {
    // Ignore comment lines: prose may legitimately name the evaluated envs.
    const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
    if (!code.trim()) return;

    LITERAL.lastIndex = 0;
    let m;
    while ((m = LITERAL.exec(code)) !== null) {
      const literal = m[1];
      if (/^(https?:|\/\/)/.test(literal)) continue;
      if (literal.startsWith("@")) continue; // package specifier

      for (const frag of FORBIDDEN_FRAGMENTS) {
        if (literal.includes(frag)) {
          errors.push({ code: "FORBIDDEN_REFERENCE", file: rel, line: idx + 1, ref: literal, message: `비공개 평가 자산(${frag})을 참조합니다.` });
        }
      }

      // Any completed submission other than sandbox is a leak.
      if (literal.includes("submission-format-example")) {
        const normalized = literal.replace(/^\.*\//, "").replace(/^(\.\.\/)+/, "");
        if (!normalized.endsWith("sandbox.json")) {
          errors.push({
            code: "OFFICIAL_ENV_SUBMISSION_REFERENCE", file: rel, line: idx + 1, ref: literal,
            message: `완성 제출 예제는 ${ALLOWED_SUBMISSION} 만 허용됩니다.`,
          });
        }
      }
      for (const env of EVALUATED) {
        if (literal.includes(`${env}.json`)) {
          errors.push({
            code: "OFFICIAL_ENV_SUBMISSION_REFERENCE", file: rel, line: idx + 1, ref: literal,
            message: `공식 평가 환경(${env})의 완성 제출을 참조할 수 없습니다.`,
          });
        }
      }

      // Relative local paths must exist.
      // 보간이 든 템플릿 리터럴(`./${X}`)은 정적으로 풀 수 없습니다.
      // 존재하지 않는 경로로 단정하면 오탐이 되므로 건너뜁니다.
      if (literal.includes("${")) continue;
      if (literal.startsWith("./") || literal.startsWith("../")) {
        refsChecked += 1;
        const resolved = path.resolve(path.dirname(file), literal);
        if (!existsSync(resolved)) {
          errors.push({
            code: "E2E_REFERENCE_NOT_FOUND", file: rel, line: idx + 1, ref: literal,
            resolvedPath: path.relative(ROOT, resolved), message: "참조 파일이 존재하지 않습니다.",
          });
        }
      }
    }

    // path.join(REPO_ROOT, "a", "b") style references.
    const joined = code.match(/path\.join\(\s*REPO_ROOT\s*,\s*([^)]+)\)/);
    if (joined) {
      const parts = [...joined[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
      if (parts.length) {
        refsChecked += 1;
        const resolved = path.join(ROOT, ...parts);
        if (!existsSync(resolved)) {
          errors.push({
            code: "E2E_REFERENCE_NOT_FOUND", file: rel, line: idx + 1, ref: parts.join("/"),
            resolvedPath: path.relative(ROOT, resolved), message: "참조 파일이 존재하지 않습니다.",
          });
        }
      }
    }
  });
}

console.log("E2E REFERENCE VERIFICATION");
console.log("=".repeat(46));
console.log(`스펙 파일   : ${specFiles.length}개`);
console.log(`검사한 참조 : ${refsChecked}개`);
console.log(`허용 제출   : ${ALLOWED_SUBMISSION}`);
console.log("");

if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) {
    console.error(`  [${e.code}] ${e.file}${e.line ? `:${e.line}` : ""}`);
    if (e.ref) console.error(`      참조: ${e.ref}`);
    if (e.resolvedPath) console.error(`      해석: ${e.resolvedPath}`);
    console.error(`      ${e.message}`);
  }
  process.exit(1);
}

console.log("E2E 는 Sandbox 완성 예제만 참조하며, 모든 참조 파일이 존재합니다.");
