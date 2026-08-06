#!/usr/bin/env node
/**
 * Participant CLI — the six commands a team needs, and nothing else.
 *
 *   npm run participant:doctor      설치·서버·버전 점검
 *   npm run participant:demo        Sandbox 왕복 시연
 *   npm run participant:init        내 작업폴더 생성
 *   npm run participant:progress    9단계 구현 상태
 *   npm run participant:validate    내 제출물 검증
 *   npm run participant:package     최종 제출 폴더 생성
 *
 * None of these produce a recommendation or an execution plan. They check,
 * report, and package what the team already built.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const PRODUCT_VERSION = PKG.version;
const CONTRACT_VERSION = "1.0.0";
const API = process.env.SIM_API_URL ?? "http://localhost:4000";
const WEB = process.env.SIM_WEB_URL ?? "http://localhost:3000";
const OFFICIAL_ENVIRONMENTS = ["sandbox", "chicken-store", "hospital", "public-office"];

const C = { ok: "[32m", bad: "[31m", warn: "[33m", dim: "[2m", off: "[0m" };
const pass = (m, d = "") => console.log(`${C.ok}[PASS]${C.off} ${m}${d ? ` ${C.dim}${d}${C.off}` : ""}`);
const fail = (m, fix = "") => { console.log(`${C.bad}[FAIL]${C.off} ${m}`); if (fix) console.log(`       ${C.dim}해결: ${fix}${C.off}`); };
const warn = (m, d = "") => console.log(`${C.warn}[WARN]${C.off} ${m}${d ? ` ${C.dim}${d}${C.off}` : ""}`);
const info = (m) => console.log(`       ${C.dim}${m}${C.off}`);
const head = (t) => { console.log(`\n${t}`); console.log("=".repeat(Math.max(30, t.length))); };

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i += 1; }
    } else out._.push(a);
  }
  return out;
}

async function fetchJson(url, init) {
  const res = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`${res.status} ${(body && body.error) || text}`);
  return body;
}

const majorOf = (v) => Number(String(v).replace(/^v/, "").split(".")[0]);

/* ─────────────────────────── doctor ─────────────────────────── */

async function doctor() {
  head("KioBridge participant:doctor");
  let failures = 0;
  const bad = (...a) => { failures += 1; fail(...a); };

  const nodeMajor = majorOf(process.versions.node);
  nodeMajor >= 20 ? pass(`Node.js ${process.versions.node}`)
    : bad(`Node.js ${process.versions.node} (20 이상 필요)`, "https://nodejs.org 에서 LTS 설치");

  try {
    const npmV = execFileSync("npm", ["--version"], { encoding: "utf-8" }).trim();
    majorOf(npmV) >= 10 ? pass(`npm ${npmV}`) : warn(`npm ${npmV}`, "10 이상 권장");
  } catch { bad("npm 을 찾을 수 없습니다", "Node.js 를 다시 설치하세요"); }

  existsSync(path.join(ROOT, "package.json"))
    ? pass("package.json 위치", path.relative(process.cwd(), ROOT) || ".")
    : bad("프로젝트 루트를 찾을 수 없습니다", "ZIP 을 다시 압축 해제하세요");

  existsSync(path.join(ROOT, "node_modules"))
    ? pass("의존성 설치됨")
    : bad("node_modules 가 없습니다", "npm ci");

  // Servers. Not being up is normal before `npm run dev`, so it is a warning.
  let health = null;
  try {
    health = await fetchJson(`${API}/health`);
    pass(`Simulation API :4000`, health.service);
  } catch {
    warn("Simulation API :4000 응답 없음", "npm run dev 로 서버를 켜세요");
  }
  try {
    const res = await fetch(WEB);
    res.ok ? pass("Simulator Web :3000") : warn(`Simulator Web :3000 HTTP ${res.status}`);
  } catch {
    warn("Simulator Web :3000 응답 없음", "npm run dev 로 서버를 켜세요");
  }

  if (health) {
    health.productVersion === PRODUCT_VERSION
      ? pass(`Product ${health.productVersion}`)
      : bad(`Product 불일치: 서버 ${health.productVersion} vs 패키지 ${PRODUCT_VERSION}`, "서버를 재시작하세요");
    health.inputContractVersion === CONTRACT_VERSION
      ? pass(`Input Contract ${health.inputContractVersion}`)
      : bad(`Input Contract 불일치: ${health.inputContractVersion}`);
  } else {
    info(`패키지 기준 Product ${PRODUCT_VERSION} · Input Contract ${CONTRACT_VERSION}`);
  }

  for (const f of ["00_START_HERE.html", "README_FIRST.md", "participant-workspace/src/participant.ts",
    "examples/submission-format-example/sandbox.json", "docs/ERROR_CATALOG.md"]) {
    existsSync(path.join(ROOT, f)) ? pass(`필수 파일 ${f}`) : bad(`필수 파일 없음: ${f}`, "ZIP 을 다시 압축 해제하세요");
  }

  try {
    const probe = path.join(ROOT, "participant-workspace", ".write-probe");
    writeFileSync(probe, "ok");
    execFileSync("rm", ["-f", probe]);
    pass("participant-workspace 쓰기 가능");
  } catch { bad("participant-workspace 에 쓸 수 없습니다", "폴더 권한을 확인하세요"); }

  // Accidental edits to platform files: warn, never delete anything.
  const manifestPath = path.join(ROOT, "official-package-manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

    /**
     * criticalFiles are different from the rest: a missing or altered one means
     * the package the team unpacked is not the official package. That blocks
     * READY, because every later step would be diagnosing the wrong tree.
     */
    for (const c of manifest.criticalFiles ?? []) {
      const full = path.join(ROOT, c.path);
      if (!existsSync(full)) {
        bad(`${c.path} 가 없습니다`, "공식 Participant ZIP 을 다시 압축 해제하세요");
        continue;
      }
      const buf = readFileSync(full);
      const actual = createHash("sha256").update(buf).digest("hex");
      if (buf.length !== c.size) {
        bad(`${c.path} 크기가 다릅니다`, `기대 ${c.size} bytes · 실제 ${buf.length} bytes`);
      } else if (actual !== c.sha256) {
        const code = c.path === "tools/verify-public-package.mjs"
          ? "PUBLIC_PACKAGE_VERIFIER_STALE" : "OFFICIAL_PACKAGE_MANIFEST_MISMATCH";
        bad(`${c.path} 내용이 변조되었습니다`,
          `${code} — expectedSha ${c.sha256.slice(0, 12)} · actualSha ${actual.slice(0, 12)}`);
      } else {
        pass(c.path, `${buf.length} bytes · SHA ${actual.slice(0, 12)}…`);
      }
    }

    const changed = [];
    const criticalPaths = new Set((manifest.criticalFiles ?? []).map((c) => c.path));
    for (const [rel, expected] of Object.entries(manifest.files ?? {})) {
      if (criticalPaths.has(rel)) continue; // 위에서 이미 엄격하게 검사했습니다
      const full = path.join(ROOT, rel);
      if (!existsSync(full)) { changed.push(`${rel} (없음)`); continue; }
      const actual = createHash("sha256").update(readFileSync(full)).digest("hex");
      if (actual !== expected) changed.push(rel);
    }
    const comparedCount = Object.keys(manifest.files ?? {}).length - criticalPaths.size;
    if (changed.length === 0) pass(`공식 파일 무결성 (${comparedCount}개)`);
    else {
      warn(`공식 파일 ${changed.length}개가 변경되었습니다`, changed.slice(0, 3).join(", "));
      info("공식 평가는 운영진의 깨끗한 패키지에서 재실행됩니다. 작업 파일은 그대로 두세요.");
      info("되돌리려면 ZIP 을 새 폴더에 다시 풀고 participant-workspace 만 복사하세요.");
    }
  } else {
    info("official-package-manifest.json 이 없어 무결성 검사를 건너뜁니다.");
  }

  console.log("");
  if (failures === 0) {
    console.log(`${C.ok}[READY]${C.off} 개발을 시작할 수 있습니다.`);
    console.log(`${C.dim}다음: npm run participant:demo${C.off}`);
    return 0;
  }
  console.log(`${C.bad}[BLOCKED]${C.off} ${failures}건을 먼저 해결하세요.`);
  return 1;
}

/* ─────────────────────────── demo ─────────────────────────── */

async function demo() {
  head("KioBridge participant:demo (Sandbox)");
  const example = path.join(ROOT, "examples", "submission-format-example", "sandbox.json");
  if (!existsSync(example)) { fail("Sandbox 예제를 찾을 수 없습니다"); return 1; }
  const submission = JSON.parse(readFileSync(example, "utf-8"));
  delete submission._note;

  try {
    const fixture = await fetchJson(`${API}/api/v1/environments/sandbox/fixture`);
    pass(`Fixture: ${fixture.manifest.name}`, `후보 ${fixture.candidates.length}개`);

    const session = await fetchJson(`${API}/api/v1/sessions`, { method: "POST", body: JSON.stringify({ environmentId: "sandbox" }) });
    pass(`세션 생성 ${session.sessionId}`, session.submissionStatus);

    await fetchJson(`${API}/api/v1/sessions/${session.sessionId}/submission`, { method: "POST", body: JSON.stringify(submission) });
    pass("제출 완료");

    const validation = await fetchJson(`${API}/api/v1/sessions/${session.sessionId}/validate`, { method: "POST", body: "{}" });
    validation.valid ? pass("검증 통과") : fail(`검증 실패 ${validation.errors.length}건`);
    if (!validation.valid) return 1;

    await fetchJson(`${API}/api/v1/sessions/${session.sessionId}/execute`, { method: "POST", body: "{}" });
    const evidence = await fetchJson(`${API}/api/v1/sessions/${session.sessionId}/evidence`);
    pass(`SIMULATION ${evidence.result}`, `${evidence.stopType} · ${evidence.resultScope}`);

    const trace = (evidence.resolvedSimulationTrace ?? [])[0];
    if (trace) {
      pass("의미 기반 후보 자동 해석",
        `page ${trace.resolvedTarget.pageIndex} slot ${trace.resolvedTarget.slotIndex} (${trace.resolvedTarget.navigationClassification})`);
    }

    console.log("");
    console.log(`${C.dim}이 예제는 연습용 Sandbox 입니다. 공식 3환경의 정답이 아닙니다.${C.off}`);
    console.log(`${C.dim}다음: npm run participant:init -- --team TEAM-001 --env sandbox${C.off}`);
    return evidence.result === "PASS" ? 0 : 1;
  } catch (err) {
    fail(`API 호출 실패: ${err.message}`, "npm run dev 로 서버를 켠 뒤 다시 실행하세요");
    return 1;
  }
}

/* ─────────────────────────── init ─────────────────────────── */

function init(args) {
  head("KioBridge participant:init");
  const team = args.team;
  const env = args.env ?? "sandbox";

  if (!team || team === true) { fail("--team 이 필요합니다", "npm run participant:init -- --team TEAM-001 --env sandbox"); return 2; }
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(team)) {
    fail(`팀 ID 형식이 올바르지 않습니다: ${team}`, "영문 대문자·숫자·하이픈 3~32자 (예: TEAM-001)");
    return 2;
  }
  if (!OFFICIAL_ENVIRONMENTS.includes(env)) {
    fail(`알 수 없는 환경: ${env}`, `사용 가능: ${OFFICIAL_ENVIRONMENTS.join(", ")}`);
    return 2;
  }

  const target = path.join(ROOT, "workspace", team);
  if (existsSync(target)) {
    fail(`이미 존재합니다: workspace/${team}`, "다른 팀 ID 를 쓰거나 폴더를 직접 옮기세요 (덮어쓰지 않습니다)");
    return 1;
  }

  mkdirSync(path.join(target, "src"), { recursive: true });
  mkdirSync(path.join(target, "input"), { recursive: true });
  mkdirSync(path.join(target, "output"), { recursive: true });
  mkdirSync(path.join(target, "tests"), { recursive: true });

  cpSync(path.join(ROOT, "participant-workspace", "src", "participant.ts"), path.join(target, "src", "participant.ts"));
  for (const f of ["types.ts", "config.ts", "raw-input.example.ts"]) {
    const src = path.join(ROOT, "participant-workspace", "src", f);
    if (existsSync(src)) cpSync(src, path.join(target, "src", f));
  }

  writeFileSync(path.join(target, "participant.config.json"), JSON.stringify({
    teamId: team,
    environmentId: env,
    productVersion: PRODUCT_VERSION,
    inputContractVersion: CONTRACT_VERSION,
    createdAt: new Date().toISOString(),
    outputFile: `workspace/${team}/output/participant-submission.json`,
  }, null, 2) + "\n");

  const uxTemplate = path.join(ROOT, "participant-workspace", "participant-ux.template.json");
  if (existsSync(uxTemplate)) {
    const doc = JSON.parse(readFileSync(uxTemplate, "utf-8"));
    delete doc._note;
    // _loginRequired 등 의미 설명은 남깁니다. 팀이 파일만 보고도 뜻을 알 수 있어야 합니다.
    writeFileSync(path.join(target, "participant-ux.json"), JSON.stringify(doc, null, 2) + "\n");
  }

  writeFileSync(path.join(target, "input", "raw-user-input.json"), JSON.stringify({
    _note: "여러분이 수집한 원본 입력을 여기에 두세요. 형식은 자유입니다.",
    example: { largeText: true, preferredInput: "TOUCH" },
  }, null, 2) + "\n");

  const exampleHint = env === "sandbox"
    ? "- 연습용 완성 예제: examples/submission-format-example/sandbox.json"
    : "- 이 환경의 완성 예제는 제공되지 않습니다. recommendation 과 executionPlan 은 직접 만드세요.";

  writeFileSync(path.join(target, "README.md"), `# ${team} 작업 폴더

| 항목 | 값 |
| --- | --- |
| 팀 ID | \`${team}\` |
| 환경 | \`${env}\` |
| 제품 버전 | \`${PRODUCT_VERSION}\` |
| 입력계약 버전 | \`${CONTRACT_VERSION}\` |

## 수정할 파일

\`\`\`
workspace/${team}/src/participant.ts   ← 여기부터 시작
\`\`\`

## 순서

1. \`src/participant.ts\` 의 9개 함수를 위에서부터 구현
2. \`npm run participant:progress\` 로 상태 확인
3. 결과를 \`output/participant-submission.json\` 으로 저장
4. \`npm run participant:validate -- --file workspace/${team}/output/participant-submission.json --execute\`
5. \`npm run participant:package -- --team ${team} --file workspace/${team}/output/participant-submission.json\`

## 참고

- 환경 가이드: \`docs/environments/${env.toUpperCase().replace(/-/g, "_")}_PARTICIPANT_GUIDE.md\`
- 오류코드: \`docs/ERROR_CATALOG.md\`
- 주석 예제: \`examples/annotated/\`
${exampleHint}
`);

  pass(`workspace/${team} 생성`, `환경 ${env}`);
  console.log("");
  console.log("다음 파일부터 수정하세요:");
  console.log(`  ${C.ok}workspace/${team}/src/participant.ts${C.off}`);
  console.log("");
  console.log(`${C.dim}다음: npm run participant:progress${C.off}`);
  return 0;
}

/* ─────────────────────────── progress ─────────────────────────── */

const STEPS = [
  ["collectProfile", "사용자 정보 수집"],
  ["mapToCanonicalInput", "Canonical Profile 변환"],
  ["createSessionContext", "세션 맥락 구성"],
  ["filterCandidates", "제약 위반 후보 제외"],
  ["recommend", "순위 결정"],
  ["explainRecommendation", "추천 이유 설명"],
  ["buildAlternatives", "대안 제시"],
  ["collectUserDecision", "사용자 승인"],
  ["buildExecutionPlan", "의미 기반 실행계획"],
];

async function progress(args) {
  head("KioBridge participant:progress");

  const team = args.team;
  const file = team
    ? path.join(ROOT, "workspace", team, "src", "participant.ts")
    : path.join(ROOT, "participant-workspace", "src", "participant.ts");

  if (!existsSync(file)) {
    fail(`participant.ts 를 찾을 수 없습니다: ${path.relative(ROOT, file)}`,
      "npm run participant:init -- --team TEAM-001 --env sandbox");
    return 1;
  }
  console.log(`${C.dim}대상: ${path.relative(ROOT, file)}${C.off}\n`);

  // Actually call each function: a body that still throws NOT_IMPLEMENTED is
  // unambiguous, and a body that runs is real progress. String matching would
  // count a leftover comment as an implementation.
  let mod;
  try {
    mod = await import(`${file}?t=${Date.now()}`);
  } catch (err) {
    fail(`불러오지 못했습니다: ${String(err.message ?? err).split("\n")[0]}`, "문법 오류를 먼저 고치세요");
    return 1;
  }

  let done = 0;
  for (let i = 0; i < STEPS.length; i += 1) {
    const [name, label] = STEPS[i];
    const fn = mod[name];
    const tag = `[${i + 1}/9] ${name}`.padEnd(34);
    if (typeof fn !== "function") {
      console.log(`${tag}${C.bad}MISSING${C.off}          ${C.dim}${label}${C.off}`);
      continue;
    }
    let implemented = true;
    try {
      const out = fn.length === 0 ? fn() : fn(undefined, undefined, undefined);
      if (out && typeof out.then === "function") await out.catch((e) => { throw e; });
    } catch (err) {
      if (String(err && err.message).startsWith("NOT_IMPLEMENTED")) implemented = false;
      // Any other error means the team wrote code that ran and failed on the
      // dummy arguments — that counts as implemented.
    }
    if (implemented) { done += 1; console.log(`${tag}${C.ok}DONE${C.off}             ${C.dim}${label}${C.off}`); }
    else console.log(`${tag}${C.warn}NOT_IMPLEMENTED${C.off}  ${C.dim}${label}${C.off}`);
  }

  console.log("");
  console.log(`구현: ${done}/9`);

  await uxChecks(team, args);

  console.log("");
  console.log(done === 9
    ? `${C.dim}다음: npm run participant:validate -- --file <출력 JSON> --execute${C.off}`
    : `${C.dim}다음: 남은 함수를 구현하세요.${C.off}`);
  return 0;
}

/**
 * UX checks.
 *
 * Some of this can be verified (a submission either has reasons or it does
 * not). Some cannot — whether a sentence is understandable is a human call.
 * The two are reported separately, and the second never becomes PASS.
 */
async function uxChecks(team, args) {
  const status = { PASS: `${C.ok}PASS${C.off}`, FAIL: `${C.bad}FAIL${C.off}`,
    NOT_IMPLEMENTED: `${C.warn}NOT_IMPLEMENTED${C.off}`, NOT_APPLICABLE: `${C.dim}NOT_APPLICABLE${C.off}` };
  const line = (state, label, detail = "") =>
    console.log(`  ${status[state] ?? state}  ${label}${detail ? ` ${C.dim}${detail}${C.off}` : ""}`);

  console.log("");
  console.log("사용자 접점 자동 검사");
  console.log("-".repeat(46));

  // 1) UX declaration
  const uxPath = team ? path.join(ROOT, "workspace", team, "participant-ux.json") : null;
  let ux = null;
  if (uxPath && existsSync(uxPath)) {
    try { ux = JSON.parse(readFileSync(uxPath, "utf-8")); }
    catch { line("FAIL", "participant-ux.json 파싱 실패"); }
  }
  if (!ux) {
    line("NOT_IMPLEMENTED", "participant-ux.json", team ? "npm run participant:init 으로 만들어집니다" : "--team <팀ID> 를 주면 확인합니다");
  } else {
    // loginRequired=false 는 "로그인 기능이 없다"가 아니라
    // "핵심 흐름이 로그인에 막히지 않는다"는 뜻입니다. 문구를 그렇게 씁니다.
    line(ux.loginRequired === false ? "PASS" : "FAIL", "로그인 없이 핵심 흐름 이용 가능",
      `loginRequired=${ux.loginRequired}`);
    line(ux.anonymousStartSupported ? "PASS" : "FAIL", "익명 시작 지원");
    if (ux.optionalLoginSupported) {
      line("NOT_APPLICABLE", "선택적 로그인 화면 있음", "익명 경로는 아래 수동 검토 항목입니다");
    }
    line(ux.deleteStoredProfileSupported ? "PASS" : "FAIL", "저장정보 삭제 경로 선언");
    line(ux.oneTimeUseSupported ? "PASS" : "FAIL", "이번 한 번만 사용 경로 선언");
    line(ux.recommendationReasonsShown ? "PASS" : "FAIL", "추천 이유 표시 선언");
    line(ux.alternativesShown || ux.recommendationCanBeRejected ? "PASS" : "FAIL", "대안 또는 거절 경로 선언");
    line(ux.userConfirmationRequired ? "PASS" : "FAIL", "사용자 확인 단계 선언");
    if (ux.externalApiUsed) {
      line(ux.externalApiFallbackDocumented ? "PASS" : "FAIL", "외부 API fallback 설명", "externalApiUsed=true");
    } else {
      line("NOT_APPLICABLE", "외부 API fallback", "외부 API 를 쓰지 않음");
    }
    line((ux.accessibilityChannels ?? []).length > 0 ? "PASS" : "FAIL",
      "접근성 채널 선언", (ux.accessibilityChannels ?? []).join(", "));
  }

  // 2) A produced submission, if there is one, is checked for real.
  const candidates = [
    args.file,
    team && path.join(ROOT, "workspace", team, "output", "participant-submission.json"),
  ].filter(Boolean).map((f) => path.resolve(f));
  const found = candidates.find((f) => existsSync(f));

  if (!found) {
    line("NOT_IMPLEMENTED", "제출물 검사", "output/participant-submission.json 이 아직 없습니다");
  } else {
    let sub;
    try { sub = JSON.parse(readFileSync(found, "utf-8")); }
    catch { line("FAIL", "제출물 JSON 파싱 실패", found); sub = null; }
    if (sub) {
      console.log(`  ${C.dim}대상: ${path.relative(ROOT, found)}${C.off}`);
      const rec = sub.recommendation ?? {};
      const reasons = rec.recommendationReasons ?? [];
      line(reasons.length > 0 ? "PASS" : "FAIL", "recommendation.reasons 1개 이상", `${reasons.length}개`);

      const banned = reasons.filter((r) => /AI가 추천|최적의 선택|시스템이 결정/.test(String(r)));
      line(banned.length === 0 ? "PASS" : "FAIL", "설명이 아닌 문구 없음", banned.join(" · "));

      line((rec.alternativeCandidateIds ?? []).length > 0 || (rec.excludedCandidates ?? []).length > 0
        ? "PASS" : "FAIL", "대안 또는 제외 사유 존재");

      const approved = sub.userDecision?.approved === true;
      const actions = sub.executionPlan?.actions ?? [];
      line(approved || actions.length === 0 ? "PASS" : "FAIL",
        "사용자 확인 후에만 실행계획", approved ? "approved=true" : "미승인인데 action 이 있습니다");

      // extensions: namespace + no core overwrite + provenance
      const ext = sub.sessionContext?.extensions;
      if (!ext || Object.keys(ext).length === 0) {
        line("NOT_APPLICABLE", "extensions namespace", "외부 맥락을 쓰지 않음");
      } else {
        const CORE = ["intent", "facts", "preferences", "hardConstraints", "capabilities", "fieldMetadata"];
        const bad = Object.keys(ext).filter((k) => CORE.includes(k) || !/^[A-Z][A-Z0-9_]*\.[A-Za-z]/.test(k));
        line(bad.length === 0 ? "PASS" : "FAIL", "extensions 팀 namespace", bad.join(", "));
        line(Object.keys(ext).every((k) => !CORE.includes(k)) ? "PASS" : "FAIL", "Core 필드 덮어쓰기 없음");

        const signals = Object.entries(ext).filter(([k]) => k.endsWith(".contextSignals")).flatMap(([, v]) => Array.isArray(v) ? v : []);
        if (signals.length === 0) line("NOT_APPLICABLE", "contextSignal 출처·시각");
        else {
          const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
          line(signals.every((s) => s.source) ? "PASS" : "FAIL", "contextSignal source 존재");
          line(signals.every((s) => UTC.test(String(s.observedAt))) ? "PASS" : "FAIL", "observedAt UTC");
          const withExpiry = signals.filter((s) => s.expiresAt !== undefined);
          line(withExpiry.length === 0 ? "NOT_APPLICABLE"
            : withExpiry.every((s) => UTC.test(String(s.expiresAt))) ? "PASS" : "FAIL", "expiresAt UTC");
          // 외부 맥락을 썼다면 이유에도 나타나야 합니다.
          const types = signals.map((s) => String(s.type));
          const KO = { WEATHER: "비|눈|맑|날씨|더|추", TIME_OF_DAY: "시간|점심|아침|저녁|오전|오후",
            CROWDING: "붐|혼잡|대기|빠르", HOLIDAY: "명절|연휴|공휴", STOCK: "재고|품절|준비" };
          const mentioned = types.some((t) => {
            const re = KO[t]; return re ? reasons.some((r) => new RegExp(re).test(String(r))) : true;
          });
          line(mentioned ? "PASS" : "FAIL", "외부 맥락이 추천 이유에 반영됨", types.join(", "));
        }
      }

      // 실제 개인정보 패턴
      const text = JSON.stringify(sub);
      const pii = [[/\d{6}\s*-\s*\d{7}/, "주민등록번호"], [/01[016-9]-?\d{3,4}-?\d{4}/, "휴대전화"],
        [/\b\d{4}-\d{4}-\d{4}-\d{4}\b/, "카드번호"]].filter(([re]) => re.test(text)).map(([, l]) => l);
      line(pii.length === 0 ? "PASS" : "FAIL", "실제 개인정보 패턴 없음", pii.join(", "));
    }
  }

  // Things a machine cannot judge are reported as such, never as PASS.
  console.log("");
  console.log("사람이 확인해야 하는 항목");
  console.log("-".repeat(46));
  for (const m of [
    "실제 사용자가 추천 이유를 이해할 수 있는가",
    "키보드만으로 전체 흐름이 가능한가",
    "화면 확대 200% 에서 사용할 수 있는가",
    "색상 없이 상태를 이해할 수 있는가",
    "음성 없이도 사용할 수 있는가",
    "로그인 또는 계정 화면이 있더라도 익명 시작 경로가 실제로 동작하는가",
    "로그인 없이 추천부터 최종 확인까지 끝낼 수 있는가",
    "저장 정보가 과도하지 않은가",
    "추천을 거절할 수 있는가",
    "사용자 확인 전에 실행하지 않는가",
  ]) console.log(`  ${C.warn}MANUAL_REVIEW_REQUIRED${C.off}  ${m}`);
  if (ux && (ux.manualReviewNotes ?? []).length > 0) {
    console.log("");
    console.log(`  ${C.dim}팀 메모:${C.off}`);
    for (const n of ux.manualReviewNotes) console.log(`    - ${n}`);
  }
}

/* ─────────────────────────── validate ─────────────────────────── */

function validate(args) {
  head("KioBridge participant:validate");
  if (!args.file || args.file === true) {
    fail("--file 이 필요합니다", "npm run participant:validate -- --file ./workspace/TEAM-001/output/participant-submission.json");
    return 2;
  }
  const file = path.resolve(args.file);
  if (!existsSync(file)) { fail(`파일이 없습니다: ${file}`); return 2; }

  const cmd = [path.join(ROOT, "tools", "check-submission.mjs"), "--file", file];
  if (args.execute) cmd.push("--execute");
  const r = spawnSync(process.execPath, cmd, { cwd: ROOT, stdio: "inherit" });

  if (r.status === 0) {
    console.log("");
    console.log(`${C.dim}다음: npm run participant:package -- --team <TEAM> --file ${args.file}${C.off}`);
    return 0;
  }
  console.log("");
  console.log("고칠 위치를 찾는 법");
  console.log("-".repeat(30));
  console.log(`  1. 위 오류의 ${C.ok}code${C.off} 를 docs/ERROR_CATALOG.md 에서 찾으세요.`);
  console.log(`  2. ${C.ok}path${C.off} 가 어느 단계의 결과인지 알려줍니다:`);
  console.log(`     /profile/…            → STEP 2 mapToCanonicalInput`);
  console.log(`     /sessionContext/…     → STEP 3 createSessionContext`);
  console.log(`     /recommendation/…     → STEP 4·5 filterCandidates · recommend`);
  console.log(`     /userDecision/…       → STEP 8 collectUserDecision`);
  console.log(`     /executionPlan/…      → STEP 9 buildExecutionPlan`);
  console.log(`  3. 고칠 파일: ${C.ok}workspace/<TEAM>/src/participant.ts${C.off}`);
  console.log("");
  console.log(`${C.dim}이 도구는 오류를 대신 고치지 않습니다.${C.off}`);
  return r.status ?? 1;
}

/* ─────────────────────────── package ─────────────────────────── */

async function packageSubmission(args) {
  head("KioBridge participant:package");
  const team = args.team;
  if (!team || team === true) { fail("--team 이 필요합니다"); return 2; }
  if (!args.file || args.file === true) { fail("--file 이 필요합니다"); return 2; }

  const file = path.resolve(args.file);
  if (!existsSync(file)) { fail(`파일이 없습니다: ${file}`); return 2; }
  const submission = JSON.parse(readFileSync(file, "utf-8"));
  delete submission._note;

  // Packaging a failing submission would hand the team a false sense of done.
  let validation, evidence;
  try {
    const session = await fetchJson(`${API}/api/v1/sessions`, {
      method: "POST", body: JSON.stringify({ environmentId: submission.environmentId }),
    });
    await fetchJson(`${API}/api/v1/sessions/${session.sessionId}/submission`, { method: "POST", body: JSON.stringify(submission) });
    validation = await fetchJson(`${API}/api/v1/sessions/${session.sessionId}/validate`, { method: "POST", body: "{}" });
    if (!validation.valid) {
      fail(`검증 실패 ${validation.errors.length}건 — 패키징을 중단합니다`);
      for (const e of validation.errors.slice(0, 5)) console.log(`       ${e.code} @ ${e.path}`);
      info("npm run participant:validate 로 전체 오류를 확인하세요.");
      return 1;
    }
    pass("검증 통과");
    await fetchJson(`${API}/api/v1/sessions/${session.sessionId}/execute`, { method: "POST", body: "{}" });
    evidence = await fetchJson(`${API}/api/v1/sessions/${session.sessionId}/evidence`);
    if (evidence.result !== "PASS") {
      fail(`SIMULATION ${evidence.result} (${evidence.stopReason}) — 패키징을 중단합니다`);
      return 1;
    }
    pass(`SIMULATION ${evidence.result}`, evidence.stopType);
  } catch (err) {
    fail(`API 호출 실패: ${err.message}`, "npm run dev 로 서버를 켠 뒤 다시 실행하세요");
    return 1;
  }

  const outDir = path.join(ROOT, "submission-output", team);
  mkdirSync(outDir, { recursive: true });

  const submissionJson = JSON.stringify(submission, null, 2) + "\n";
  writeFileSync(path.join(outDir, "participant-submission.json"), submissionJson);
  writeFileSync(path.join(outDir, "simulation-evidence.json"), JSON.stringify(evidence, null, 2) + "\n");

  const sha = createHash("sha256").update(submissionJson).digest("hex");
  writeFileSync(path.join(outDir, "submission.sha256"), `${sha}  participant-submission.json\n`);

  writeFileSync(path.join(outDir, "environment-version.json"), JSON.stringify({
    environmentId: submission.environmentId,
    fixtureVersion: evidence.fixtureVersion,
    productVersion: PRODUCT_VERSION,
    inputContractVersion: CONTRACT_VERSION,
    packagedAt: new Date().toISOString(),
  }, null, 2) + "\n");

  const dc = evidence.domainCompatibility ?? {};
  const stage = (s) => s ? `블로킹 ${s.blockingErrorCount} · 경고 ${s.warningCount} (규칙 ${s.rules.length})` : "평가 안 함";

  writeFileSync(path.join(outDir, "validation-report.md"), `# 제출 검증 보고서 — ${team}

| 항목 | 값 |
| --- | --- |
| 팀 ID | \`${team}\` |
| 환경 | \`${submission.environmentId}\` |
| 제출 시각 | \`${new Date().toISOString()}\` |
| productVersion | \`${PRODUCT_VERSION}\` |
| inputContractVersion | \`${CONTRACT_VERSION}\` |
| submission SHA-256 | \`${sha}\` |
| Evidence runId | \`${evidence.runId}\` |

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| 계약 검증 | ${validation.valid ? "PASS" : "FAIL"} |
| 경고 | ${(validation.warnings ?? []).length}건 |
| Stage A 후보 호환성 | ${stage(dc.candidate)} |
| Stage B 실행 선택 호환성 | ${stage(dc.executionChoice)} |
| 검토 경계 도달 | ${evidence.boundaryReached} |
| 필수 verifier 실행 | ${evidence.requiredVerifierExecuted} |
| actualDeviceCommandSent | ${evidence.actualDeviceCommandSent} |
| 계획된 결제 Action | ${evidence.plannedPaymentActionCount} |
| stopType | \`${evidence.stopType}\` |
| **SIMULATION 결과** | **${evidence.result}** |
| resultScope | \`${evidence.resultScope}\` |

${(validation.warnings ?? []).length > 0 ? `## 경고\n\n${validation.warnings.map((w) => `- \`${w.code}\` ${w.path}: ${w.message}`).join("\n")}\n` : ""}
## 이 결과가 뜻하는 것

\`SIMULATION PASS\` 는 계약·안전·상태 전환 검증을 통과했다는 뜻입니다.
추천 품질, 접근성 UX, 창의성은 별도 심사에서 평가합니다.

공식 판정은 운영진이 깨끗한 v${PRODUCT_VERSION} 패키지에서
\`participant-submission.json\` 을 재실행한 결과입니다.
`);

  const uxSrc = path.join(ROOT, "workspace", team, "participant-ux.json");
  if (existsSync(uxSrc)) {
    cpSync(uxSrc, path.join(outDir, "participant-ux.json"));
  } else {
    const tpl = path.join(ROOT, "participant-workspace", "participant-ux.template.json");
    if (existsSync(tpl)) {
      const doc = JSON.parse(readFileSync(tpl, "utf-8"));
      delete doc._note;
      doc._warning = "참가팀이 작성하지 않아 템플릿 기본값이 들어갔습니다. 사실대로 고쳐주세요.";
      writeFileSync(path.join(outDir, "participant-ux.json"), JSON.stringify(doc, null, 2) + "\n");
    }
  }

  writeFileSync(path.join(outDir, "MANUAL_REVIEW_CHECKLIST.md"), `# 사람이 확인하는 항목 — ${team}

기계가 판정할 수 없는 항목입니다. 심사위원이 직접 확인합니다.
팀에서 먼저 채워 두면 심사가 빨라집니다.

| 확인 | 팀 확인 | 심사 |
| --- | --- | --- |
| 로그인 없이 핵심 흐름을 쓸 수 있다 | ☐ | ☐ |
| 키보드만으로 전체 흐름이 가능하다 | ☐ | ☐ |
| 큰 글씨 모드가 동작한다 | ☐ | ☐ |
| 고대비 모드가 동작한다 | ☐ | ☐ |
| 화면 확대 200% 에서 쓸 수 있다 | ☐ | ☐ |
| 색상 없이도 상태를 알 수 있다 | ☐ | ☐ |
| 추천 이유가 일반 사용자에게 이해된다 | ☐ | ☐ |
| 대안을 볼 수 있다 | ☐ | ☐ |
| 추천을 거절할 수 있다 | ☐ | ☐ |
| 조건을 다시 입력할 수 있다 | ☐ | ☐ |
| 사용자 확인 전에 실행하지 않는다 | ☐ | ☐ |
| 외부 API 가 죽어도 쓸 수 있다 | ☐ | ☐ |
| 저장 정보가 최소한이다 | ☐ | ☐ |
| 저장 정보를 지울 수 있다 | ☐ | ☐ |
| 실제 개인정보를 받지 않는다 | ☐ | ☐ |
| 데모 영상이 위 항목을 보여준다 | ☐ | ☐ |

## 팀 메모

(자동 검사로 확인할 수 없지만 심사위원이 알아야 할 것을 적으세요)

---

자동 검사 결과는 \`validation-report.md\` 를, 팀의 UX 선언은 \`participant-ux.json\` 을 보세요.
`);

  writeFileSync(path.join(outDir, "README.md"), `# ${team} 최종 제출

아래 내용을 채운 뒤 이 폴더를 그대로 제출하세요.

| 항목 | 내용 |
| --- | --- |
| 팀명 | (채우세요) |
| 환경 | \`${submission.environmentId}\` |
| 서비스 한 줄 소개 | (채우세요) |
| 사용자 정보 수집 방식 | (채우세요 — 웹/음성/QR/보호자 등) |
| 추천 방식 요약 | (채우세요) |
| 접근성 고려사항 | (채우세요) |
| 실행 방법 | (채우세요) |
| 알려진 제한사항 | (채우세요) |
| Submission SHA-256 | \`${sha}\` |

## 포함 파일

| 파일 | 설명 |
| --- | --- |
| \`participant-submission.json\` | 공식 재실행 대상 |
| \`simulation-evidence.json\` | 이 팀 환경에서의 실행 증거 |
| \`submission.sha256\` | 무결성 확인 |
| \`validation-report.md\` | 검증 요약 |
| \`environment-version.json\` | 환경·버전 기록 |
| \`participant-ux.json\` | 팀의 사용자 접점 선언 |
| \`MANUAL_REVIEW_CHECKLIST.md\` | 사람이 확인하는 항목 |
| \`demo-video.mp4\` | (선택) 시연 영상 |
`);

  console.log("");
  pass(`submission-output/${team}/ 생성`);
  for (const f of readdirSync(outDir)) console.log(`       ${f}`);
  console.log("");
  console.log(`SHA-256: ${C.ok}${sha}${C.off}`);
  console.log(`${C.dim}README.md 의 빈칸을 채운 뒤 폴더를 제출하세요.${C.off}`);
  return 0;
}

/* ─────────────────────────── reset-sandbox ─────────────────────────── */

async function resetSandbox() {
  head("KioBridge participant:reset-sandbox");
  try {
    const s = await fetchJson(`${API}/api/v1/sessions`, { method: "POST", body: JSON.stringify({ environmentId: "sandbox" }) });
    pass(`새 Sandbox 세션 ${s.sessionId}`, s.submissionStatus);
    console.log(`${C.dim}브라우저에서 ${WEB} 를 새로고침하세요.${C.off}`);
    return 0;
  } catch (err) {
    fail(`API 호출 실패: ${err.message}`, "npm run dev 로 서버를 켜세요");
    return 1;
  }
}

/* ─────────────────────────── main ─────────────────────────── */

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

const COMMANDS = {
  doctor, demo, init, progress, validate, package: packageSubmission, "reset-sandbox": resetSandbox,
};

const run = COMMANDS[command];
if (!run) {
  console.error(`알 수 없는 명령: ${command ?? "(없음)"}`);
  console.error("사용 가능: " + Object.keys(COMMANDS).join(" · "));
  process.exit(2);
}
Promise.resolve(run(args)).then((code) => process.exit(code ?? 0)).catch((err) => {
  console.error(`${C.bad}[ERROR]${C.off} ${err.message ?? err}`);
  process.exit(1);
});
