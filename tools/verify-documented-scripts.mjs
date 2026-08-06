#!/usr/bin/env node
/**
 * Verifies every `npm run <script>` written in the docs actually exists in
 * package.json, and that documented ports match the official ones.
 *
 *   node tools/verify-documented-scripts.mjs [projectRoot]
 *
 * Docs that promise a command which does not exist are worse than no docs:
 * the reader follows them and hits an error on their first minute.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const SKIP = new Set([
  "node_modules", "dist", "build", "coverage", "release", ".git", ".turbo",
  "playwright-report", "test-results", "__MACOSX",
]);

const OFFICIAL_WEB_PORT = "3000";
const OFFICIAL_API_PORT = "4000";
/** Ports that must never appear in participant-facing docs. */
const WRONG_PORTS = ["5173", "8080", "5000"];

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const scripts = new Set(Object.keys(pkg.scripts ?? {}));

function collectMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const fp = path.join(dir, entry);
    if (statSync(fp).isDirectory()) collectMarkdown(fp, out);
    else if (entry.toLowerCase().endsWith(".md")) out.push(fp);
  }
  return out;
}

/** Levenshtein-lite: score by shared prefix + length gap, good enough to hint. */
function suggest(name) {
  const ranked = [...scripts]
    .map((s) => {
      let shared = 0;
      while (shared < s.length && shared < name.length && s[shared] === name[shared]) shared += 1;
      const normalized = (x) => x.replace(/[:_-]/g, "");
      const exactIgnoringSeparators = normalized(s) === normalized(name) ? 100 : 0;
      const contains = s.includes(name) || name.includes(s) ? 5 : 0;
      return { s, score: exactIgnoringSeparators + contains + shared };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, 3).map((r) => r.s);
}

const errors = [];
const files = collectMarkdown(ROOT);
let commandsChecked = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const isParticipantFacing = !rel.startsWith("docs/internal");

  readFileSync(file, "utf-8").split("\n").forEach((line, idx) => {
    // `npm run <name>` — the name must be a real script.
    for (const m of line.matchAll(/\bnpm\s+run\s+([a-zA-Z0-9:_.-]+)/g)) {
      commandsChecked += 1;
      const name = m[1];
      if (!scripts.has(name)) {
        errors.push({
          code: "DOCUMENTED_SCRIPT_NOT_FOUND", file: rel, line: idx + 1,
          documented: `npm run ${name}`,
          message: "package.json 에 이 스크립트가 없습니다.",
          suggestions: suggest(name),
        });
      }
    }

    // `npm test:public` style typos — npm needs `run` for non-builtin scripts.
    for (const m of line.matchAll(/\bnpm\s+(?!run\b|ci\b|install\b|i\b|exec\b|init\b|ls\b|publish\b|version\b|audit\b|link\b|pack\b|config\b|cache\b|why\b|outdated\b|update\b|-)([a-zA-Z0-9:_.-]+)/g)) {
      const name = m[1];
      if (["test", "start", "build", "stop", "restart"].includes(name)) continue; // npm builtins
      if (!/[a-zA-Z]/.test(name)) continue; // "Node.js 20 / npm 10 이상" 같은 산문
      commandsChecked += 1;
      errors.push({
        code: "NPM_RUN_MISSING", file: rel, line: idx + 1,
        documented: `npm ${name}`,
        message: `\`npm run ${name}\` 처럼 run 을 붙이세요.`,
        suggestions: scripts.has(name) ? [`npm run ${name}`] : suggest(name),
      });
    }

    // Participant-facing docs must use the official ports.
    if (isParticipantFacing) {
      for (const port of WRONG_PORTS) {
        if (new RegExp(`localhost:${port}|127\\.0\\.0\\.1:${port}`).test(line)) {
          errors.push({
            code: "WRONG_DOCUMENTED_PORT", file: rel, line: idx + 1,
            documented: `port ${port}`,
            message: `공식 포트는 Web ${OFFICIAL_WEB_PORT} · API ${OFFICIAL_API_PORT} 입니다.`,
            suggestions: [`localhost:${OFFICIAL_WEB_PORT}`, `localhost:${OFFICIAL_API_PORT}`],
          });
        }
      }
    }
  });
}

console.log("DOCUMENTED SCRIPT VERIFICATION");
console.log("=".repeat(46));
console.log(`검사한 문서   : ${files.length}개`);
console.log(`검사한 명령   : ${commandsChecked}개`);
console.log(`등록 스크립트 : ${scripts.size}개`);
console.log("");

if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) {
    console.error(`  [${e.code}] ${e.file}:${e.line}`);
    console.error(`      문서: ${e.documented}`);
    console.error(`      ${e.message}`);
    if (e.suggestions?.length) console.error(`      제안: ${e.suggestions.join(" · ")}`);
  }
  process.exit(1);
}

console.log("문서의 npm 명령과 포트가 모두 유효합니다.");
