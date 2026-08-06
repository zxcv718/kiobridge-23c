#!/usr/bin/env node
/**
 * Removes build/install artefacts from THIS project only.
 *
 * Safety: every candidate path is resolved and checked to be strictly inside the
 * project root before deletion. Nothing outside the root can ever be removed.
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directories whose immediate children may each contain node_modules/dist. */
const WORKSPACE_PARENTS = ["apps", "packages", "examples"];

/** Named artefacts at the project root. */
const ROOT_TARGETS = [
  "node_modules", "dist", "build", "coverage",
  "playwright-report", "test-results", ".tmp", ".cache",
];

/** Files to sweep recursively (macOS/editor junk). */
const JUNK_FILES = new Set([".DS_Store"]);
const JUNK_DIRS = new Set(["__MACOSX"]);

const removed = [];

/** Delete `target` only if it is strictly inside ROOT. */
function safeRemove(target) {
  const resolved = path.resolve(target);
  const relative = path.relative(ROOT, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    console.error(`[거부] 프로젝트 루트 밖의 경로는 삭제하지 않습니다: ${resolved}`);
    return;
  }
  if (!existsSync(resolved)) return;
  rmSync(resolved, { recursive: true, force: true });
  removed.push(relative);
}

// 1. root-level artefacts
for (const name of ROOT_TARGETS) safeRemove(path.join(ROOT, name));

// 2. per-workspace node_modules / dist / build
for (const parent of WORKSPACE_PARENTS) {
  const dir = path.join(ROOT, parent);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir)) {
    const base = path.join(dir, entry);
    if (!statSync(base).isDirectory()) continue;
    for (const name of ["node_modules", "dist", "build", "coverage"]) safeRemove(path.join(base, name));
  }
}

// 3. release staging (keep produced ZIPs unless --all)
const releaseDir = path.join(ROOT, "release");
if (existsSync(releaseDir)) {
  if (process.argv.includes("--all")) safeRemove(releaseDir);
  else for (const entry of readdirSync(releaseDir)) {
    if (!entry.endsWith(".zip") && !entry.endsWith(".sha256")) safeRemove(path.join(releaseDir, entry));
  }
}

// 4. recursive junk sweep (skips node_modules for speed; those are gone anyway)
function sweep(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      if (JUNK_DIRS.has(e.name)) { safeRemove(p); continue; }
      sweep(p);
    } else if (JUNK_FILES.has(e.name)) {
      safeRemove(p);
    }
  }
}
sweep(ROOT);

if (removed.length === 0) console.log("정리할 항목이 없습니다 (이미 깨끗합니다).");
else {
  console.log(`정리 완료 — ${removed.length}개 항목 삭제:`);
  for (const r of removed.slice(0, 40)) console.log(`  - ${r}`);
  if (removed.length > 40) console.log(`  … 외 ${removed.length - 40}개`);
}
