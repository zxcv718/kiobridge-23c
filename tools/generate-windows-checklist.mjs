#!/usr/bin/env node
/**
 * Writes WINDOWS_FINAL_CHECKLIST.md to the repo root from its single template.
 *
 *   node tools/generate-windows-checklist.mjs [--check]
 *
 * --check writes nothing and exits non-zero when the file on disk differs from
 * what the template would produce. That is what stops a hand-edited copy from
 * silently shipping.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  REPO_ROOT, CHECKLIST_BASENAME, TEMPLATE_REL,
  generateWindowsFinalChecklist, productVersion, sha256,
} from "./lib/windows-checklist.mjs";

const checkOnly = process.argv.includes("--check");
const target = path.join(REPO_ROOT, CHECKLIST_BASENAME);
/** Organiser review copy. Same bytes, never edited by hand. */
const releaseCopy = path.join(REPO_ROOT, "release", CHECKLIST_BASENAME);
const content = generateWindowsFinalChecklist({ productVersion: productVersion() });

if (checkOnly) {
  if (!existsSync(target)) {
    console.error(`WINDOWS_CHECKLIST_MISSING: ${CHECKLIST_BASENAME} 이 없습니다.`);
    console.error(`해결: node tools/generate-windows-checklist.mjs`);
    process.exit(1);
  }
  const onDisk = readFileSync(target, "utf-8");
  if (onDisk !== content) {
    console.error(`WINDOWS_CHECKLIST_DRIFT: ${CHECKLIST_BASENAME} 이 템플릿 결과와 다릅니다.`);
    console.error(`  원본   : ${TEMPLATE_REL}`);
    console.error(`  기대 SHA: ${sha256(content)}`);
    console.error(`  실제 SHA: ${sha256(onDisk)}`);
    console.error(`해결: 템플릿을 고친 뒤 node tools/generate-windows-checklist.mjs`);
    process.exit(1);
  }
  if (existsSync(releaseCopy) && readFileSync(releaseCopy, "utf-8") !== content) {
    console.error(`CHECKLIST_SHA_MISMATCH: release/${CHECKLIST_BASENAME} 이 템플릿 결과와 다릅니다.`);
    console.error(`해결: node tools/generate-windows-checklist.mjs`);
    process.exit(1);
  }
  console.log(`${CHECKLIST_BASENAME} 이 템플릿과 일치합니다 (${sha256(content).slice(0, 16)}…).`);
} else {
  writeFileSync(target, content);
  mkdirSync(path.dirname(releaseCopy), { recursive: true });
  writeFileSync(releaseCopy, content);
  console.log(`${CHECKLIST_BASENAME} 생성 — ${Buffer.byteLength(content)} bytes · SHA ${sha256(content).slice(0, 16)}…`);
  console.log(`  루트    : ${path.relative(REPO_ROOT, target)}`);
  console.log(`  운영진용: ${path.relative(REPO_ROOT, releaseCopy)} (같은 바이트)`);
}
