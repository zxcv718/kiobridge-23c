#!/usr/bin/env node
/**
 * 소스 · staging · ZIP 내부의 배포 대상 파일이 같은 바이트인지 확인합니다.
 *
 *   node tools/verify-package-source-parity.mjs [--zip <path>] [--staging <dir>]
 *
 * v5.1.3 은 패키징 뒤 tools/verify-public-package.mjs 를 고치고 ZIP 을 다시
 * 만들지 않아, 소스 38,273 bytes 와 ZIP 내부 37,819 bytes 가 달랐습니다.
 * 그때 통과했던 검증기들은 ZIP "안" 만 보았기 때문에 이를 알 수 없었습니다.
 * 이 검증기는 소스와 배포물을 마주 놓고 비교합니다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_STAGING_ONLY, CRITICAL_FILES, GENERATED_IN_PACKAGE,
  compare, hashTree, snapshotDigest, sourceCopiedFiles, listFiles,
} from "./lib/package-parity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_VERSION = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8")).version;
const PROJECT_NAME = `kiobridge-simulation-kit-v${PRODUCT_VERSION}`;

/**
 * 실행 단계.
 *
 *   pre-build   패키징 직전. ZIP·staging 은 곧 다시 만들 것이므로 비교하지
 *               않습니다. 여기서 옛 ZIP 과의 불일치로 실패시키면, 소스를 고친
 *               뒤에는 영원히 다시 패키징할 수 없게 됩니다.
 *   post-build  기본값. 소스·staging·ZIP 이 모두 같은 바이트여야 합니다.
 */
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const ZIP = path.resolve(argOf("--zip")
  ?? path.join(ROOT, "release", `${PROJECT_NAME}-participant.zip`));
const STAGING = argOf("--staging") ? path.resolve(argOf("--staging")) : path.join(ROOT, "release", PROJECT_NAME);
const PHASE = argOf("--phase") ?? "post-build";
if (!["pre-build", "post-build"].includes(PHASE)) {
  console.error(`[오류] 알 수 없는 --phase: ${PHASE}`);
  process.exit(1);
}

const results = [];
const errors = [];

/** 결과를 찍고 종료합니다. 단계마다 같은 형식으로 보고합니다. */
function report() {
  console.log(`PACKAGE SOURCE PARITY (${PHASE})\n`);
  const width = Math.max(...results.map((r) => r.label.length)) + 2;
  for (const r of results) {
    const state = r.skipped ? "NOT_APPLICABLE" : r.ok ? "PASS" : "FAIL";
    console.log(`${r.label.padEnd(width)}${state}${r.detail ? `  (${r.detail})` : ""}`);
  }
  console.log("");
  if (errors.length > 0) {
    console.error(`검증 실패 ${errors.length}건`);
    process.exit(1);
  }
  console.log(PHASE === "pre-build"
    ? "패키징을 시작할 수 있습니다."
    : "소스·staging·ZIP 의 배포 대상 파일이 모두 같은 바이트입니다.");
  process.exit(0);
}
const pass = (label, detail = "") => results.push({ label, ok: true, detail });
const fail = (label, detail = "") => { results.push({ label, ok: false, detail }); errors.push(`${label}: ${detail}`); };
const skip = (label, detail = "") => results.push({ label, skipped: true, ok: true, detail });

/** 불일치를 사람이 고칠 수 있는 형태로 적습니다. */
function reportMismatches(kind, mismatches) {
  console.error(`\nPACKAGE_SOURCE_PARITY_MISMATCH (${kind}) — ${mismatches.length}건`);
  for (const m of mismatches.slice(0, 10)) {
    console.error(`  path       : ${m.path}`);
    console.error(`  ${kind.split("↔")[0].trim().padEnd(11)}: sha=${m.aSha} size=${m.aSize}`);
    console.error(`  ${kind.split("↔")[1].trim().padEnd(11)}: sha=${m.bSha} size=${m.bSize}`);
    console.error("");
  }
  console.error("해결: npm run package:public 을 다시 실행해 배포물을 새로 만드세요.");
}

/* ── 소스 ────────────────────────────────────────────────────── */

const sourceFiles = sourceCopiedFiles(ROOT);
const sourceHashes = hashTree(ROOT, sourceFiles);
const sourceDigest = snapshotDigest(sourceHashes);
pass("Source snapshot", `${Object.keys(sourceHashes).length} files · ${sourceDigest.slice(0, 16)}…`);

/* ── 패키징 전: 소스 자체만 봅니다 ───────────────────────────── */

if (PHASE === "pre-build") {
  const missingCritical = CRITICAL_FILES.filter((f) => !sourceHashes[f]);
  if (missingCritical.length > 0) {
    fail("Critical files present in source", missingCritical.join(", "));
  } else {
    pass("Critical files present in source", `${CRITICAL_FILES.length} files`);
  }
  skip("Source-to-staging parity", "패키징 직전 — 곧 다시 만듭니다");
  skip("Staging-to-ZIP parity", "패키징 직전");
  skip("Source-to-ZIP parity", "패키징 직전");
  skip("Critical tool parity", "패키징 직전");
  skip("Manifest-to-ZIP parity", "패키징 직전");
  skip("Source snapshot freshness", "패키징 직전");
  report();
}

/* ── A. source ↔ staging ─────────────────────────────────────── */

let stagingHashes = null;
if (!existsSync(STAGING)) {
  skip("Source-to-staging parity", `staging 없음 (${path.relative(ROOT, STAGING)})`);
} else {
  const stagingFiles = listFiles(STAGING)
    .filter((f) => !GENERATED_IN_PACKAGE.has(f) && !ALLOWED_STAGING_ONLY.has(f));
  stagingHashes = hashTree(STAGING, stagingFiles);
  const { mismatches, missing } = compare(stagingHashes, sourceHashes);
  if (mismatches.length > 0) {
    reportMismatches("staging ↔ source", mismatches);
    fail("Source-to-staging parity", `${mismatches.length}건 불일치`);
  } else if (missing.length > 0) {
    fail("Source-to-staging parity", `소스에 없는 staging 파일 ${missing.length}건: ${missing.slice(0, 3).join(", ")}`);
  } else {
    pass("Source-to-staging parity", `${Object.keys(stagingHashes).length} files`);
  }
}

/* ── B·C. staging ↔ ZIP, source ↔ ZIP ────────────────────────── */

let extracted = null;
let scratch = null;
if (!existsSync(ZIP)) {
  skip("Staging-to-ZIP parity", `ZIP 없음 (${path.relative(ROOT, ZIP)})`);
  skip("Source-to-ZIP parity", "ZIP 없음");
  skip("Critical tool parity", "ZIP 없음");
  skip("Manifest-to-ZIP parity", "ZIP 없음");
} else {
  scratch = mkdtempSync(path.join(tmpdir(), "kio-parity-"));
  execFileSync("unzip", ["-qq", ZIP, "-d", scratch]);
  extracted = path.join(scratch, PROJECT_NAME);
  if (!existsSync(extracted)) {
    fail("ZIP 구조", `최상위 폴더가 ${PROJECT_NAME} 이 아닙니다`);
  } else {
    const zipFiles = listFiles(extracted)
      .filter((f) => !GENERATED_IN_PACKAGE.has(f) && !ALLOWED_STAGING_ONLY.has(f));
    const zipHashes = hashTree(extracted, zipFiles);

    if (stagingHashes) {
      const { mismatches } = compare(stagingHashes, zipHashes);
      if (mismatches.length > 0) {
        reportMismatches("staging ↔ zip", mismatches);
        fail("Staging-to-ZIP parity", `${mismatches.length}건 불일치`);
      } else pass("Staging-to-ZIP parity", `${Object.keys(zipHashes).length} files`);
    } else skip("Staging-to-ZIP parity", "staging 없음");

    const { mismatches, missing } = compare(zipHashes, sourceHashes);
    if (mismatches.length > 0) {
      reportMismatches("zip ↔ source", mismatches);
      fail("Source-to-ZIP parity", `${mismatches.length}건 불일치`);
    } else if (missing.length > 0) {
      fail("Source-to-ZIP parity", `소스에 없는 ZIP 파일 ${missing.length}건: ${missing.slice(0, 3).join(", ")}`);
    } else {
      pass("Source-to-ZIP parity", `${Object.keys(zipHashes).length} files`);
    }

    /* ── 핵심 파일은 개별로 다시 확인합니다 ── */
    const criticalBad = [];
    for (const rel of CRITICAL_FILES) {
      const src = sourceHashes[rel];
      const zip = zipHashes[rel];
      if (!src) { criticalBad.push(`${rel}: 소스에 없음`); continue; }
      if (!zip) { criticalBad.push(`${rel}: ZIP 에 없음`); continue; }
      if (src.sha256 !== zip.sha256) {
        criticalBad.push(`${rel}: source ${src.sha256.slice(0, 12)}(${src.size}) ≠ zip ${zip.sha256.slice(0, 12)}(${zip.size})`);
      }
    }
    if (criticalBad.length > 0) {
      console.error("\nPUBLIC_PACKAGE_VERIFIER_STALE — 핵심 파일이 배포물과 다릅니다");
      for (const b of criticalBad) console.error(`  ${b}`);
      fail("Critical tool parity", criticalBad.slice(0, 3).join(" | "));
    } else {
      pass("Critical tool parity", `${CRITICAL_FILES.length} files`);
    }

    /* ── D. manifest ↔ ZIP ── */
    const manifestPath = path.join(extracted, "official-package-manifest.json");
    if (!existsSync(manifestPath)) fail("Manifest-to-ZIP parity", "매니페스트 없음");
    else {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const bad = [];
      for (const [rel, expected] of Object.entries(manifest.files ?? {})) {
        const actual = zipHashes[rel] ?? hashTree(extracted, [rel])[rel];
        if (!actual) { bad.push(`${rel}: ZIP 에 없음`); continue; }
        if (actual.sha256 !== expected) bad.push(`${rel}: manifest ${expected.slice(0, 12)} ≠ zip ${actual.sha256.slice(0, 12)}`);
      }
      for (const c of manifest.criticalFiles ?? []) {
        const actual = hashTree(extracted, [c.path])[c.path];
        if (!actual) { bad.push(`${c.path}: ZIP 에 없음`); continue; }
        if (actual.sha256 !== c.sha256) bad.push(`${c.path}: criticalFiles sha 불일치`);
        if (actual.size !== c.size) bad.push(`${c.path}: criticalFiles size 불일치`);
      }
      if (bad.length > 0) fail("Manifest-to-ZIP parity", bad.slice(0, 3).join(" | "));
      else pass("Manifest-to-ZIP parity", `${Object.keys(manifest.files ?? {}).length} files`);
    }
  }
}

/* ── 스냅샷 대조: 패키징 이후 소스가 바뀌었는가 ─────────────────── */

const snapshotPath = path.join(ROOT, ".build", "package-source-snapshot.json");
if (!existsSync(snapshotPath)) {
  skip("Source snapshot freshness", "스냅샷 없음 (아직 패키징하지 않음)");
} else {
  const snap = JSON.parse(readFileSync(snapshotPath, "utf-8"));
  const recorded = Object.fromEntries((snap.files ?? []).map((f) => [f.path, { sha256: f.sha256, size: f.size }]));
  const { mismatches } = compare(recorded, sourceHashes);
  if (snap.productVersion !== PRODUCT_VERSION) {
    fail("Source snapshot freshness", `스냅샷 버전 ${snap.productVersion} ≠ 현재 ${PRODUCT_VERSION} — 다시 패키징하세요`);
  } else if (mismatches.length > 0) {
    console.error("\nSOURCE_CHANGED_AFTER_PACKAGING — 패키징 이후 소스가 바뀌었습니다");
    for (const m of mismatches.slice(0, 10)) {
      console.error(`  path       : ${m.path}`);
      console.error(`  beforeSha  : ${m.aSha}  (${m.aSize} bytes)`);
      console.error(`  afterSha   : ${m.bSha}  (${m.bSize} bytes)`);
    }
    console.error("해결: npm run package:public 을 다시 실행하세요.");
    fail("Source snapshot freshness", `${mismatches.length}건 변경됨`);
  } else {
    pass("Source snapshot freshness", `${snap.sourceSnapshotSha256.slice(0, 16)}… · ${snap.createdAt}`);
  }
}

if (scratch) rmSync(scratch, { recursive: true, force: true });

report();
