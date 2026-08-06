#!/usr/bin/env node
/**
 * Verifies every LOCAL Markdown link resolves to a real file or directory.
 *
 *   node tools/verify-doc-links.mjs [projectRoot]
 *
 * Skipped: external URLs, mailto:/tel:, pure #anchors, fenced code blocks,
 * inline code spans, and generated/ignored trees.
 *
 * When a link carries a #anchor, the file is checked first; if the target is
 * Markdown, the heading anchor is checked too.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", "coverage", "release", ".git", ".turbo",
  "playwright-report", "test-results", "__MACOSX", ".cache",
]);

function collectMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fp = path.join(dir, entry);
    if (statSync(fp).isDirectory()) collectMarkdown(fp, out);
    else if (entry.toLowerCase().endsWith(".md")) out.push(fp);
  }
  return out;
}

/** GitHub-style heading slug. */
function slug(heading) {
  return heading
    .trim().toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function headingAnchors(file) {
  const anchors = new Set();
  let fenced = false;
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) anchors.add(slug(m[2]));
    const explicit = line.match(/<a\s+(?:id|name)="([^"]+)"/i);
    if (explicit) anchors.add(explicit[1].toLowerCase());
  }
  return anchors;
}

/** Strip inline code spans so `path/like/this` inside backticks is not a link. */
const stripInlineCode = (line) => line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));

/**
 * release/ 안의 문서는 packaging 이 만듭니다. 아직 패키징하지 않은 저장소에서도
 * 템플릿 검사가 통과해야 하므로, 파이프라인이 확실히 생성하는 파일만 예외로 둡니다.
 * 목록은 build-public-package.mjs 에서 실제로 생성하는지 대조합니다.
 */
/**
 * 템플릿 → 생성 결과가 놓이는 디렉터리.
 * WINDOWS_FINAL_CHECKLIST 는 참가팀 ZIP 루트(=저장소 루트)에 놓이므로
 * 형제 문서 링크가 루트 기준입니다. release/ 사본은 같은 바이트의 검토용입니다.
 */
const TEMPLATE_OUTPUT_DIR = new Map([
  ["WINDOWS_FINAL_CHECKLIST.template.md", ROOT],
  ["PARTICIPANT_DISTRIBUTION_GUIDE.template.md", path.join(ROOT, "release")],
]);

const PACKAGING_SRC = (() => {
  try { return readFileSync(path.join(ROOT, "tools", "build-public-package.mjs"), "utf-8"); }
  catch { return ""; }
})();
const GENERATED_IN_RELEASE = ["WINDOWS_FINAL_CHECKLIST.md", "PARTICIPANT_DISTRIBUTION_GUIDE.md",
  "SHARE_THIS_ZIP.txt"].filter((f) => PACKAGING_SRC.includes(f));

const LINK_RE = /(!?)\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const EXTERNAL_RE = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

const errors = [];
let checked = 0;
const files = collectMarkdown(ROOT);

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const lines = readFileSync(file, "utf-8").split("\n");
  let fenced = false;

  lines.forEach((raw, idx) => {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; return; }
    if (fenced) return;
    const line = stripInlineCode(raw);

    LINK_RE.lastIndex = 0;
    let m;
    while ((m = LINK_RE.exec(line)) !== null) {
      const target = m[3].trim();
      if (!target || target.startsWith("#") || EXTERNAL_RE.test(target)) continue;

      checked += 1;
      const [rawPath, anchor] = target.split("#");
      let decoded;
      try { decoded = decodeURIComponent(rawPath); } catch { decoded = rawPath; }
      if (!decoded) continue;

      // 생성 템플릿의 링크는 "생성된 결과가 놓이는 위치" 기준으로 풀어야 합니다.
      // 템플릿마다 출력 위치가 달라서 명시적으로 선언합니다.
      const baseDir = TEMPLATE_OUTPUT_DIR.get(path.basename(file))
        ?? (rel.startsWith(`tools${path.sep}templates${path.sep}`) ? path.join(ROOT, "release") : path.dirname(file));
      const resolved = path.resolve(baseDir, decoded);
      const isGenerated = path.dirname(resolved) === path.join(ROOT, "release")
        && GENERATED_IN_RELEASE.includes(path.basename(resolved));
      if (!existsSync(resolved) && isGenerated) continue;
      if (!existsSync(resolved)) {
        errors.push({
          code: "BROKEN_LOCAL_LINK", file: rel, line: idx + 1, link: target,
          resolvedPath: path.relative(ROOT, resolved),
          message: "대상 파일이 존재하지 않습니다.",
        });
        continue;
      }
      // Escaping the project is a portability bug even if it exists locally.
      if (path.relative(ROOT, resolved).startsWith("..")) {
        errors.push({
          code: "LINK_ESCAPES_PROJECT", file: rel, line: idx + 1, link: target,
          resolvedPath: resolved, message: "프로젝트 밖을 가리킵니다.",
        });
        continue;
      }
      if (anchor && resolved.toLowerCase().endsWith(".md")) {
        let decodedAnchor;
        try { decodedAnchor = decodeURIComponent(anchor); } catch { decodedAnchor = anchor; }
        const wanted = decodedAnchor.toLowerCase();
        const anchors = headingAnchors(resolved);
        if (!anchors.has(wanted) && !anchors.has(slug(decodedAnchor))) {
          errors.push({
            code: "BROKEN_LINK_ANCHOR", file: rel, line: idx + 1, link: target,
            resolvedPath: path.relative(ROOT, resolved),
            message: `대상 문서에 #${decodedAnchor} 제목이 없습니다.`,
          });
        }
      }
    }
  });
}

console.log("DOC LINK VERIFICATION");
console.log("=".repeat(46));
console.log(`검사한 문서 : ${files.length}개`);
console.log(`검사한 링크 : ${checked}개`);
console.log("");

if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) {
    console.error(e.code);
    console.error("");
    console.error(`file:\n${e.file}`);
    console.error("");
    console.error(`line:\n${e.line}`);
    console.error("");
    console.error(`link:\n${e.link}`);
    console.error("");
    console.error(`resolvedPath:\n${e.resolvedPath}`);
    console.error("");
    console.error(`message:\n${e.message}`);
    console.error("-".repeat(46));
  }
  process.exit(1);
}

console.log("깨진 로컬 링크 0건.");
