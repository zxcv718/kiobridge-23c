import { describe, it, expect } from "vitest";
import {
  convertLegacyV4, validateCanonicalInput, validateProfile, validateSessionContext,
  validateUnknownPolicy, validateExtensions, assertSupportedVersion, contractCapabilities,
  ContractValidationError,
} from "@kiobridge/profile-contract";
import { loadEnvironmentPack } from "../../shared";
import { buildSandboxSubmission } from "../sandbox/sandbox-plan-builder";

const baseProfile = () => ({
  profileId: "TEAM-001-PROFILE-001",
  dataClassification: "SYNTHETIC_PROFILE" as const,
  source: { collectionChannel: "VOICE", providerId: "TEAM-001", collectedAt: "2026-08-01T05:30:00.000Z" },
  accessibility: { largeText: true, simpleSteps: true, visualGuidance: false, hearingSupport: false, mobilitySupport: false, highContrast: false, staffAssistancePreferred: false },
  interaction: { preferredInput: "VOICE", language: "ko-KR", confirmationRequired: true },
  consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
});

const chickenCtx = (over: Record<string, unknown> = {}) => ({
  intent: { task: "ORDER_FOOD" }, facts: {},
  preferences: { serviceType: "TAKE_OUT", spicyLevel: "HOT", boneType: "BONELESS", quantity: 1 },
  hardConstraints: { allergenIds: [] }, capabilities: {}, fieldMetadata: {},
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  inputContractVersion: "1.0.0", environmentId: "chicken-store", teamId: "TEAM-001",
  profile: baseProfile(), sessionContext: chickenCtx(), ...over,
});

const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);

describe("Core Contract — profile / sessionContext 분리", () => {
  it("[1] profile 과 sessionContext 가 분리되어 있다", () => {
    const sub = buildSandboxSubmission(loadEnvironmentPack("sandbox"));
    expect(sub.profile).toBeTruthy();
    expect(sub.sessionContext).toBeTruthy();
    expect(sub.sessionContext.intent.task).toBe("PRACTICE");
  });

  it("[2/3] domainPreferences / constraints 가 제거되었다", () => {
    const sub = buildSandboxSubmission(loadEnvironmentPack("sandbox"));
    expect(sub.profile).not.toHaveProperty("domainPreferences");
    expect(sub.profile).not.toHaveProperty("constraints");
    const withOld = { ...baseProfile(), domainPreferences: {}, constraints: {} };
    expect(validateProfile(withOld).map((e) => e.code)).toContain("UNKNOWN_FIELD");
  });

  it("[4] inputContractVersion 은 필수", () => {
    const r = validateCanonicalInput({ ...input(), inputContractVersion: undefined });
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("REQUIRED_FIELD_MISSING");
  });

  it("[5/6] 핵심 객체는 닫혀 있고 extensions 만 자유롭다", () => {
    const bad = validateProfile({ ...baseProfile(), myOwnField: 1 });
    expect(bad.map((e) => e.code)).toContain("UNKNOWN_FIELD");
    expect(validateExtensions({ "TEAM-001": { schemaVersion: "1.0.0", anything: { deep: true } } }, "TEAM-001")).toEqual([]);
  });

  it("extensions namespace 는 teamId 와 일치해야 한다", () => {
    const errs = validateExtensions({ OTHER_TEAM: { schemaVersion: "1.0.0" } }, "TEAM-001");
    expect(errs.map((e) => e.code)).toContain("EXTENSION_NAMESPACE_INVALID");
  });
});

describe("표준값 — 소문자/한글 원본 거부", () => {
  it("[7/8] take_out 거부, TAKE_OUT 통과", () => {
    const bad = validateCanonicalInput(input({ sessionContext: chickenCtx({ preferences: { serviceType: "take_out" } }) }));
    expect(bad.valid).toBe(false);
    const err = bad.errors.find((e) => e.path.endsWith("/serviceType"))!;
    expect(err.code).toBe("ENUM_VALUE_INVALID");
    expect(err.allowedValues).toContain("TAKE_OUT");
    expect(err.receivedValue).toBe("take_out");
    expect(validateCanonicalInput(input()).valid).toBe(true);
  });

  it("[9/10] 매운맛 거부, HOT 통과", () => {
    const bad = validateCanonicalInput(input({ sessionContext: chickenCtx({ preferences: { spicyLevel: "매운맛" } }) }));
    expect(codes(bad)).toContain("ENUM_VALUE_INVALID");
    expect(validateCanonicalInput(input({ sessionContext: chickenCtx({ preferences: { spicyLevel: "HOT" } }) })).valid).toBe(true);
  });

  it("[11/12] ko-KR 통과, 잘못된 언어코드 거부", () => {
    expect(validateProfile(baseProfile())).toEqual([]);
    const lang = (language: string) =>
      validateProfile({ ...baseProfile(), interaction: { preferredInput: "VOICE", language, confirmationRequired: true } });

    for (const good of ["ko-KR", "en-US", "ja-JP"]) expect(lang(good), good).toEqual([]);
    // 지역 서브태그가 없는 "ko" 는 모호하므로 거부한다 (legacy adapter 가 ko → ko-KR 로 변환).
    for (const bad of ["korean", "ko", "KO-kr", "ko_KR", ""]) {
      expect(lang(bad).some((e) => e.path.endsWith("/language")), bad).toBe(true);
    }
  });

  it("preferredInput 은 UPPER_SNAKE_CASE 만 허용", () => {
    const bad = validateProfile({ ...baseProfile(), interaction: { preferredInput: "touch", language: "ko-KR", confirmationRequired: true } });
    expect(bad.map((e) => e.code)).toContain("ENUM_VALUE_INVALID");
  });
});

describe("의미 분리 — facts / preferences / hardConstraints / capabilities", () => {
  it("[13] 알레르기가 preferences 에 있으면 오류", () => {
    const r = validateSessionContext("chicken-store", chickenCtx({ preferences: { allergenIds: ["PEANUT"] }, hardConstraints: {} }));
    expect(r.map((e) => e.code)).toContain("DOMAIN_CONTEXT_MISMATCH");
  });

  it("[14] 예약 여부는 facts 여야 한다", () => {
    const ctx = { intent: { task: "CHECK_IN" }, facts: {}, preferences: { appointmentStatus: "HAS_APPOINTMENT" }, hardConstraints: {}, capabilities: {}, fieldMetadata: {} };
    expect(validateSessionContext("hospital", ctx).map((e) => e.code)).toContain("DOMAIN_CONTEXT_MISMATCH");
  });

  it("[15] 인증수단은 capabilities 여야 한다", () => {
    const ctx = { intent: { task: "PUBLIC_SERVICE_GUIDANCE" }, facts: {}, preferences: { availableAuthMethods: ["MOBILE_AUTH"] }, hardConstraints: {}, capabilities: {}, fieldMetadata: {} };
    expect(validateSessionContext("public-office", ctx).map((e) => e.code)).toContain("DOMAIN_CONTEXT_MISMATCH");
  });

  it("[16/17] UNKNOWN · 누락 · NO_PREFERENCE 는 서로 다르다", () => {
    // 누락: 필드 없음 → 유효
    expect(validateSessionContext("chicken-store", chickenCtx({ preferences: {} }))).toEqual([]);
    // NO_PREFERENCE: 선호 없음 → 유효
    expect(validateSessionContext("chicken-store", chickenCtx({ preferences: { spicyLevel: "NO_PREFERENCE" } }))).toEqual([]);
    // UNKNOWN: 값으로는 유효하지만 hardConstraint 에서는 정책 위반
    expect(validateSessionContext("chicken-store", chickenCtx({ preferences: { spicyLevel: "UNKNOWN" } }))).toEqual([]);
    const unknownHard = validateUnknownPolicy("chicken-store", chickenCtx({ hardConstraints: { allergenIds: ["UNKNOWN"] } }));
    expect(unknownHard.map((e) => e.code)).toContain("HARD_CONSTRAINT_UNKNOWN");
    // 누락된 hardConstraint 는 UNKNOWN 과 달리 정책 위반이 아니다
    expect(validateUnknownPolicy("chicken-store", chickenCtx({ hardConstraints: {} }))).toEqual([]);
  });
});

describe("Field Metadata", () => {
  it("[18] confidence 범위 검사", () => {
    const ctx = chickenCtx({ fieldMetadata: { "/preferences/spicyLevel": { source: "VOICE", confidence: 1.5, confirmedByUser: true } } });
    expect(validateSessionContext("chicken-store", ctx).some((e) => e.path.includes("confidence"))).toBe(true);
  });

  it("[19/20] 낮은 confidence + 미확인 → 재확인 요구", () => {
    const ctx = chickenCtx({ fieldMetadata: { "/preferences/spicyLevel": { source: "VOICE", confidence: 0.3, confirmedByUser: false } } });
    expect(validateUnknownPolicy("chicken-store", ctx).map((e) => e.code)).toContain("LOW_CONFIDENCE_RECONFIRMATION_REQUIRED");
    const confirmed = chickenCtx({ fieldMetadata: { "/preferences/spicyLevel": { source: "VOICE", confidence: 0.3, confirmedByUser: true } } });
    expect(validateUnknownPolicy("chicken-store", confirmed)).toEqual([]);
  });

  it("[21] 개인정보가 포함되면 거부된다", () => {
    const withPhone = validateCanonicalInput(input({ profile: { ...baseProfile(), displayName: "010-1234-5678" } }));
    expect(codes(withPhone)).toContain("PERSONAL_DATA_NOT_ALLOWED");
    const withRrn = validateSessionContext("chicken-store", chickenCtx({ fieldMetadata: { "/preferences/spicyLevel": { source: "VOICE", confidence: 1, confirmedByUser: true, normalizerId: "900101-1234567" } } }));
    expect(withRrn.map((e) => e.code)).toContain("PERSONAL_DATA_NOT_ALLOWED");
  });
});

describe("버전 협상", () => {
  it("[22/23] 지원 버전 통과, 미지원 버전 거부", () => {
    expect(() => assertSupportedVersion("1.0.0")).not.toThrow();
    expect(() => assertSupportedVersion("2.0.0")).toThrow(ContractValidationError);
    const r = validateCanonicalInput(input({ inputContractVersion: "2.0.0" }));
    expect(codes(r)).toContain("UNSUPPORTED_INPUT_CONTRACT_VERSION");
    expect(r.errors[0].allowedValues).toContain("1.0.0");
  });

  it("[25] 잘못된 버전 형식도 거부", () => {
    expect(codes(validateCanonicalInput(input({ inputContractVersion: "v1" })))).toContain("UNSUPPORTED_INPUT_CONTRACT_VERSION");
  });

  it("capabilities API 가 지원 버전을 알려준다", () => {
    const c = contractCapabilities();
    expect(c.supportedInputContractVersions).toContain("1.0.0");
    expect(c.defaultInputContractVersion).toBe("1.0.0");
  });
});

describe("Legacy v4 Adapter", () => {
  it("[26] 변환 시 LEGACY_PROFILE_FORMAT 경고를 반환한다", () => {
    const r = convertLegacyV4({
      profileId: "PROFILE-CHK-001",
      accessibility: { largeText: true },
      interaction: { preferredInput: "touch", language: "ko", confirmationRequired: true },
      domainPreferences: { serviceType: "take_out", spicyLevel: "high", boneType: "boneless" },
      constraints: { allergens: ["peanut"] },
      consent: { personalization: true },
    }, "chicken-store");

    expect(r.warnings.map((w) => w.code)).toContain("LEGACY_PROFILE_FORMAT");
    expect(r.inputContractVersion).toBe("1.0.0");
    expect(r.profile.interaction.preferredInput).toBe("TOUCH");
    expect(r.profile.interaction.language).toBe("ko-KR");
    const prefs = r.sessionContext.preferences as Record<string, string>;
    expect(prefs.serviceType).toBe("TAKE_OUT");
    expect(prefs.spicyLevel).toBe("HOT");
    expect(prefs.boneType).toBe("BONELESS");
    expect((r.sessionContext.hardConstraints as { allergenIds: string[] }).allergenIds).toEqual(["PEANUT"]);
    // 변환 결과 자체가 계약을 만족해야 한다
    expect(validateProfile(r.profile)).toEqual([]);
    expect(validateSessionContext("chicken-store", r.sessionContext)).toEqual([]);
  });

  it("모호한 값은 추정하지 않고 UNKNOWN 으로 변환한다", () => {
    const r = convertLegacyV4({ domainPreferences: { serviceType: "그냥 아무거나" }, constraints: {} }, "chicken-store");
    expect((r.sessionContext.preferences as Record<string, string>).serviceType).toBe("UNKNOWN");
    expect(r.warnings.length).toBeGreaterThan(1);
  });
});

describe("Safety Engine — hardConstraints 사용", () => {
  it("[27/28] profile.constraints 참조가 코드에서 제거되었다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../../packages/safety-engine/src/index.ts", import.meta.url), "utf-8");
    expect(src).toMatch(/hardConstraints/);
    expect(src).not.toMatch(/profile\.constraints/);
    expect(src).not.toMatch(/domainPreferences/);
  });
});
