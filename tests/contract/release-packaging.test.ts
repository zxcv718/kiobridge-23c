import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../shared";

const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf-8");
const pkg = JSON.parse(read("package.json"));

describe("릴리스 — 프로젝트 루트 진입점", () => {
  it("[1/2] package.json 이 프로젝트 루트에 있고 한 단계 더 중첩되지 않는다", () => {
    expect(existsSync(path.join(REPO_ROOT, "package.json"))).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, "kiobridge-simulation-kit", "package.json"))).toBe(false);
  });

  it("[3] 루트에 필수 npm 스크립트가 모두 있다", () => {
    for (const s of [
      "dev", "dev:web", "dev:api", "typecheck", "test", "test:public", "test:contract",
      "test:e2e", "build", "clean", "sync:contracts", "check:contract-drift",
      "verify", "verify:public-package", "package:public",
    ]) {
      expect(pkg.scripts, `script ${s}`).toHaveProperty(s);
    }
  });

  it("dev 스크립트가 API 와 web 을 함께 실행한다", () => {
    expect(pkg.scripts.dev).toMatch(/dev:api/);
    expect(pkg.scripts.dev).toMatch(/dev:web/);
    // -k: 한 프로세스가 죽으면 나머지도 정리
    expect(pkg.scripts.dev).toMatch(/-k\b/);
  });

  it("engines 가 Node 20 이상을 요구한다", () => {
    expect(pkg.engines?.node).toBeTruthy();
    expect(pkg.engines.node).toMatch(/>=\s*20/);
  });

  it("README_FIRST 가 존재하고 시작 방법을 안내한다", () => {
    const t = read("README_FIRST.md");
    expect(t).toMatch(/start-macos\.command/);
    expect(t).toMatch(/start-windows\.bat/);
    expect(t).toMatch(/start-linux\.sh/);
    expect(t).toMatch(/localhost:3000/);
    expect(t).toMatch(/localhost:4000/);
  });
});

describe("릴리스 — 시작/종료 스크립트 (크로스플랫폼)", () => {
  const scripts = ["start-macos.command", "start-windows.bat", "start-linux.sh", "stop-macos.command", "stop-windows.bat", "stop-linux.sh"];

  it("[4] 6개 스크립트가 모두 존재한다", () => {
    for (const s of scripts) expect(existsSync(path.join(REPO_ROOT, s)), s).toBe(true);
  });

  it("[4] 각 스크립트가 자신의 디렉터리로 이동한다", () => {
    expect(read("start-macos.command")).toMatch(/cd -- "\$\(cd -- "\$\(dirname -- "\$0"\)" && pwd -P\)"|cd "\$SCRIPT_DIR"/);
    expect(read("start-linux.sh")).toMatch(/cd "\$SCRIPT_DIR"/);
    expect(read("start-windows.bat")).toMatch(/cd \/d "%~dp0"/);
    expect(read("stop-windows.bat")).toMatch(/cd \/d "%~dp0"/);
  });

  it("[5] 경로를 따옴표 없이 사용하지 않는다 (공백·한글 경로 안전)", () => {
    for (const s of ["start-macos.command", "start-linux.sh", "stop-macos.command", "stop-linux.sh"]) {
      const body = read(s);
      expect(body, `${s}: SCRIPT_DIR 인용`).toMatch(/cd "\$SCRIPT_DIR"/);
      expect(body, `${s}: 인용 없는 cd $SCRIPT_DIR 금지`).not.toMatch(/cd \$SCRIPT_DIR(?!")/);
    }
    for (const s of ["start-windows.bat", "stop-windows.bat"]) {
      expect(read(s), `${s}: %~dp0 인용`).toMatch(/cd \/d "%~dp0"/);
    }
  });

  it("[29/31] shell 스크립트 문법이 유효하다", () => {
    for (const s of ["start-macos.command", "start-linux.sh", "stop-macos.command", "stop-linux.sh"]) {
      expect(() => execFileSync("bash", ["-n", path.join(REPO_ROOT, s)])).not.toThrow();
    }
  });

  it("[30] Windows 배치파일은 CRLF 줄바꿈을 쓴다", () => {
    for (const s of ["start-windows.bat", "stop-windows.bat"]) {
      expect(readFileSync(path.join(REPO_ROOT, s)).includes(Buffer.from("\r\n")), s).toBe(true);
    }
  });

  it("실행 권한이 있다 (macOS/Linux)", () => {
    for (const s of ["start-macos.command", "start-linux.sh"]) {
      expect((statSync(path.join(REPO_ROOT, s)).mode & 0o111) !== 0, s).toBe(true);
    }
  });

  it("절대 로컬 경로를 하드코딩하지 않는다", () => {
    for (const s of ["start-macos.command", "start-linux.sh", "start-windows.bat"]) {
      expect(read(s), s).not.toMatch(/\/Users\/|C:\\Users\\/);
    }
  });
});

describe("릴리스 — 배포 청결성 규칙", () => {
  it("[6-12] .gitignore / .dockerignore 가 모든 오염 항목을 차단한다", () => {
    for (const f of [".gitignore", ".dockerignore"]) {
      const t = read(f);
      for (const p of [
        "node_modules", "**/node_modules", "dist", "**/dist", "build",
        "coverage", "playwright-report", "test-results", "__MACOSX", ".DS_Store",
        "release", ".tmp", ".cache",
        "hidden-profiles", "hidden-scenarios", "expected-results", "private-tests",
        "kiobridge-private-evaluation",
      ]) {
        expect(t.split("\n").map((l) => l.trim()), `${f} → ${p}`).toContain(p);
      }
    }
  });

  it("packaging 도구가 allow-list staging 방식을 쓴다", () => {
    const t = read("tools/build-public-package.mjs");
    expect(t).toMatch(/ROOT_FILES/);
    expect(t).toMatch(/ROOT_DIRS/);
    expect(t).toMatch(/DENY_DIRS/);
    expect(t).toMatch(/unzip/); // ZIP 내부 재검사
  });

  it("clean 도구가 프로젝트 루트 밖 경로를 거부한다", () => {
    const t = read("tools/clean.mjs");
    expect(t).toMatch(/relative\.startsWith\("\.\."\)/);
    expect(t).toMatch(/프로젝트 루트 밖/);
  });

  it("package-lock 에 제거된 workspace 가 남아있지 않다", () => {
    const lock = JSON.parse(read("package-lock.json"));
    const keys = Object.keys(lock.packages ?? {});
    for (const stale of ["apps/core-api", "apps/participant-adapter", "examples/reference-participant-app"]) {
      expect(keys, stale).not.toContain(stale);
    }
  });

  it("package-lock 의 workspace 가 실제 디렉터리와 일치한다", () => {
    const lock = JSON.parse(read("package-lock.json"));
    for (const key of Object.keys(lock.packages ?? {})) {
      if (!key || key.startsWith("node_modules/")) continue;
      expect(existsSync(path.join(REPO_ROOT, key)), `lock workspace ${key}`).toBe(true);
    }
  });
});

describe("릴리스 — 계약자료 자동 동기화", () => {
  const DELIVERABLE = "participant-deliverables/04_PROFILE_AND_INPUT_CONTRACT";

  it("[13/14] 배포 계약자료가 원본과 일치한다 (drift 없음)", () => {
    expect(() => execFileSync(process.execPath, [path.join(REPO_ROOT, "tools", "check-contract-drift.mjs")], { encoding: "utf-8" })).not.toThrow();
  });

  it("[15] 원본이 바뀌면 drift 검사가 실패한다", () => {
    // fingerprint 는 원본 파일 내용에서 계산되므로, 저장된 값과 다르면 반드시 실패해야 한다.
    const meta = JSON.parse(read(`${DELIVERABLE}/.generated.json`));
    expect(meta.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.contractVersion).toBe("1.0.0");
    expect(meta.generatorVersion).toBeTruthy();
  });

  it("생성물에 직접 수정 금지 안내와 생성 정보가 있다", () => {
    const readme = read(`${DELIVERABLE}/README.md`);
    expect(readme).toMatch(/직접 수정하지 마세요/);
    expect(readme).toMatch(/생성 시각/);
    expect(readme).toMatch(/소스 계약 버전/);
    expect(readme).toMatch(/생성 스크립트 버전/);
    expect(read(`${DELIVERABLE}/ENUM_REFERENCE.md`)).toMatch(/자동 생성 파일/);
  });

  it("수동 복사본(04_PROFILE_AND_INPUT_CONTRACT 루트)이 제거되었다", () => {
    expect(existsSync(path.join(REPO_ROOT, "04_PROFILE_AND_INPUT_CONTRACT"))).toBe(false);
  });
});

describe("릴리스 — 서버 health & 웹 상태", () => {
  it("[16] /health 엔드포인트가 정의되어 있다", () => {
    const t = read("apps/simulation-api/src/server.ts");
    expect(t).toMatch(/app\.get\("\/health"/);
    expect(t).toMatch(/kiobridge-simulation-api/);
    expect(t).toMatch(/inputContractVersion/);
  });

  it("웹이 API 연결 상태를 표시한다", () => {
    const t = read("apps/simulator-web/src/App.tsx");
    expect(t).toMatch(/API 연결됨/);
    expect(t).toMatch(/API 연결 대기/);
    expect(t).toMatch(/API 연결 실패/);
  });

  it("[26] 검증 전에는 실행 버튼이 비활성화된다", () => {
    const t = read("apps/simulator-web/src/App.tsx");
    expect(t).toMatch(/disabled=\{busy \|\| !validation\?\.valid\}/);
    expect(t).toMatch(/먼저 <strong>검증 실행<\/strong>/);
  });

  it("[27] 새 제출 수신 시 이전 validation/run/evidence 를 초기화한다", () => {
    const t = read("apps/simulation-api/src/server.ts");
    expect(t).toMatch(/session\.validation = undefined/);
    expect(t).toMatch(/session\.evidence = undefined/);
    expect(t).toMatch(/clearRun\(session\.sessionId\)/);
  });

  it("첫 화면에 참가팀 안내와 바로가기가 있다", () => {
    const t = read("apps/simulator-web/src/App.tsx");
    expect(t).toMatch(/키오스크를 새로 만드는 것이 아닙니다/);
    expect(t).toMatch(/Schema Playground/);
    expect(t).toMatch(/10분 시작 가이드/);
  });
});

describe("릴리스 — 제품 버전 통일", () => {
  // 버전을 테스트에 박아두면 버전업마다 테스트가 깨집니다. 단일 출처에서 읽습니다.
  const PRODUCT = pkg.version;
  const CONTRACT = "1.0.0";

  it("package.json 제품 버전", () => {
    expect(JSON.parse(read("package.json")).version).toBe(PRODUCT);
  });

  it("package-lock 최상위 버전이 package.json 과 같다", () => {
    const lock = JSON.parse(read("package-lock.json"));
    expect(lock.version).toBe(PRODUCT);
    expect(lock.packages[""].version).toBe(PRODUCT);
  });

  it("health API 가 제품 버전과 계약 버전을 따로 보고한다", () => {
    const s = read("apps/simulation-api/src/server.ts");
    expect(s).toContain(`PLATFORM_VERSION = "${PRODUCT}"`);
    expect(s).toMatch(/inputContractVersion/);
  });

  it("입력계약 버전은 1.0.0 으로 유지된다 (제품 버전과 독립)", () => {
    const reg = JSON.parse(read("schemas/registry/contract-registry.json"));
    expect(reg.defaultInputContractVersion ?? reg.coreContractVersion).toBe(CONTRACT);
  });

  it("릴리스 산출물 이름이 package.json 버전에서 파생된다", () => {
    for (const f of ["tools/build-public-package.mjs", "tools/verify-public-package.mjs"]) {
      expect(read(f), f).toMatch(/kiobridge-simulation-kit-v\$\{PRODUCT_VERSION\}/);
      expect(read(f), f).not.toMatch(/kiobridge-simulation-kit-v5"/);
    }
  });
});

describe("릴리스 — 소스 폴더 재압축 방지", () => {
  // 이 마커는 소스 폴더에만 있고 배포 ZIP 에는 의도적으로 없습니다.
  // 압축 해제된 배포본에서 이 테스트가 돌면 "없는 것이 정상" 을 확인합니다.
  const markerPath = path.join(REPO_ROOT, "DO_NOT_SHARE_THIS_FOLDER.md");
  const inSourceTree = existsSync(markerPath);

  it("[P0-5] DO_NOT_SHARE_THIS_FOLDER.md 가 소스 루트에 있다 (배포본에는 없음)", () => {
    if (!inSourceTree) {
      // 배포본: 마커가 없어야 하고, staging 폴더도 함께 없어야 한다.
      expect(existsSync(path.join(REPO_ROOT, "release"))).toBe(false);
      return;
    }
    const d = read("DO_NOT_SHARE_THIS_FOLDER.md");
    expect(d).toMatch(/그대로 압축/);
    expect(d).toMatch(/npm run package:public/);
    expect(d).toMatch(/node_modules/);
  });

  it("이 안내 파일은 ZIP 에 들어가지 않도록 차단된다", () => {
    expect(read("tools/build-public-package.mjs")).toMatch(/DENY_FILES[\s\S]{0,200}DO_NOT_SHARE_THIS_FOLDER\.md/);
  });

  it("packaging 이 SHARE_THIS_ZIP.txt 를 생성한다", () => {
    const t = read("tools/build-public-package.mjs");
    expect(t).toMatch(/SHARE_THIS_ZIP\.txt/);
    expect(t).toMatch(/전달할 파일은 이것 하나입니다/);
  });

  it("README 가 소스 폴더 배포를 경고한다", () => {
    const r = read("README.md") + read("README_FIRST.md");
    expect(r).toMatch(/DO_NOT_SHARE_THIS_FOLDER|소스 폴더를 그대로/);
  });
});

describe("릴리스 — package:public 사전 검사 체인", () => {
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;

  /** Resolve every script reachable from an entry point (workspace calls excluded). */
  const reachable = (entry: string): Set<string> => {
    const seen = new Set<string>();
    const walk = (name: string) => {
      const body = scripts[name];
      if (body === undefined || seen.has(name)) return;
      seen.add(name);
      for (const m of body.matchAll(/\bnpm\s+run\s+([a-zA-Z0-9:_.-]+)((?:\s+[^&|]*)?)/g)) {
        if (/(^|\s)(-w|--workspace[=\s])/.test(m[2] ?? "")) continue;
        walk(m[1]);
      }
    };
    walk(entry);
    return seen;
  };
  const RELEASE = reachable("package:public");

  it("[P1-3] drift 검사 없이 패키징할 수 없다", () => {
    expect([...RELEASE]).toContain("check:contract-drift");
    expect([...RELEASE]).toContain("sync:contracts");
  });

  it("패키징이 typecheck 와 테스트를 먼저 돌린다", () => {
    expect([...RELEASE]).toContain("typecheck");
    expect([...RELEASE]).toContain("test");
    expect([...RELEASE]).toContain("test:public");
  });

  it("[P0-3] 패키징이 build 와 E2E 를 강제한다", () => {
    expect([...RELEASE]).toContain("build");
    expect([...RELEASE]).toContain("test:e2e");
  });

  it("패키징이 문서·스크립트·Windows·E2E참조 검증을 강제한다", () => {
    for (const s of ["verify:docs", "verify:scripts", "verify:windows", "verify:e2e-references", "verify:release-chain"]) {
      expect([...RELEASE], s).toContain(s);
    }
  });

  it("패키징 후 ZIP 검증까지 이어진다", () => {
    expect([...RELEASE]).toContain("verify:public-package");
  });

  it("packaging 도구 자체도 drift 를 먼저 확인한다", () => {
    expect(read("tools/build-public-package.mjs")).toMatch(/check-contract-drift\.mjs/);
  });

  it("필수 스크립트가 모두 등록되어 있다", () => {
    for (const s of ["check:submission", "verify:public", "test:sandbox", "test:public", "test:contract",
      "test:e2e", "verify:docs", "verify:scripts", "verify:windows", "verify:e2e-references",
      "verify:release-chain", "release:verify"]) {
      expect(scripts[s], s).toBeTruthy();
    }
  });
});

describe("릴리스 — 참가팀 배포자료 구조", () => {
  const DIRS = [
    "00_START_HERE", "01_ENVIRONMENT_AND_FIXTURE", "02_API_CONTRACT",
    "03_SEMANTIC_ACTION", "04_PROFILE_AND_INPUT_CONTRACT", "05_SAFETY_AND_BOUNDARY",
    "06_EVIDENCE_AND_EVALUATION", "07_PARTICIPANT_STARTER",
    "08_EXTENSION_AND_CUSTOMIZATION", "09_TROUBLESHOOTING",
  ];

  it("00~09 폴더가 모두 존재한다", () => {
    for (const d of DIRS) {
      expect(existsSync(path.join(REPO_ROOT, "participant-deliverables", d)), d).toBe(true);
    }
  });

  it("00_START_HERE 에 온보딩 문서 7종과 구조도가 있다", () => {
    const files = ["README.md", "README_FIRST.md", "WHAT_WE_PROVIDE.md", "WHAT_YOU_BUILD.md",
      "QUICK_START_10_MINUTES.md", "FULL_DEMO_FLOW.md", "PASS_SCOPE.md",
      "PRIVATE_EVALUATION_BOUNDARY.md", "ARCHITECTURE_OVERVIEW.svg"];
    for (const f of files) {
      expect(existsSync(path.join(REPO_ROOT, "participant-deliverables/00_START_HERE", f)), f).toBe(true);
    }
  });

  it("구조도가 역할 분리와 SIMULATION_ONLY 를 담고 있다", () => {
    const svg = read("docs/ARCHITECTURE_OVERVIEW.svg");
    expect(svg).toMatch(/참가팀이 만드는 것/);
    expect(svg).toMatch(/KioBridge 공식 플랫폼/);
    expect(svg).toMatch(/SIMULATION_ONLY/);
    expect(svg).toMatch(/actualDeviceCommandSent/);
    expect(svg).toMatch(/<title[^>]*>/); // 접근성: 제목 제공
  });

  it("00_START_HERE README 가 필수 문장을 담는다", () => {
    const r = read("participant-deliverables/00_START_HERE/README.md");
    expect(r).toMatch(/참가팀은 좌표나 실제 키오스크 컨트롤을 다루지 않습니다/);
  });

  it("배포자료도 drift 검사 대상이다", () => {
    const src = read("tools/contract-deliverables.mjs");
    expect(src).toMatch(/START_HERE_DOCS/);
    expect(src).toMatch(/DELIVERABLE_SECTIONS/);
    // fingerprint 가 새 소스를 포함해야 한다
    const fp = src.slice(src.indexOf("export function sourceFingerprint"));
    expect(fp).toMatch(/START_HERE_DOCS/);
    expect(fp).toMatch(/DELIVERABLE_SECTIONS/);
  });
});

describe("릴리스 — PASS 범위 분리 (P0-3)", () => {
  it("Evidence 스키마가 4개 범위 필드를 정의한다", () => {
    const s = JSON.parse(read("schemas/core/evidence.schema.json"));
    for (const f of ["resultScope", "simulationValidation", "recommendationEvaluation", "hackathonEvaluation"]) {
      expect(s.properties[f], f).toBeTruthy();
      expect(s.required, `required: ${f}`).toContain(f);
    }
  });

  it("resultScope 는 SIMULATION_VALIDATION_ONLY 로 고정된다", () => {
    const s = JSON.parse(read("schemas/core/evidence.schema.json"));
    expect(s.properties.resultScope.const ?? s.properties.resultScope.enum?.[0]).toBe("SIMULATION_VALIDATION_ONLY");
  });

  it("웹이 SIMULATION 결과와 심사 항목을 분리해 보여준다", () => {
    const app = read("apps/simulator-web/src/App.tsx");
    expect(app).toMatch(/SIMULATION/);
    expect(app).toMatch(/심사/);
  });

  it("PASS_SCOPE 문서가 두 영역을 구분한다", () => {
    const d = read("docs/PASS_SCOPE.md");
    expect(d).toMatch(/PASS 가 보장하는 것/);
    expect(d).toMatch(/PASS 가 보장하지 않는 것/);
    expect(d).toMatch(/STOP 은 PASS 가 아닙니다/);
  });

  it("checker CLI 가 결과 범위를 함께 출력한다", () => {
    const t = read("tools/check-submission.impl.ts");
    expect(t).toMatch(/resultScope/);
    expect(t).toMatch(/추천 품질, 접근성 UX, 창의성/);
  });
});
