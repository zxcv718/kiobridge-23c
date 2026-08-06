import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  EVALUATED_ENVIRONMENTS, REPO_ROOT, findUnavailable, findWithAllergen, findRequiringAuth,
  loadEnvironmentPack, loadExample, processSubmission, validateSubmission,
} from "../../shared";

/**
 * The public checker VALIDATES a participant-produced submission.
 * These tests supply the submission (or a deliberately broken one) — the
 * validator never produces, repairs or completes anything.
 */

/** Minimal, hand-written invalid submission skeleton for an evaluated env. */
const skeleton = (environmentId: string) => ({
  inputContractVersion: "1.0.0",
  submissionVersion: "1.0.0",
  teamId: "TEAM-TEST",
  environmentId,
  profile: {
    profileId: "TEAM-TEST-P1",
    dataClassification: "SYNTHETIC_PROFILE" as const,
    source: { collectionChannel: "WEB_FORM", providerId: "TEAM-TEST", collectedAt: "2026-08-01T00:00:00.000Z" },
    accessibility: { largeText: false, simpleSteps: false, visualGuidance: false, hearingSupport: false, mobilitySupport: false, highContrast: false, staffAssistancePreferred: false },
    interaction: { preferredInput: "TOUCH", language: "ko-KR", confirmationRequired: true },
    consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
  },
  sessionContext: { intent: { task: "ORDER_FOOD" }, facts: {}, preferences: {}, hardConstraints: {}, capabilities: {}, fieldMetadata: {} },
  recommendation: {
    recommendedCandidateId: null as string | null, alternativeCandidateIds: [] as string[], excludedCandidates: [] as unknown[],
    scoreBreakdown: {}, recommendationReasons: ["테스트"], unmetConditions: [],
    confidence: 0.5, requiresReconfirmation: false,
  },
  userDecision: { approved: true, decision: "APPROVE" as const },
  // Empty plan: the participant has not built one yet.
  executionPlan: { planId: "IMPLEMENT_BY_PARTICIPANT", validationMode: "SIMULATION_ONLY", executionEnvironment: "DIGITAL_TWIN", actualDeviceCommandSent: false as const, actions: [] },
});

describe("공개 checker — 제출을 검증할 뿐 생성하지 않는다", () => {
  it("빈 실행계획을 자동으로 채우지 않는다", async () => {
    const pack = loadEnvironmentPack("chicken-store");
    const sub = skeleton("chicken-store");
    // 후보를 지정하면 계획이 없다는 사실이 그대로 드러나야 한다.
    sub.recommendation.recommendedCandidateId = pack.candidates.find((c) => c.available)!.candidateId;
    const out = await processSubmission(sub as never);
    // 검증은 통과할 수 있으나 실행 결과는 FAIL — 채워주지 않는다.
    expect(out.evidence?.result ?? "FAIL").toBe("FAIL");
    expect(out.evidence?.executionPlan.length ?? 0).toBe(0);
  });

  it("추천 후보를 대신 고르지 않는다 (null 이면 계획도 비어 있음)", async () => {
    const out = await processSubmission(skeleton("chicken-store") as never);
    expect(out.evidence?.recommendation?.recommendedCandidateId ?? null).toBeNull();
    expect(out.evidence?.executionPlan.length ?? 0).toBe(0);
  });

  it("--file 없이 실행하면 오류로 종료한다 (제출을 만들어주지 않음)", () => {
    let failed = false;
    try {
      execFileSync(process.execPath, [path.join(REPO_ROOT, "tools", "check-submission.mjs"), "--environment", "sandbox"], { encoding: "utf-8", stdio: "pipe" });
    } catch (err) {
      failed = true;
      const out = String((err as { stderr?: Buffer }).stderr ?? "");
      expect(out).toMatch(/--file/);
      expect(out).toMatch(/대신 생성하지 않습니다/);
    }
    expect(failed, "인자 없이 성공하면 안 됨").toBe(true);
  });

  it("정상 제출 파일을 검증한다 (sandbox 예제)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kio-check-"));
    const file = path.join(dir, "submission.json");
    writeFileSync(file, JSON.stringify(loadExample("valid", "sandbox.json")));
    const out = execFileSync(process.execPath, [path.join(REPO_ROOT, "tools", "check-submission.mjs"), "--file", file], { encoding: "utf-8" });
    expect(out).toMatch(/검증 통과/);
  });
});

describe("공개 checker — 오류 제출 예제 거부", () => {
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
      expect(out.validation.errors.some((e) => codes.includes(e.code)), JSON.stringify(out.validation.errors.map((e) => e.code))).toBe(true);
    });
  }
});

describe("공식 평가 환경 — 속성 기반 안전 규칙 (후보 ID 하드코딩 없음)", () => {
  it("품절 후보 추천은 거부된다", () => {
    for (const env of EVALUATED_ENVIRONMENTS) {
      const pack = loadEnvironmentPack(env);
      const unavailable = findUnavailable(pack);
      if (!unavailable) continue; // 이 환경엔 품절 후보가 없음
      const sub = { ...skeleton(env), sessionContext: { intent: { task: intentFor(env) }, facts: {}, preferences: {}, hardConstraints: {}, capabilities: {}, fieldMetadata: {} } };
      sub.recommendation.recommendedCandidateId = unavailable.candidateId;
      const v = validateSubmission(pack, sub as never);
      expect(v.errors.some((e) => e.code === "CANDIDATE_UNAVAILABLE"), env).toBe(true);
    }
  });

  it("알레르기 hardConstraint 와 충돌하는 후보 추천은 거부된다", () => {
    const pack = loadEnvironmentPack("chicken-store");
    const peanut = findWithAllergen(pack, "PEANUT");
    expect(peanut, "PEANUT 을 포함한 후보가 fixture 에 있어야 함").toBeTruthy();
    const sub = skeleton("chicken-store");
    sub.recommendation.recommendedCandidateId = peanut!.candidateId;
    (sub.sessionContext.hardConstraints as { allergenIds?: string[] }).allergenIds = ["PEANUT"];
    const v = validateSubmission(pack, sub as never);
    expect(v.errors.some((e) => e.code === "ALLERGEN_CONFLICT")).toBe(true);
  });

  it("존재하지 않는 후보 추천은 거부된다", () => {
    for (const env of EVALUATED_ENVIRONMENTS) {
      const pack = loadEnvironmentPack(env);
      const sub = { ...skeleton(env), sessionContext: { intent: { task: intentFor(env) }, facts: {}, preferences: {}, hardConstraints: {}, capabilities: {}, fieldMetadata: {} } };
      sub.recommendation.recommendedCandidateId = "DOES-NOT-EXIST-999";
      const v = validateSubmission(pack, sub as never);
      expect(v.errors.some((e) => e.code === "CANDIDATE_NOT_FOUND"), env).toBe(true);
    }
  });

  it("인증수단이 필요한 민원 후보가 fixture 에 존재한다 (속성 기반 조회)", () => {
    const pack = loadEnvironmentPack("public-office");
    expect(findRequiringAuth(pack), "인증수단을 요구하는 후보").toBeTruthy();
  });
});

function intentFor(env: string): string {
  if (env === "hospital") return "CHECK_IN";
  if (env === "public-office") return "PUBLIC_SERVICE_GUIDANCE";
  return "ORDER_FOOD";
}
