import { describe, it, expect } from "vitest";
import {
  EVALUATED_ENVIRONMENTS, loadEnvironmentPack, loadExample, processSubmission, validateSubmission,
} from "../../shared";
import { buildSandboxPlan, buildSandboxSubmission } from "./sandbox-plan-builder";

/**
 * Sandbox is the ONLY environment where the public package ships a complete
 * end-to-end example. It exists so teams can rehearse the connection flow
 * without touching an evaluated environment.
 */
describe("Sandbox — 전체 연결 흐름 (완성 예제 허용)", () => {
  const pack = loadEnvironmentPack("sandbox");

  it("완성 제출이 계약·안전·상태 전환을 통과한다", async () => {
    const out = await processSubmission(buildSandboxSubmission(pack));
    expect(out.validation.valid, JSON.stringify(out.validation.errors)).toBe(true);
    const ev = out.evidence!;
    expect(ev.result).toBe("PASS");
    expect(ev.stopType).toBe("NORMAL_BOUNDARY_STOP");
    expect(ev.boundaryReached).toBe(true);
    expect(ev.requiredVerifierExecuted).toBe(true);
    expect(ev.driverId).toBe("SIMULATION");
  });

  it("가상 키오스크가 실제로 재생된다 (이벤트 + UI 상태)", async () => {
    const out = await processSubmission(buildSandboxSubmission(pack));
    const run = out.run!;
    expect(run.events.some((e) => e.type === "TARGET_PRESSED")).toBe(true);
    expect(run.events.some((e) => e.type === "SCREEN_TRANSITION_COMPLETED")).toBe(true);
    expect(run.events.some((e) => e.type === "VERIFIER_EXECUTED")).toBe(true);
    expect(run.events.at(-1)!.type).toBe("RUN_STOPPED");
    expect(run.finalUiState.selectedCandidate).toBeTruthy();
    expect(Object.keys(run.reviewSnapshot).length).toBeGreaterThan(0);
  });

  it("공개 sandbox 예제 파일이 스키마·계약을 만족한다", async () => {
    const out = await processSubmission(loadExample("valid", "sandbox.json"));
    expect(out.validation.valid, JSON.stringify(out.validation.errors)).toBe(true);
    expect(out.evidence!.result).toBe("PASS");
  });

  it("의미 기반 Action 만 사용한다 (좌표·컨트롤 ID 없음)", () => {
    const sub = buildSandboxSubmission(pack);
    for (const a of sub.executionPlan.actions) {
      expect(a.target?.kind).toBeTruthy();
      expect(a).not.toHaveProperty("targetId");
      expect(JSON.stringify(a)).not.toMatch(/automationId|coordinate/);
    }
  });
});

describe("Sandbox 빌더는 공식 평가 환경에서 동작하지 않는다 (역할 침범 방지)", () => {
  for (const env of EVALUATED_ENVIRONMENTS) {
    it(`${env} 실행계획 생성을 거부한다`, () => {
      const pack = loadEnvironmentPack(env);
      expect(() => buildSandboxPlan(pack)).toThrow(/실행계획은 생성할 수 없습니다/);
      expect(() => buildSandboxSubmission(pack)).toThrow(/실행계획은 생성할 수 없습니다/);
    });
  }

  it("sandbox 제출을 공식 환경으로 위장해도 검증에서 거부된다", () => {
    const sub = buildSandboxSubmission(loadEnvironmentPack("sandbox"));
    const disguised = { ...sub, environmentId: "chicken-store" };
    const v = validateSubmission(loadEnvironmentPack("chicken-store"), disguised);
    expect(v.valid).toBe(false);
  });
});
