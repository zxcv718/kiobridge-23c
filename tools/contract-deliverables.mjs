/**
 * Single definition of what the participant contract deliverable contains, so
 * `sync-contract-deliverables.mjs` (writes) and `check-contract-drift.mjs`
 * (verifies) can never disagree.
 *
 * SINGLE SOURCE OF TRUTH:
 *   packages/profile-contract  — enums & validation
 *   schemas/                   — core + domain schemas, vocabularies, registry
 *   docs/                      — dictionaries & guides
 *   examples/canonical-input   — per-channel examples
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GENERATOR_VERSION = "1.0.0";

export const DELIVERABLE_DIR = path.join(ROOT, "participant-deliverables", "04_PROFILE_AND_INPUT_CONTRACT");
export const PARTICIPANT_ROOT = path.join(ROOT, "participant-deliverables");
export const START_HERE_DIR = path.join(PARTICIPANT_ROOT, "00_START_HERE");

/** docs/ files mirrored verbatim into 00_START_HERE. */
export const START_HERE_DOCS = [
  "WHAT_WE_PROVIDE.md",
  "WHAT_YOU_BUILD.md",
  "QUICK_START_10_MINUTES.md",
  "FULL_DEMO_FLOW.md",
  "PASS_SCOPE.md",
  "PRIVATE_EVALUATION_BOUNDARY.md",
];
/** Non-markdown assets copied as-is (no banner). */
export const START_HERE_ASSETS = ["ARCHITECTURE_OVERVIEW.svg"];

/** Numbered folders participants navigate, with the docs each collects. */
export const DELIVERABLE_SECTIONS = [
  ["00_START_HERE", "여기서 시작", []],
  ["01_ENVIRONMENT_AND_FIXTURE", "환경과 Fixture", ["ENVIRONMENT_PACK_GUIDE.md", "DATA_CLASSIFICATION.md"]],
  ["02_API_CONTRACT", "공식 API", ["API_CONTRACT.md", "SCHEMA_NEGOTIATION_GUIDE.md"]],
  ["03_SEMANTIC_ACTION", "의미 기반 Action", ["ARCHITECTURE.md", "PENDING_REAL_DEVICE.md"]],
  ["04_PROFILE_AND_INPUT_CONTRACT", "Canonical Input Contract", []],
  ["05_SAFETY_AND_BOUNDARY", "안전경계", ["SAFETY_POLICY.md", "EVALUATION_BOUNDARY.md"]],
  ["06_EVIDENCE_AND_EVALUATION", "Evidence 와 평가", ["PASS_SCOPE.md", "PRIVATE_EVALUATION_BOUNDARY.md"]],
  ["07_PARTICIPANT_STARTER", "Starter 코드", ["PARTICIPANT_GUIDE.md", "SUBMISSION_GUIDE.md"]],
  ["08_EXTENSION_AND_CUSTOMIZATION", "확장과 커스터마이즈", ["EXTENSION_GUIDE.md", "CUSTOMIZATION.md", "SCHEMA_CHANGE_PROCESS.md"]],
  ["09_TROUBLESHOOTING", "문제 해결", ["TROUBLESHOOTING.md", "MIGRATION_FROM_V4.md"]],
];

/** Docs copied verbatim into the deliverable (source → deliverable filename). */
export const DOC_FILES = [
  "PROFILE_DATA_DICTIONARY.md",
  "SESSION_CONTEXT_DICTIONARY.md",
  "MAPPING_GUIDE.md",
  "ENUM_REFERENCE.md",
  "UNKNOWN_POLICY.md",
  "SCHEMA_VERSIONING_POLICY.md",
  "SCHEMA_NEGOTIATION_GUIDE.md",
  "MIGRATION_FROM_V4.md",
];

/** Directory trees mirrored into the deliverable. */
export const DIR_MAPPINGS = [
  { from: path.join(ROOT, "schemas", "core"), to: "schemas/core" },
  { from: path.join(ROOT, "schemas", "domains"), to: "schemas/domains" },
  { from: path.join(ROOT, "schemas", "registry"), to: "schemas/registry" },
  { from: path.join(ROOT, "schemas", "vocabularies"), to: "vocabularies" },
  { from: path.join(ROOT, "examples", "canonical-input"), to: "examples" },
  { from: path.join(ROOT, "packages", "profile-contract", "src"), to: "sdk/profile-contract" },
];

/** Contract version read from the registry (the authoritative source). */
export function contractVersion() {
  const reg = JSON.parse(readFileSync(path.join(ROOT, "schemas", "registry", "contract-registry.json"), "utf-8"));
  return reg.defaultInputContractVersion ?? reg.coreContractVersion ?? "unknown";
}

/** Hash of every source file that feeds the deliverable. */
export function sourceFingerprint() {
  const hash = createHash("sha256");
  for (const doc of DOC_FILES) hash.update(readFileSync(path.join(ROOT, "docs", doc)));
  for (const doc of START_HERE_DOCS) hash.update(readFileSync(path.join(ROOT, "docs", doc)));
  for (const a of START_HERE_ASSETS) hash.update(readFileSync(path.join(ROOT, "docs", a)));
  hash.update(readFileSync(path.join(ROOT, "README_FIRST.md")));
  for (const [dir, title, docs] of DELIVERABLE_SECTIONS) {
    hash.update(dir); hash.update(title);
    for (const d of docs) hash.update(readFileSync(path.join(ROOT, "docs", d)));
  }
  for (const { from } of DIR_MAPPINGS) hashTree(hash, from);
  hash.update(GENERATOR_VERSION);
  return hash.digest("hex");
}

function hashTree(hash, dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir).sort()) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) hashTree(hash, p);
    else { hash.update(entry); hash.update(readFileSync(p)); }
  }
}

export const GENERATED_BANNER = (version, generatedAt) => `<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 \`npm run sync:contracts\` 를 실행하세요.

  generatedAt        : ${generatedAt}
  contractVersion    : ${version}
  generatorVersion   : ${GENERATOR_VERSION}
-->

`;

export const README_BODY = (version, generatedAt) => `# 04. Profile & Input Contract (참가팀 배포자료)

> **이 폴더는 원본 스키마에서 자동 생성됩니다. 이 폴더 안의 파일을 직접 수정하지 마세요.**
>
> | 항목 | 값 |
> | --- | --- |
> | 생성 시각 | \`${generatedAt}\` |
> | 소스 계약 버전 | \`${version}\` |
> | 생성 스크립트 버전 | \`${GENERATOR_VERSION}\` |
>
> 원본을 수정한 뒤 \`npm run sync:contracts\` 를 실행하세요.
> 원본과 이 폴더가 다르면 \`npm run check:contract-drift\` 가 실패합니다.

---

> **참가팀은 어떤 방식으로 사용자 정보를 수집해도 됩니다.**
>
> 웹, 앱, 음성, AI 대화, 보호자 입력 등 수집 인터페이스는 자유롭게 설계할 수 있습니다.
>
> **다만 공식 시뮬레이터에 제출하기 전, 수집한 정보를
> KioBridge Canonical Input Contract 에 맞게 변환해야 합니다.**

## 핵심 원칙

\`\`\`
정보 수집 방식은 참가팀이 자유롭게 설계한다.
하지만 KioBridge 서버로 제출하는 최종 의미, 변수명, 자료형,
enum 값과 버전은 KioBridge Canonical Input Contract 를 따른다.
\`\`\`

## 3층 구조

| 층 | 내용 | 변경 정책 |
| --- | --- | --- |
| **Layer 1. Core** | \`inputContractVersion\` \`teamId\` \`environmentId\` \`profile\` \`sessionContext\` \`recommendation\` \`userDecision\` \`executionPlan\` \`extensions\` | 대회 중 MAJOR 변경 금지 |
| **Layer 2. Domain** | 환경별 \`sessionContext\` (닭강정 / 병원 / 관공서 / sandbox) | 버전 관리하 변경 가능 |
| **Layer 3. Extensions** | 팀 namespace 자유 확장 | 자유 |

## Profile vs SessionContext

| | Profile | SessionContext |
| --- | --- | --- |
| 성격 | 사용자에게 **지속되는** 정보 | **이번 이용에만** 적용 |
| 예 | 큰 글씨 필요, 청각 지원, 선호 입력, 언어 | 이번 주문은 포장, 오늘 예약 여부, 필요한 민원 |

## 이 폴더의 구성

| 경로 | 내용 |
| --- | --- |
| \`PROFILE_DATA_DICTIONARY.md\` | 프로필 전 필드 사전 |
| \`SESSION_CONTEXT_DICTIONARY.md\` | 환경별 SessionContext 사전 |
| \`MAPPING_GUIDE.md\` | Profile Mapper 작성법 |
| \`ENUM_REFERENCE.md\` | 공식 enum 전체 |
| \`UNKNOWN_POLICY.md\` | UNKNOWN · 누락 · NO_PREFERENCE 구분 |
| \`SCHEMA_VERSIONING_POLICY.md\` | 버전 정책 |
| \`SCHEMA_NEGOTIATION_GUIDE.md\` | 계약 협상 API |
| \`MIGRATION_FROM_V4.md\` | v4 → v5 마이그레이션 |
| \`schemas/\` | core · domains · registry 스키마 |
| \`vocabularies/\` | 환경별 공식 enum |
| \`examples/\` | 수집 방식별 Canonical Input 예제 |
| \`sdk/profile-contract/\` | 타입 · enum · 검증기 소스 |

## 제출 전 검증

1. **Schema Playground** — 시뮬레이터 우측 상단 버튼
2. **API** — \`POST /api/v1/contracts/input/validate\`
3. **SDK** — \`validateCanonicalInput(input)\`

## 시작하기

\`\`\`bash
curl localhost:4000/api/v1/contracts                                 # 지원 버전
curl localhost:4000/api/v1/environments/chicken-store/input-contract # 환경 계약
curl localhost:4000/api/v1/vocabularies/chicken-store                # 허용 enum
\`\`\`
`;

/**
 * Rewrites relative Markdown links when a doc is COPIED to a different depth.
 *
 * A link is meaningful as the file it resolves to, not as the string it is
 * written as. So we resolve each link against the SOURCE location, then
 * re-express it relative to the DESTINATION. If the same target was also copied
 * into the deliverable tree, the local copy wins so participants stay inside
 * their folder; otherwise the link points back into the package (e.g. schemas/).
 *
 * @param {string} srcFile   absolute path of the original doc
 * @param {string} destFile  absolute path it is being written to
 * @param {string} content   markdown text
 * @param {Map<string,string>} copies  absolute source path -> absolute dest path
 */
export function rewriteRelativeLinks(srcFile, destFile, content, copies = new Map()) {
  const LINK = /(!?\[[^\]]*\]\()\s*([^)\s]+)((?:\s+"[^"]*")?\s*\))/g;
  const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;
  const srcDir = path.dirname(srcFile);
  const destDir = path.dirname(destFile);

  return content.replace(LINK, (whole, open, target, close) => {
    if (EXTERNAL.test(target)) return whole;
    const [rawPath, anchor] = target.split("#");
    if (!rawPath) return whole;

    let decoded;
    try { decoded = decodeURIComponent(rawPath); } catch { decoded = rawPath; }
    const abs = path.resolve(srcDir, decoded);

    // Prefer a sibling copy inside the deliverable tree when one exists.
    const localDest = copies.get(abs);
    const finalTarget = localDest ?? abs;

    let rel = path.relative(destDir, finalTarget);
    if (!rel) return whole;
    if (!rel.startsWith(".")) rel = `./${rel}`;
    rel = rel.split(path.sep).join("/");
    return `${open}${rel}${anchor ? `#${anchor}` : ""}${close}`;
  });
}
