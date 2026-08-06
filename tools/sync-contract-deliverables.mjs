#!/usr/bin/env node
/**
 * Regenerates participant-deliverables/04_PROFILE_AND_INPUT_CONTRACT from the
 * single source of truth (schemas/, docs/, packages/profile-contract,
 * examples/canonical-input).
 *
 * The deliverable is GENERATED OUTPUT — never edit it by hand.
 * `npm run check:contract-drift` fails if it is stale.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DELIVERABLE_DIR, DELIVERABLE_SECTIONS, DIR_MAPPINGS, DOC_FILES, GENERATED_BANNER,
  GENERATOR_VERSION, PARTICIPANT_ROOT, README_BODY, ROOT, START_HERE_ASSETS,
  START_HERE_DIR, START_HERE_DOCS, contractVersion, rewriteRelativeLinks, sourceFingerprint,
} from "./contract-deliverables.mjs";

/**
 * Every docs/ file that ends up somewhere under participant-deliverables/,
 * as absolute source -> absolute destination. Built BEFORE anything is written
 * so links can prefer a sibling copy over a path back into the repo.
 */
const COPIES = new Map();
const docSrc = (name) => path.join(ROOT, "docs", name);
for (const d of DOC_FILES) COPIES.set(docSrc(d), path.join(DELIVERABLE_DIR, d));
for (const d of START_HERE_DOCS) COPIES.set(docSrc(d), path.join(START_HERE_DIR, d));
for (const a of START_HERE_ASSETS) COPIES.set(docSrc(a), path.join(START_HERE_DIR, a));
COPIES.set(path.join(ROOT, "README_FIRST.md"), path.join(START_HERE_DIR, "README_FIRST.md"));
for (const [dir, , docs] of DELIVERABLE_SECTIONS) {
  for (const d of docs) {
    const dest = path.join(PARTICIPANT_ROOT, dir, d);
    // First writer wins: 00_START_HERE is the canonical home for shared docs.
    if (!COPIES.has(docSrc(d))) COPIES.set(docSrc(d), dest);
  }
}

/** Copy a markdown doc, adding the banner and re-pointing its relative links. */
function writeDoc(srcAbs, destAbs) {
  const raw = readFileSync(srcAbs, "utf-8");
  const linked = rewriteRelativeLinks(srcAbs, destAbs, raw, COPIES);
  writeFileSync(destAbs, GENERATED_BANNER(version, generatedAt) + linked);
}

/**
 * Keep the previous timestamp when the sources are unchanged, so re-running the
 * sync does not by itself create drift.
 */
function stableTimestamp(fingerprint) {
  const metaPath = path.join(DELIVERABLE_DIR, ".generated.json");
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      if (meta.sourceFingerprint === fingerprint) return meta.generatedAt;
    } catch { /* fall through and regenerate */ }
  }
  return new Date().toISOString();
}

const version = contractVersion();
const fingerprint = sourceFingerprint();
const generatedAt = stableTimestamp(fingerprint);

// 1. clean slate — the deliverable is fully derived from source
rmSync(DELIVERABLE_DIR, { recursive: true, force: true });
mkdirSync(DELIVERABLE_DIR, { recursive: true });

// 2. generated README with provenance
writeFileSync(path.join(DELIVERABLE_DIR, "README.md"), README_BODY(version, generatedAt));

// 3. docs, each prefixed with a "do not edit" banner
for (const doc of DOC_FILES) writeDoc(docSrc(doc), path.join(DELIVERABLE_DIR, doc));

// 4. schemas / vocabularies / examples / sdk
for (const { from, to } of DIR_MAPPINGS) {
  const dest = path.join(DELIVERABLE_DIR, to);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(from, dest, { recursive: true });
}

// 5. machine-readable provenance (read by the drift check)
writeFileSync(
  path.join(DELIVERABLE_DIR, ".generated.json"),
  JSON.stringify({ generatedAt, contractVersion: version, generatorVersion: GENERATOR_VERSION, sourceFingerprint: fingerprint }, null, 2) + "\n",
);

// 6. numbered navigation folders + 00_START_HERE
for (const [dir] of DELIVERABLE_SECTIONS) {
  if (dir === "04_PROFILE_AND_INPUT_CONTRACT") continue; // generated above
  rmSync(path.join(PARTICIPANT_ROOT, dir), { recursive: true, force: true });
}

const productVersion = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8")).version;

for (const [dir, title, docs] of DELIVERABLE_SECTIONS) {
  if (dir === "04_PROFILE_AND_INPUT_CONTRACT") continue;
  const target = path.join(PARTICIPANT_ROOT, dir);
  mkdirSync(target, { recursive: true });
  for (const doc of docs) writeDoc(docSrc(doc), path.join(target, doc));
  if (dir !== "00_START_HERE") {
    writeFileSync(path.join(target, "README.md"),
      GENERATED_BANNER(version, generatedAt) +
      `# ${dir.slice(3).replace(/_/g, " ")} — ${title}\n\n` +
      (docs.length
        ? docs.map((d) => `- [${d}](${d})`).join("\n") + "\n"
        : "이 폴더는 상위 저장소의 해당 자료를 가리킵니다.\n"));
  }
}

// 00_START_HERE gets README_FIRST + onboarding docs + the architecture diagram.
writeDoc(path.join(ROOT, "README_FIRST.md"), path.join(START_HERE_DIR, "README_FIRST.md"));
for (const doc of START_HERE_DOCS) writeDoc(docSrc(doc), path.join(START_HERE_DIR, doc));
for (const asset of START_HERE_ASSETS) {
  cpSync(path.join(ROOT, "docs", asset), path.join(START_HERE_DIR, asset));
}
writeFileSync(path.join(START_HERE_DIR, "README.md"),
  GENERATED_BANNER(version, generatedAt) + [
    "# 00. 여기서 시작하세요",
    "",
    `> 제품 버전 \`${productVersion}\` · 입력계약 버전 \`${version}\``,
    "",
    "## 읽는 순서",
    "",
    "| 순서 | 문서 | 왜 |",
    "| --- | --- | --- |",
    "| 1 | [README_FIRST.md](README_FIRST.md) | 실행 방법 |",
    "| 2 | [QUICK_START_10_MINUTES.md](QUICK_START_10_MINUTES.md) | 10분 안에 왕복 한 번 |",
    "| 3 | [WHAT_WE_PROVIDE.md](WHAT_WE_PROVIDE.md) | KioBridge 가 주는 것 |",
    "| 4 | [WHAT_YOU_BUILD.md](WHAT_YOU_BUILD.md) | 참가팀이 만들 것 |",
    "| 5 | [FULL_DEMO_FLOW.md](FULL_DEMO_FLOW.md) | 전체 흐름 상세 |",
    "| 6 | [PASS_SCOPE.md](PASS_SCOPE.md) | PASS 가 뜻하는 범위 |",
    "| 7 | [PRIVATE_EVALUATION_BOUNDARY.md](PRIVATE_EVALUATION_BOUNDARY.md) | 공개/비공개 경계 |",
    "",
    "![구조 개요](ARCHITECTURE_OVERVIEW.svg)",
    "",
    "## 폴더 안내",
    "",
    "| 폴더 | 내용 |",
    "| --- | --- |",
    ...DELIVERABLE_SECTIONS.map(([d, t]) => `| \`${d}\` | ${t} |`),
    "",
    "## 기억할 한 가지",
    "",
    "> 참가팀은 좌표나 실제 키오스크 컨트롤을 다루지 않습니다.",
    "> 의미 기반 Action 만 제출하며, 실행은 KioBridge Driver 가 담당합니다.",
    "",
  ].join("\n"));

console.log("참가팀 계약자료 동기화 완료");
console.log(`  경로        : ${path.relative(ROOT, DELIVERABLE_DIR)}`);
console.log(`  계약 버전   : ${version}`);
console.log(`  생성 시각   : ${generatedAt}`);
console.log(`  생성기 버전 : ${GENERATOR_VERSION}`);
console.log(`  섹션 폴더   : ${DELIVERABLE_SECTIONS.length}개`);
