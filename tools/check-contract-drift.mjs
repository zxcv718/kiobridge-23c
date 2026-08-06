#!/usr/bin/env node
/**
 * Fails when participant-deliverables/04_PROFILE_AND_INPUT_CONTRACT is out of
 * sync with the source of truth. Run by tests, CI and the packaging pipeline —
 * a public ZIP cannot be produced while drift exists.
 *
 *   fix: npm run sync:contracts
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  DELIVERABLE_DIR, DELIVERABLE_SECTIONS, DIR_MAPPINGS, DOC_FILES, PARTICIPANT_ROOT, ROOT,
  START_HERE_DIR, START_HERE_DOCS, contractVersion, rewriteRelativeLinks, sourceFingerprint,
} from "./contract-deliverables.mjs";

/**
 * Same copy map the sync tool builds. Copied docs are compared against the
 * LINK-REWRITTEN source, because a copy at a different depth must re-point its
 * relative links to stay valid — an identical byte copy would be broken.
 */
const docSrc = (name) => path.join(ROOT, "docs", name);
const COPIES = new Map();
for (const d of DOC_FILES) COPIES.set(docSrc(d), path.join(DELIVERABLE_DIR, d));
for (const d of START_HERE_DOCS) COPIES.set(docSrc(d), path.join(START_HERE_DIR, d));
COPIES.set(path.join(ROOT, "README_FIRST.md"), path.join(START_HERE_DIR, "README_FIRST.md"));
for (const [dir, , docs] of DELIVERABLE_SECTIONS) {
  for (const d of docs) {
    if (!COPIES.has(docSrc(d))) COPIES.set(docSrc(d), path.join(PARTICIPANT_ROOT, dir, d));
  }
}

const problems = [];
const rel = (p) => path.relative(ROOT, p);

if (!existsSync(DELIVERABLE_DIR)) {
  problems.push("배포용 계약자료 폴더가 없습니다. `npm run sync:contracts` 를 실행하세요.");
} else {
  // 1. provenance + fingerprint
  const metaPath = path.join(DELIVERABLE_DIR, ".generated.json");
  if (!existsSync(metaPath)) {
    problems.push(".generated.json 이 없습니다 (자동 생성물이 아님).");
  } else {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    const current = sourceFingerprint();
    if (meta.sourceFingerprint !== current) {
      problems.push(`원본이 변경되었는데 배포자료가 갱신되지 않았습니다.\n    기록: ${meta.sourceFingerprint?.slice(0, 16)}…\n    현재: ${current.slice(0, 16)}…`);
    }
    if (meta.contractVersion !== contractVersion()) {
      problems.push(`계약 버전 불일치: 배포자료 ${meta.contractVersion} vs 원본 ${contractVersion()}`);
    }
  }

  // 2. every doc present and byte-identical after the banner
  for (const doc of DOC_FILES) {
    const target = path.join(DELIVERABLE_DIR, doc);
    if (!existsSync(target)) { problems.push(`누락된 문서: ${doc}`); continue; }
    const srcPath = docSrc(doc);
    const expected = rewriteRelativeLinks(srcPath, target, readFileSync(srcPath, "utf-8"), COPIES);
    const out = readFileSync(target, "utf-8");
    const body = out.slice(out.indexOf("-->") + 4).replace(/^\n+/, "");
    if (body.trim() !== expected.trim()) problems.push(`문서 내용이 원본과 다릅니다: ${doc}`);
  }

  // 3. every mirrored tree byte-identical
  for (const { from, to } of DIR_MAPPINGS) {
    compareTree(from, path.join(DELIVERABLE_DIR, to));
  }
}

function compareTree(srcDir, outDir) {
  if (!existsSync(srcDir)) return;
  if (!existsSync(outDir)) { problems.push(`누락된 디렉터리: ${rel(outDir)}`); return; }
  for (const entry of readdirSync(srcDir)) {
    const s = path.join(srcDir, entry);
    const o = path.join(outDir, entry);
    if (statSync(s).isDirectory()) { compareTree(s, o); continue; }
    if (!existsSync(o)) { problems.push(`누락된 파일: ${rel(o)}`); continue; }
    if (!readFileSync(s).equals(readFileSync(o))) problems.push(`내용 불일치: ${rel(o)}`);
  }
}

if (problems.length > 0) {
  console.error("CONTRACT DRIFT DETECTED\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("\n  해결: npm run sync:contracts\n");
  process.exit(1);
}

console.log("계약자료 동기화 상태 정상 (drift 없음).");
console.log(`  계약 버전: ${contractVersion()}`);
