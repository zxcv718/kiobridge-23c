import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../shared";

const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf-8");
const raw = (rel: string) => readFileSync(path.join(REPO_ROOT, rel));
const pkg = JSON.parse(read("package.json"));
const runTool = (tool: string) =>
  execFileSync(process.execPath, [path.join(REPO_ROOT, "tools", tool)], { encoding: "utf-8", stdio: "pipe" });

/* ────────────────────────── Windows Batch (1–8) ────────────────────────── */

describe("Windows Batch — CMD 문법 정적 검증", () => {
  const BATS = ["start-windows.bat", "stop-windows.bat"];
  // Assembled at runtime so this test file never matches its own rule.
  const DEV_NULL = ["/dev", "/null"].join("");

  it("[1/2] 두 배치파일 모두 Unix 리다이렉션을 쓰지 않는다", () => {
    for (const f of BATS) expect(read(f), f).not.toContain(DEV_NULL);
  });

  it('[3] 두 파일 모두 cd /d "%~dp0" 로 자기 폴더로 이동한다', () => {
    for (const f of BATS) expect(read(f), f).toMatch(/cd \/d "%~dp0"/);
  });

  it("[4] >nul 리다이렉션을 쓴다", () => {
    for (const f of BATS) expect(read(f), f).toMatch(/>nul\b/i);
  });

  it("[5] for /f 외부 명령이 작은따옴표로 감싸여 있다", () => {
    for (const f of BATS) {
      for (const line of read(f).split(/\r?\n/)) {
        const m = line.match(/for\s+\/f\s+[^(]*\(\s*([^)]*)\)/i);
        if (!m) continue;
        expect(m[1].trim().startsWith("'"), `${f}: ${line.trim()}`).toBe(true);
      }
    }
  });

  it("[6] CRLF 줄바꿈이고 BOM 이 없다", () => {
    for (const f of BATS) {
      const buf = raw(f);
      expect(buf.includes(Buffer.from("\r\n")), `${f}: CRLF`).toBe(true);
      const text = buf.toString("utf-8");
      const lfOnly = text.split("\n").length - text.split("\r\n").length;
      expect(lfOnly, `${f}: LF 전용 줄`).toBe(0);
      expect(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, `${f}: BOM`).toBe(false);
    }
  });

  it("[7] package root 기준으로 실행한다 (package.json 확인 + tools 상대경로)", () => {
    for (const f of BATS) {
      expect(read(f), f).toMatch(/if not exist "package\.json"/i);
      expect(read(f), f).toMatch(/tools\\[a-z-]+\.mjs/i);
      expect(read(f), f).not.toMatch(/[A-Z]:\\Users\\/);
    }
  });

  it("[8] npm 은 call 로 실행한다 (배치 흐름 유지)", () => {
    const start = read("start-windows.bat");
    expect(start).toMatch(/call npm ci/);
    for (const f of BATS) {
      for (const line of read(f).split(/\r?\n/)) {
        expect(/^\s*(npm|npx)\s/i.test(line), `${f}: ${line.trim()}`).toBe(false);
      }
    }
  });

  it("검증기가 통과하고, 위반 사례는 실제로 잡아낸다", () => {
    expect(() => runTool("verify-windows-scripts.mjs")).not.toThrow();
    expect(runTool("verify-windows-scripts.mjs")).toMatch(/WINDOWS_STATIC_VALIDATION/);
    // 정적 검사임을 결과에 명시해야 한다 (런타임 통과로 오인 금지).
    expect(runTool("verify-windows-scripts.mjs")).toMatch(/실제 Windows 실행을 보장하지 않습니다/);
  });
});

/* ────────────────────────── E2E 참조 (9–13) ────────────────────────── */

describe("E2E — Sandbox 전용 참조", () => {
  const E2E_DIR = path.join(REPO_ROOT, "tests", "e2e");
  const specs = readdirSync(E2E_DIR).filter((f) => f.endsWith(".ts"));
  const code = specs.map((f) => read(`tests/e2e/${f}`)).join("\n");
  /** Comment lines may name the evaluated envs in prose. */
  const codeOnly = code.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

  it("[9] 공식 환경 완성 submission 을 참조하지 않는다", () => {
    for (const env of ["chicken-store", "hospital", "public-office"]) {
      expect(codeOnly, env).not.toContain(`${env}.json`);
    }
  });

  it("[10] Sandbox 완성 예제 파일이 존재한다", () => {
    expect(existsSync(path.join(REPO_ROOT, "examples/submission-format-example/sandbox.json"))).toBe(true);
  });

  it("[11] E2E 가 참조하는 로컬 파일이 모두 존재한다", () => {
    expect(() => runTool("verify-e2e-references.mjs")).not.toThrow();
  });

  it("[12] 삭제된 예제 경로를 참조하지 않는다", () => {
    const dir = path.join(REPO_ROOT, "examples", "submission-format-example");
    expect(readdirSync(dir).filter((f) => f.endsWith(".json"))).toEqual(["sandbox.json"]);
  });

  it("[13] Sandbox 환경에서만 테스트한다", () => {
    expect(codeOnly).toMatch(/Sandbox/);
    expect(specs.length).toBeGreaterThan(0);
  });

  it("5개 시나리오가 모두 정의되어 있다", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(code, `시나리오 ${n}`).toMatch(new RegExp(`시나리오 ${n} —`));
  });

  it("playwright.config 이 공식 포트와 실패시 진단 설정을 갖는다", () => {
    const cfg = read("playwright.config.ts");
    expect(cfg).toMatch(/127\.0\.0\.1:3000/);
    expect(cfg).toMatch(/screenshot: "only-on-failure"/);
    expect(cfg).toMatch(/trace: "retain-on-failure"/);
    expect(cfg).toMatch(/reuseExistingServer: !CI/);
    expect(cfg).toMatch(/webServer/);
  });
});

/* ────────────────────────── 릴리스 체인 (14–20) ────────────────────────── */

describe("릴리스 체인 — 호출 그래프", () => {
  const scripts: Record<string, string> = pkg.scripts;
  const reachable = (entry: string) => {
    const seen = new Set<string>();
    (function walk(name: string) {
      const body = scripts[name];
      if (body === undefined || seen.has(name)) return;
      seen.add(name);
      for (const m of body.matchAll(/\bnpm\s+run\s+([a-zA-Z0-9:_.-]+)((?:\s+[^&|]*)?)/g)) {
        if (/(^|\s)(-w|--workspace[=\s])/.test(m[2] ?? "")) continue;
        walk(m[1]);
      }
    })(entry);
    return seen;
  };
  const RELEASE = reachable("package:public");

  it("[14] package:public 이 release:verify 를 호출한다", () => {
    expect(scripts["package:public"]).toMatch(/npm run release:verify/);
  });

  for (const [n, step] of [[15, "typecheck"], [16, "test"], [17, "test:public"], [18, "build"], [19, "test:e2e"]] as const) {
    it(`[${n}] release:verify 가 ${step} 을 포함한다`, () => {
      expect([...reachable("release:verify")]).toContain(step);
    });
  }

  it("[20] package:public 이 ZIP 검증기를 포함한다", () => {
    expect([...RELEASE]).toContain("verify:public-package");
    expect(scripts["verify:public-package"]).toMatch(/verify-public-package\.mjs/);
  });

  it("build-public-package 가 체인 안에서 실행된다", () => {
    const bodies = [...RELEASE].map((n) => scripts[n]).join("\n");
    expect(bodies).toMatch(/tools\/build-public-package\.mjs/);
  });

  it("체인의 어떤 단계도 실패를 삼키지 않는다 (|| 나 ; 없음)", () => {
    for (const name of RELEASE) {
      expect(scripts[name], `${name}: ||`).not.toMatch(/(^|[^|&])\|\|(?!\|)/);
      expect(scripts[name], `${name}: ;`).not.toMatch(/;\s*npm\s+run/);
    }
  });

  it("검증기가 통과한다", () => {
    expect(() => runTool("verify-release-chain.mjs")).not.toThrow();
  });

  it("필수 단계를 빼면 검증기가 실패한다", () => {
    // release:verify 에서 test:e2e 를 제거한 사본으로 검사한다.
    const tmp = path.join(REPO_ROOT, "release", ".chain-negative");
    execFileSync("rm", ["-rf", tmp]);
    execFileSync("mkdir", ["-p", tmp]);
    const broken = JSON.parse(JSON.stringify(pkg));
    broken.scripts["release:verify"] = broken.scripts["release:verify"].replace(" && npm run test:e2e", "");
    execFileSync("cp", ["/dev/null", path.join(tmp, "package.json")]);
    require("node:fs").writeFileSync(path.join(tmp, "package.json"), JSON.stringify(broken, null, 2));
    let failed = false;
    try {
      execFileSync(process.execPath, [path.join(REPO_ROOT, "tools", "verify-release-chain.mjs"), tmp], { encoding: "utf-8", stdio: "pipe" });
    } catch (err) {
      failed = true;
      expect(String((err as { stderr?: Buffer }).stderr ?? "")).toMatch(/RELEASE_CHAIN_MISSING_STEP/);
    }
    execFileSync("rm", ["-rf", tmp]);
    expect(failed, "test:e2e 를 빼도 통과하면 게이트가 아님").toBe(true);
  });
});

/* ────────────────────────── 문서 (21–28) ────────────────────────── */

describe("문서 — 링크와 명령 유효성", () => {
  it("[21] 깨진 Markdown 로컬 링크가 0건이다", () => {
    const out = runTool("verify-doc-links.mjs");
    expect(out).toMatch(/깨진 로컬 링크 0건/);
  });

  it("[22] 존재하지 않는 npm script 를 문서화하지 않는다", () => {
    expect(() => runTool("verify-documented-scripts.mjs")).not.toThrow();
  });

  it("[23/24] 문서의 공식 포트가 Web 3000 · API 4000 이다", () => {
    for (const f of ["README.md", "README_FIRST.md", "docs/QUICK_START_10_MINUTES.md"]) {
      const t = read(f);
      expect(t, `${f}: web`).toMatch(/localhost:3000/);
      expect(t, `${f}: 5173 금지`).not.toMatch(/localhost:5173/);
    }
    expect(read("README_FIRST.md")).toMatch(/localhost:4000/);
  });

  it("[25] E2E 명령이 npm run test:e2e 로 통일되어 있다", () => {
    const docs = ["README.md", "docs/QUICK_START_10_MINUTES.md"].map(read).join("\n");
    expect(docs).toMatch(/npm run test:e2e/);
    expect(docs).not.toMatch(/npm run e2e\b/);
  });

  it("[26] 문서가 가리키는 Sandbox 예제 경로가 유효하다", () => {
    expect(existsSync(path.join(REPO_ROOT, "examples/submission-format-example/sandbox.json"))).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, "examples/public-canonical-input/sandbox"))).toBe(true);
  });

  it("[27] 문서가 가리키는 Schema 경로가 유효하다", () => {
    for (const s of [
      "schemas/core/participant-submission.schema.json",
      "schemas/core/evidence.schema.json",
      "schemas/core/environment-pack.schema.json",
    ]) {
      expect(existsSync(path.join(REPO_ROOT, s)), s).toBe(true);
    }
  });

  it("[28] Participant Starter 경로가 유효하다", () => {
    for (const s of [
      "examples/minimal-participant-client/src/participant.ts",
      "examples/minimal-participant-client/src/index.ts",
      "docs/PASS_SCOPE.md",
      "docs/PRIVATE_EVALUATION_BOUNDARY.md",
    ]) {
      expect(existsSync(path.join(REPO_ROOT, s)), s).toBe(true);
    }
  });

  it("링크 검증기는 깨진 링크를 실제로 잡아낸다", () => {
    const tmp = path.join(REPO_ROOT, "release", ".link-negative");
    execFileSync("rm", ["-rf", tmp]);
    execFileSync("mkdir", ["-p", tmp]);
    require("node:fs").writeFileSync(path.join(tmp, "a.md"), "[없는 파일](./nope.md)\n");
    let failed = false;
    try {
      execFileSync(process.execPath, [path.join(REPO_ROOT, "tools", "verify-doc-links.mjs"), tmp], { encoding: "utf-8", stdio: "pipe" });
    } catch (err) {
      failed = true;
      expect(String((err as { stderr?: Buffer }).stderr ?? "")).toMatch(/BROKEN_LOCAL_LINK/);
    }
    execFileSync("rm", ["-rf", tmp]);
    expect(failed).toBe(true);
  });

  it("생성된 참가팀 문서의 링크도 유효하다 (복사 시 재작성)", () => {
    expect(read("tools/contract-deliverables.mjs")).toMatch(/rewriteRelativeLinks/);
    expect(read("tools/sync-contract-deliverables.mjs")).toMatch(/rewriteRelativeLinks/);
    // 복사본이 원본 상대경로를 그대로 쓰지 않는지 표본 확인
    const copied = read("participant-deliverables/02_API_CONTRACT/API_CONTRACT.md");
    expect(copied).not.toMatch(/\]\(\.\.\/schemas\/core\//);
  });
});

/* ────────────────────────── 버전 통일 ────────────────────────── */

describe("버전 — 제품 package.json / 계약 1.0.0", () => {
  it("Dockerfile 이 제품 버전과 계약 버전을 label 로 기록한다", () => {
    const d = read("Dockerfile");
    expect(d).toMatch(new RegExp(`org\\.opencontainers\\.image\\.version="${pkg.version}"`));
    expect(d).toMatch(/io\.kiobridge\.input-contract-version="1\.0\.0"/);
  });

  it("health 응답이 productVersion 과 inputContractVersion 을 분리 보고한다", () => {
    const s = read("apps/simulation-api/src/server.ts");
    expect(s).toMatch(/productVersion: PLATFORM_VERSION/);
    expect(s).toMatch(/inputContractVersion/);
    expect(s).toContain(`PLATFORM_VERSION = "${pkg.version}"`);
  });

  it("start-windows.bat 배너가 제품 버전을 표시한다", () => {
    expect(read("start-windows.bat")).toMatch(new RegExp(`v${pkg.version.replace(/\./g, "\\.")}`));
  });
});

/* ────────────────────────── 새 제출 초기화 (서버 권위) ────────────────────────── */

describe("새 제출 감지 — submissionSeq", () => {
  it("Session 계약에 submissionSeq 가 있다", () => {
    expect(read("packages/contracts/src/index.ts")).toMatch(/submissionSeq: number/);
  });

  it("서버가 제출마다 submissionSeq 를 올리고 이전 결과를 지운다", () => {
    const s = read("apps/simulation-api/src/server.ts");
    expect(s).toMatch(/session\.submissionSeq = \(session\.submissionSeq \?\? 0\) \+ 1/);
    expect(s).toMatch(/session\.validation = undefined/);
    expect(s).toMatch(/session\.evidence = undefined/);
    expect(s).toMatch(/clearRun\(session\.sessionId\)/);
  });

  it("웹이 검토 화면 이후에도 새 제출을 감지해 결과를 초기화한다", () => {
    const app = read("apps/simulator-web/src/App.tsx");
    expect(app).toMatch(/seq > seenSeq/);
    expect(app).toMatch(/setValidation\(null\); setRun\(null\); setEvidence\(null\)/);
    // 예전 버그: step === "session" 일 때만 폴링해서 새 제출을 놓쳤다.
    expect(app).not.toMatch(/if \(step !== "session" \|\| !session\) return;/);
  });
});
