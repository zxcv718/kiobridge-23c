import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT, loadEnvironmentPack, loadExample, processSubmission } from "../shared";
import { buildSandboxSubmission } from "../public/sandbox/sandbox-plan-builder";
import { createSession } from "../../apps/simulation-api/src/store";
import { discoverEnvironmentIds } from "../../apps/simulation-api/src/loader";
import { UprliteDriverContract } from "@kiobridge/uprlite-driver-contract";

const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf-8");
const EVAL_ENVS = ["chicken-store", "hospital", "public-office"];

describe("회귀 — 역할 분리 & 서버 권위", () => {
  it("공식 플랫폼에 추천엔진/어댑터가 없다", () => {
    expect(existsSync(path.join(REPO_ROOT, "apps/participant-adapter"))).toBe(false);
    expect(existsSync(path.join(REPO_ROOT, "apps/core-api"))).toBe(false);
    const s = read("apps/simulation-api/src/server.ts");
    expect(s).not.toMatch(/participant-adapter|localRecommend|localBuildPlan|ADAPTER_URL/);
  });

  it("공식 UI 에 프로필/추천/승인/실행계획 생성기가 없다", () => {
    const app = read("apps/simulator-web/src/App.tsx");
    expect(app).not.toMatch(/ProfileEditor|DomainPreferences|RecommendationView/);
    expect(app).not.toMatch(/추천 받기|이대로 진행하기/);
  });

  it("브라우저는 상태머신/안전엔진/Evidence 를 재계산하지 않는다", () => {
    for (const f of ["apps/simulator-web/src/App.tsx", "apps/simulator-web/src/Kiosk.tsx"]) {
      expect(read(f), f).not.toMatch(/buildEvidence|applyAction|evaluatePlanSafety|runPlan/);
    }
  });

  it("제출이 없으면 세션은 WAITING 을 유지한다", () => {
    const session = createSession(loadEnvironmentPack("chicken-store"));
    expect(session.submissionStatus).toBe("WAITING");
    expect(session.driverId).toBe("SIMULATION");
    expect(session.submission).toBeUndefined();
  });
});

describe("회귀 — Driver 추상화", () => {
  it("sandbox 가 좌표 없이 완전히 실행된다 (공식 환경 계획은 참가팀 몫)", async () => {
    const out = await processSubmission(buildSandboxSubmission(loadEnvironmentPack("sandbox")));
    expect(out.validation.valid, JSON.stringify(out.validation.errors)).toBe(true);
    expect(out.evidence!.result).toBe("PASS");
    expect(out.evidence!.driverId).toBe("SIMULATION");
  });

  it("공식 평가 환경도 좌표 없는 의미 대상만 노출한다", () => {
    for (const id of EVAL_ENVS) {
      const pack = loadEnvironmentPack(id);
      const json = JSON.stringify(pack.screens);
      expect(json, id).not.toMatch(/automationId|coordinate|"x"\s*:|"y"\s*:/);
    }
  });

  it("Evidence 에 사용한 Driver 가 기록된다", async () => {
    const out = await processSubmission(buildSandboxSubmission(loadEnvironmentPack("sandbox")));
    expect(out.evidence!.driverId).toBe("SIMULATION");
    expect(out.evidence!.driverStatus).toBe("READY");
    expect(out.evidence!.actualDeviceCommandSent).toBe(false);
    // The Simulation Driver consumes no captured device data.
    expect(out.evidence!.dataClassification.actualExtractedDataUsed).toBe(false);
  });

  it("UPRLite Driver 는 계약만 존재하며 실제 입력을 실행하지 않는다", async () => {
    const driver = new UprliteDriverContract({
      binding: { driver: "UPRLITE", status: "PENDING_REAL_DEVICE", controls: {} },
      allowActualDeviceCommands: false,
    });
    expect(driver.driverId).toBe("UPRLITE");
    expect(driver.status).toBe("PENDING_REAL_DEVICE");
    await expect(driver.initialize({} as never)).rejects.toThrow(/PENDING_REAL_DEVICE/);
    await expect(driver.execute({} as never, {} as never, {} as never)).rejects.toThrow(/PENDING_REAL_DEVICE/);
  });

  it("드라이버 교체는 공통 계약을 바꾸지 않는다 (동일 실행계획 재사용)", () => {
    // The submitted plan references only semantic ids — nothing driver-specific.
    const sub = buildSandboxSubmission(loadEnvironmentPack("sandbox"));
    const json = JSON.stringify(sub.executionPlan);
    expect(json).not.toMatch(/automationId|coordinate|btn[A-Z]/);
    for (const a of sub.executionPlan.actions) expect(a.target.kind).toBeTruthy();
  });
});

describe("회귀 — 오류 제출 예제 (sandbox)", () => {
  const cases: [string, string[]][] = [
    ["user-not-approved.json", ["ACTIONS_WITHOUT_APPROVAL"]],
    ["payment-action.json", ["FORBIDDEN_ACTION"]],
    ["unknown-candidate.json", ["CANDIDATE_NOT_FOUND"]],
    ["unavailable-candidate.json", ["CANDIDATE_UNAVAILABLE"]],
    ["actual-device-command-true.json", ["SCHEMA_INVALID", "ACTUAL_DEVICE_COMMAND"]],
    ["state-mismatch.json", ["STATE_MISMATCH"]],
    ["incomplete-plan.json", ["BOUNDARY_NOT_REACHED"]],
    ["missing-verifier.json", ["MISSING_VERIFIER"]],
    ["coordinate-or-duplicate-selection.json", ["DUPLICATE_CANDIDATE_SELECTION", "ACTION_AFTER_VERIFIER"]],
  ];
  for (const [file, codes] of cases) {
    it(`${file} → 거부`, async () => {
      const out = await processSubmission(loadExample("invalid", file));
      expect(out.validation.valid, file).toBe(false);
      expect(out.validation.errors.some((e) => codes.includes(e.code)), `${file}: ${JSON.stringify(out.validation.errors.map((e) => e.code))}`).toBe(true);
    });
  }
});

describe("회귀 — Evidence & 결제 3분 계정", () => {
  it("정상 계획만 NORMAL_BOUNDARY_STOP + PASS", async () => {
    const out = await processSubmission(buildSandboxSubmission(loadEnvironmentPack("sandbox")));
    const ev = out.evidence!;
    expect(ev.evidenceVersion).toBe("1.2");
    expect(ev.stopType).toBe("NORMAL_BOUNDARY_STOP");
    expect(ev.result).toBe("PASS");
    expect(ev.submissionHash).toMatch(/^sha-fnv1a-/);
    expect(ev).not.toHaveProperty("mockAdapterUsed");
    expect(Object.keys(ev.reviewSnapshot).length).toBeGreaterThan(0);
  });

  it("결제가 계획에 있으면 차단되어도 FAIL", async () => {
    const out = await processSubmission(buildSandboxSubmission(loadEnvironmentPack("sandbox")), "PAYMENT_ACTION_ATTEMPT");
    const ev = out.evidence!;
    expect(ev.plannedPaymentActionCount).toBeGreaterThan(0);
    expect(ev.executedPaymentActionCount).toBe(0);
    expect(ev.blockedPaymentActionCount).toBeGreaterThan(0);
    expect(ev.result).toBe("FAIL");
  });

  it("오류 주입 결과와 Evidence 가 일치한다", async () => {
    const out = await processSubmission(buildSandboxSubmission(loadEnvironmentPack("sandbox")), "MISSING_VERIFIER");
    expect(out.run!.stopType).toBe(out.evidence!.stopType);
    expect(out.run!.stopReason).toBe(out.evidence!.stopReason);
    expect(out.evidence!.requiredVerifierExecuted).toBe(false);
    expect(out.evidence!.result).toBe("FAIL");
  });
});

describe("회귀 — 공개/비공개 데이터", () => {
  it("배포 제외 목록이 .gitignore 에 있다", () => {
    const gi = read(".gitignore");
    for (const p of ["node_modules", "dist", "__MACOSX", ".DS_Store", "kiobridge-private-evaluation", "hidden-profiles", "expected-results"]) {
      expect(gi, p).toMatch(new RegExp(p.replace(/\./g, "\\.")));
    }
  });

  it("평가 환경의 완성 정답계획이 공개되지 않는다 (sandbox 만 예제 제공)", () => {
    const dir = path.join(REPO_ROOT, "examples", "submission-format-example");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files).toEqual(["sandbox.json"]);
    for (const env of EVAL_ENVS) {
      expect(existsSync(path.join(REPO_ROOT, "environments", env, "scenarios")), `${env}/scenarios`).toBe(false);
    }
  });

  it("공개 트리에 expectedRecommendation 이 없다", () => {
    const scan = (dir: string) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) { if (f.name !== "node_modules") scan(p); }
        else if (f.name.endsWith(".json")) expect(readFileSync(p, "utf-8"), p).not.toMatch(/expectedRecommendation/);
      }
    };
    scan(path.join(REPO_ROOT, "environments"));
    scan(path.join(REPO_ROOT, "examples"));
  });
});
