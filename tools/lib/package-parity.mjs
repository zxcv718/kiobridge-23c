/**
 * 배포 대상 파일의 분류와 해시. 패키징과 검증기가 같은 규칙을 씁니다.
 *
 * v5.1.3 은 패키징 뒤에 tools/verify-public-package.mjs 를 고치고 ZIP 을 다시
 * 만들지 않아, 소스와 배포물이 달라진 채 배포됐습니다. 여기서 정의하는 분류가
 * "무엇이 소스와 바이트가 같아야 하는가" 의 단일 기준입니다.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const shaOf = (file) => sha256(readFileSync(file));

/** ZIP 에 절대 들어가지 않는 것. */
export const EXCLUDED_DIRS = new Set([
  "node_modules", "dist", "build", "coverage", ".git", ".turbo",
  "playwright-report", "test-results", "screenshots", "traces", "videos",
  "__MACOSX", ".cache", "release", ".build", ".release-tmp", ".verify-scan",
]);

/**
 * 패키징이 만들어 넣는 파일. 소스 사본과 바이트가 다를 수 있으므로
 * parity 대상이 아니라 생성 규칙으로 확인합니다.
 */
export const GENERATED_IN_PACKAGE = new Set([
  "official-package-manifest.json",
  "WINDOWS_FINAL_CHECKLIST.md",
]);

/**
 * 소스에는 없지만 staging 에 만들어 넣는 자리표시 파일.
 * 참가팀 폴더를 빈 채로 남기기 위한 것이며, 사유를 여기 적어 관리합니다.
 */
export const ALLOWED_STAGING_ONLY = new Map([
  ["workspace/.gitkeep", "팀 작업폴더 자리를 빈 채로 남깁니다"],
  ["submission-output/.gitkeep", "제출 폴더 자리를 빈 채로 남깁니다"],
]);

/** 소스에만 있고 ZIP 에는 넣지 않는 파일. */
export const SOURCE_ONLY = new Set([
  "DO_NOT_SHARE_THIS_FOLDER.md",
  // 릴리스를 만드는 과정을 검사하는 테스트입니다. 참가팀 트리에는 release/ 가
  // 없으므로 그곳에서는 성립하지 않고, 참가팀에게 쓸모도 없습니다.
  "tests/contract/package-source-parity.test.ts",
  "tests/contract/windows-checklist-packaging.test.ts",
]);

/** 소스에만 두는 경로. 회귀 fixture 는 배포본에 넣지 않습니다. */
export const SOURCE_ONLY_PREFIXES = ["tests/fixtures/"];

/**
 * 반드시 소스와 바이트가 같아야 하는 파일. 하나라도 어긋나면 배포를 멈춥니다.
 * v5.1.3 에서 실제로 어긋났던 파일이 이 목록의 첫 줄입니다.
 */
export const CRITICAL_FILES = [
  "tools/verify-public-package.mjs",
  "tools/verify-package-source-parity.mjs",
  "tools/verify-participant-onboarding.mjs",
  "tools/verify-participant-ux-guidance.mjs",
  "tools/verify-participant-auth-privacy-copy.mjs",
  "tools/verify-api-examples.mjs",
  "tools/verify-canonical-timestamps.mjs",
  "tools/verify-doc-links.mjs",
  "tools/verify-documented-scripts.mjs",
  "tools/verify-windows-scripts.mjs",
  "tools/verify-release-chain.mjs",
  "tools/participant-cli.mjs",
  "tools/build-public-package.mjs",
  "tools/generate-package-manifest.mjs",
  "tools/generate-windows-checklist.mjs",
  "tools/lib/windows-checklist.mjs",
  "tools/lib/package-parity.mjs",
  "package.json",
  "package-lock.json",
  "00_START_HERE.html",
  "participant-workspace/example-ui/index.html",
  "participant-workspace/example-ui/app.js",
  "participant-workspace/example-ui/styles.css",
];

/** 트리 안의 파일을 프로젝트 상대경로로 모읍니다. */
export function listFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  })(root);
  return out.sort();
}

/**
 * 소스에서 그대로 복사돼야 하는 파일 목록.
 * 생성 파일과 소스 전용 파일은 뺍니다.
 */
export function sourceCopiedFiles(root) {
  return listFiles(root).filter((rel) =>
    !GENERATED_IN_PACKAGE.has(rel) && !SOURCE_ONLY.has(rel) && !ALLOWED_STAGING_ONLY.has(rel)
    && !SOURCE_ONLY_PREFIXES.some((p) => rel.startsWith(p)));
}

/** path → {sha256, size} */
export function hashTree(root, files) {
  const map = {};
  for (const rel of files) {
    const full = path.join(root, rel);
    if (!existsSync(full)) continue;
    map[rel] = { sha256: shaOf(full), size: statSync(full).size };
  }
  return map;
}

/**
 * 스냅샷 전체를 대표하는 한 값. 정렬된 `path\0sha` 목록을 다시 해시합니다.
 * 파일 하나만 바뀌어도 이 값이 바뀝니다.
 */
export function snapshotDigest(map) {
  const lines = Object.keys(map).sort().map((p) => `${p}\0${map[p].sha256}`);
  return sha256(lines.join("\n"));
}

/** 두 해시맵을 견줍니다. */
export function compare(a, b, { onlyIn = "both" } = {}) {
  const mismatches = [];
  const missing = [];
  for (const rel of Object.keys(a).sort()) {
    const left = a[rel];
    const right = b[rel];
    if (!right) { if (onlyIn === "both") missing.push(rel); continue; }
    if (left.sha256 !== right.sha256) {
      mismatches.push({ path: rel, aSha: left.sha256, bSha: right.sha256, aSize: left.size, bSize: right.size });
    }
  }
  return { mismatches, missing };
}
