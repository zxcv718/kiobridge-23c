#!/usr/bin/env node
/**
 * Verifies `package:public` really runs every release gate — by walking the
 * npm script CALL GRAPH, not by string-matching one script body.
 *
 *   node tools/verify-release-chain.mjs [projectRoot]
 *
 * A gate that can be skipped is not a gate. If `build` or `test:e2e` is not
 * reachable from `package:public`, a broken release can still be published.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const scripts = pkg.scripts ?? {};

const ENTRY = "package:public";

/** Script names that must be reachable from the entry point. */
const REQUIRED_SCRIPTS = [
  "sync:contracts", "check:contract-drift", "typecheck", "test", "test:public",
  "verify:docs", "verify:scripts", "verify:windows", "verify:windows-checklist", "verify:e2e-references",
  "verify:release-chain", "verify:package-source-parity", "verify:environment-data", "verify:compatibility-rules",
  "verify:review-mappings", "verify:execution-choice-rules", "verify:vocabulary-membership",
  "verify:public-environment-api", "verify:review-item-labels", "verify:canonical-timestamps", "verify:api-examples", "verify:participant-auth-privacy-copy", "verify:participant-ux-guidance", "verify:participant-onboarding", "build", "test:e2e", "verify:public-package",
];

/** Node tools that must be invoked somewhere in the reachable set. */
const REQUIRED_TOOLS = [
  "tools/build-public-package.mjs",
  "tools/verify-public-package.mjs",
  "tools/verify-api-examples.mjs",
  "tools/verify-participant-auth-privacy-copy.mjs",
  "tools/verify-package-source-parity.mjs",
  "tools/generate-windows-checklist.mjs",
  "tools/verify-participant-ux-guidance.mjs",
];

const errors = [];

/**
 * 패키징 순서는 문자열로만 확인하면 쉽게 틀립니다. 여기서는 build 스크립트
 * 안에서 각 단계가 나타나는 위치를 견주어, 순서가 뒤집히면 잡습니다.
 */
const PACKAGING_ORDER = [
  ["소스 스냅샷", /배포 대상 소스 스냅샷/],
  ["staging 생성", /staging 폴더 생성/],
  ["source ↔ staging parity", /source ↔ staging parity/],
  ["매니페스트 생성", /공식 파일 무결성 매니페스트 갱신/],
  ["소스 변경 검사", /SOURCE_CHANGED_AFTER_STAGING/],
  ["ZIP 생성", /ZIP 생성 \(임시 영역\)/],
  ["압축 무결성", /ZIP 압축 무결성/],
  ["압축 해제본 자기검증", /압축 해제본 자기검증/],
  ["release 이동", /release 로 원자적 이동/],
  ["SHA 생성", /\$\{ZIP_PATH\}\.sha256/],
];

/**
 * npm script references inside a command string.
 * `npm run build -w <pkg>` targets a WORKSPACE package, not this root script,
 * so it is not a self-call — treating it as one would report a false cycle.
 */
function callees(body) {
  const out = new Set();
  for (const m of body.matchAll(/\bnpm\s+run\s+([a-zA-Z0-9:_.-]+)((?:\s+[^&|]*)?)/g)) {
    if (/(^|\s)(-w|--workspace[=\s])/.test(m[2] ?? "")) continue;
    out.add(m[1]);
  }
  // `npm:foo` form used by concurrently
  for (const m of body.matchAll(/\bnpm:([a-zA-Z0-9:_.-]+)/g)) out.add(m[1]);
  return [...out];
}

if (!scripts[ENTRY]) {
  errors.push({ code: "RELEASE_SCRIPT_NOT_FOUND", message: `${ENTRY} 스크립트가 없습니다.` });
}

const reachable = new Set();
const commandText = [];
const stack = [];

(function walk(name) {
  if (stack.includes(name)) {
    errors.push({ code: "RELEASE_CHAIN_CYCLE", message: `순환 참조: ${[...stack, name].join(" → ")}` });
    return;
  }
  const body = scripts[name];
  if (body === undefined) {
    errors.push({ code: "RELEASE_SCRIPT_NOT_FOUND", message: `${stack[stack.length - 1] ?? "(root)"} 가 존재하지 않는 스크립트 "${name}" 을 호출합니다.` });
    return;
  }
  if (reachable.has(name)) return;
  reachable.add(name);
  commandText.push(body);

  stack.push(name);
  for (const next of callees(body)) walk(next);
  stack.pop();
})(ENTRY);

const allCommands = commandText.join("\n");

for (const required of REQUIRED_SCRIPTS) {
  if (!reachable.has(required)) {
    errors.push({
      code: "RELEASE_CHAIN_MISSING_STEP",
      message: `${ENTRY} 에서 "${required}" 에 도달할 수 없습니다.`,
    });
  }
}
for (const tool of REQUIRED_TOOLS) {
  if (!allCommands.includes(tool)) {
    errors.push({ code: "RELEASE_CHAIN_MISSING_STEP", message: `${ENTRY} 체인이 ${tool} 을 실행하지 않습니다.` });
  }
}

// Steps must be chained with && so a failure aborts the release.
for (const name of reachable) {
  const body = scripts[name];
  if (/(^|[^|&])\|\|(?!\|)/.test(body)) {
    errors.push({ code: "RELEASE_CHAIN_MISSING_STEP", message: `"${name}" 에 || 가 있어 실패가 무시될 수 있습니다: ${body}` });
  }
  if (/;\s*npm\s+run/.test(body)) {
    errors.push({ code: "RELEASE_CHAIN_MISSING_STEP", message: `"${name}" 이 ; 로 명령을 이어 실패를 무시합니다: ${body}` });
  }
}

/* 패키징 단계 순서 */
// 이 검증기는 합성된 projectRoot 로도 실행됩니다 (스크립트 그래프만 보는 테스트).
// 그 경우 빌드 스크립트가 없으므로 순서 검사는 대상이 아닙니다.
if (existsSync(path.join(ROOT, "tools", "build-public-package.mjs"))) {
  const build = readFileSync(path.join(ROOT, "tools", "build-public-package.mjs"), "utf-8");
  let last = -1;
  for (const [label, re] of PACKAGING_ORDER) {
    const m = build.search(re);
    if (m < 0) { errors.push({ code: "PACKAGING_ORDER", message: `build-public-package 에 "${label}" 단계가 없습니다.` }); continue; }
    if (m < last) errors.push({ code: "PACKAGING_ORDER", message: `패키징 순서가 뒤집혔습니다: "${label}" 이 앞 단계보다 먼저 나옵니다.` });
    last = Math.max(last, m);
  }
  // 매니페스트는 staging 확정 뒤에 만들어야 합니다.
  const stagingAt = build.search(/source ↔ staging parity/);
  const manifestAt = build.search(/공식 파일 무결성 매니페스트 갱신/);
  const zipAt = build.search(/ZIP 생성 \(임시 영역\)/);
  const selfAt = build.search(/압축 해제본 자기검증/);
  const moveAt = build.search(/release 로 원자적 이동/);
  if (!(stagingAt < manifestAt)) errors.push({ code: "PACKAGING_ORDER", message: "매니페스트가 staging 확정 전에 생성됩니다." });
  if (!(manifestAt < zipAt)) errors.push({ code: "PACKAGING_ORDER", message: "ZIP 이 매니페스트 생성 전에 만들어집니다." });
  if (!(zipAt < selfAt)) errors.push({ code: "PACKAGING_ORDER", message: "자기검증이 ZIP 생성 전에 실행됩니다." });
  if (!(selfAt < moveAt)) errors.push({ code: "PACKAGING_ORDER", message: "자기검증 전에 release 로 이동합니다." });
  // 임시 영역을 거쳐야 합니다.
  if (!/\.release-tmp/.test(build)) errors.push({ code: "PACKAGING_ORDER", message: "임시 영역(.release-tmp) 을 쓰지 않습니다." });
  if (!/renameSync\(TMP_ZIP, ZIP_PATH\)/.test(build)) errors.push({ code: "PACKAGING_ORDER", message: "원자적 이동(renameSync) 이 없습니다." });
}

console.log("RELEASE CHAIN VERIFICATION");
console.log("=".repeat(46));
console.log(`진입점       : ${ENTRY}`);
console.log(`도달 스크립트: ${reachable.size}개`);
console.log("");
for (const required of REQUIRED_SCRIPTS) {
  console.log(`  ${reachable.has(required) ? "OK  " : "MISS"}  ${required}`);
}
console.log("");

if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) console.error(`  [${e.code}] ${e.message}`);
  process.exit(1);
}

console.log("릴리스 게이트가 모두 연결되어 있습니다 (build 와 test:e2e 포함).");
