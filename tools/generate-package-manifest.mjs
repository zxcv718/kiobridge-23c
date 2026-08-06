#!/usr/bin/env node
/**
 * Hashes the platform files a team should not edit.
 *
 * `participant:doctor` compares against this and WARNS on any difference.
 * It never deletes or reverts anything — the team's own work always survives.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Platform code and data. Participant folders are deliberately absent. */
const TRACKED = ["apps", "packages", "environments", "schemas", "tools", "tests"];
/**
 * Root documents a team must receive intact. WINDOWS_FINAL_CHECKLIST.md is here
 * because v5.1.1 lost it in packaging and nothing noticed — now doctor does.
 */
const TRACKED_FILES = [
  "WINDOWS_FINAL_CHECKLIST.md",
  "00_START_HERE.html", "00_START_HERE.md", "README_FIRST.md",
  "PARTICIPANT_CHECKLIST.md", "FINAL_SUBMISSION_CHECKLIST.md",
  "start-windows.bat", "stop-windows.bat",
];
/**
 * Files whose absence or drift must block, listed with size so tampering is
 * visible. tools/verify-public-package.mjs is here because v5.1.3 shipped a
 * stale copy of it and nothing failed.
 */
const CRITICAL = [
  "WINDOWS_FINAL_CHECKLIST.md",
  "tools/verify-public-package.mjs",
  "tools/verify-package-source-parity.mjs",
  "tools/participant-cli.mjs",
];
const SKIP = new Set(["node_modules", "dist", "build", "coverage", ".git"]);
/**
 * 배포본에 들어가지 않는 경로. 매니페스트는 "참가팀이 받은 파일" 을 기술해야
 * 하므로, 소스에만 두는 회귀 fixture 를 넣으면 배포본에서 항상 불일치가 납니다.
 */
const SKIP_PREFIXES = ["tests/fixtures/"];
const SKIP_EXACT = new Set([
  "tests/contract/package-source-parity.test.ts",
  "tests/contract/windows-checklist-packaging.test.ts",
]);

const files = {};
for (const dir of TRACKED) {
  const full = path.join(ROOT, dir);
  if (!existsSync(full)) continue;
  (function walk(d) {
    for (const entry of readdirSync(d).sort()) {
      if (SKIP.has(entry)) continue;
      const fp = path.join(d, entry);
      if (statSync(fp).isDirectory()) { walk(fp); continue; }
      const rel = path.relative(ROOT, fp).split(path.sep).join("/");
      if (SKIP_PREFIXES.some((prefix) => rel.startsWith(prefix)) || SKIP_EXACT.has(rel)) continue;
      files[rel] = createHash("sha256").update(readFileSync(fp)).digest("hex");
    }
  })(full);
}

for (const rel of TRACKED_FILES) {
  const fp = path.join(ROOT, rel);
  if (!existsSync(fp)) {
    console.error(`OFFICIAL_PACKAGE_MANIFEST_SOURCE_MISSING: ${rel}`);
    process.exit(1);
  }
  files[rel] = createHash("sha256").update(readFileSync(fp)).digest("hex");
}

/** Explicit path/sha256/size records for the files doctor must hard-fail on. */
const criticalFiles = CRITICAL.map((rel) => ({
  path: rel,
  sha256: files[rel],
  size: statSync(path.join(ROOT, rel)).size,
  required: true,
}));

const manifest = {
  productVersion: JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8")).version,
  inputContractVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  note: "참가팀이 수정하지 않는 플랫폼 파일의 해시입니다. participant:doctor 가 경고에만 사용합니다.",
  fileCount: Object.keys(files).length,
  criticalFiles,
  files,
};
writeFileSync(path.join(ROOT, "official-package-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`official-package-manifest.json 생성 — ${manifest.fileCount}개 파일`);
