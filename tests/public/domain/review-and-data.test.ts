import { beforeAll, describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { resolveReview } from "@kiobridge/kiosk-driver-contract";
import { VALIDATION_CODES, type Candidate, type EnvironmentPack } from "@kiobridge/contracts";
import { validateEnvironmentPack } from "../../../apps/simulation-api/src/loader";
import { validateSubmissionSemantics } from "@kiobridge/evaluator";
import { EVALUATED_ENVIRONMENTS, REPO_ROOT, loadEnvironmentPack, loadExample, processSubmission, validateSubmission } from "../../shared";
import { buildSandboxSubmission } from "../sandbox/sandbox-plan-builder";

const ENVS = [...EVALUATED_ENVIRONMENTS, "sandbox"] as const;
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf-8");

const baseInput = (pack: EnvironmentPack, over: Partial<Parameters<typeof resolveReview>[0]> = {}) => ({
  pack,
  selectedCandidate: undefined as Candidate | undefined,
  selectedOptions: {} as Record<string, string | number | boolean>,
  sessionContext: {},
  profile: {},
  uiValues: {} as Record<string, unknown>,
  ...over,
});

const field = (r: ReturnType<typeof resolveReview>, id: string) => r.fields.find((f) => f.fieldId === id)!;

/* ─────────────────── 후보 데이터 (23–27) ─────────────────── */

describe("후보 데이터 — Canonical 정규화", () => {
  it("[23] 모든 환경의 후보가 공식 UPPER_SNAKE_CASE enum 만 쓴다", () => {
    const offenders: string[] = [];
    for (const env of ENVS) {
      for (const c of loadEnvironmentPack(env).candidates) {
        const scan = (bag: Record<string, unknown> | undefined, where: string) => {
          for (const [k, v] of Object.entries(bag ?? {})) {
            for (const one of Array.isArray(v) ? v : [v]) {
              if (typeof one === "string" && one && !/^[A-Z][A-Z0-9_]*$/.test(one)) {
                offenders.push(`${env}/${c.candidateId} ${where}.${k} = "${one}"`);
              }
            }
          }
        };
        scan(c.attributes as Record<string, unknown>, "attributes");
        scan(c.supportedOptions as unknown as Record<string, unknown>, "supportedOptions");
        scan(c.requirements as Record<string, unknown>, "requirements");
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("공식 필드명을 쓴다 (구형 이름 없음)", () => {
    const legacy = ["department", "hasAppointment", "category", "allergens", "appointment"];
    for (const env of ENVS) {
      for (const c of loadEnvironmentPack(env).candidates) {
        for (const k of Object.keys(c.attributes ?? {})) {
          expect(legacy, `${env}/${c.candidateId}.attributes.${k}`).not.toContain(k);
        }
      }
    }
  });

  it("[24] 소문자 도메인 enum 이 들어오면 환경팩 로딩이 거부한다", () => {
    const pack = loadEnvironmentPack("hospital");
    const broken = {
      ...pack,
      candidates: pack.candidates.map((c, i) =>
        i === 0 ? { ...c, attributes: { ...c.attributes, visitType: "revisit" } } : c),
    } as EnvironmentPack;
    const problems = validateEnvironmentPack(broken);
    expect(problems.some((p) => /공식 enum/.test(p)), problems.join("\n")).toBe(true);
  });

  it("[25] attributes 와 supportedOptions 가 어긋나면 충돌로 검출한다", () => {
    const pack = loadEnvironmentPack("hospital");
    const broken = {
      ...pack,
      candidates: pack.candidates.map((c, i) =>
        i === 0 ? { ...c, attributes: { ...c.attributes, departmentId: "RADIOLOGY" } } : c),
    } as EnvironmentPack;
    const problems = validateEnvironmentPack(broken);
    expect(problems.some((p) => /충돌/.test(p)), problems.join("\n")).toBe(true);
  });

  it("현재 환경팩에는 attributes ↔ supportedOptions 충돌이 0건이다", () => {
    for (const env of ENVS) {
      const problems = validateEnvironmentPack(loadEnvironmentPack(env));
      expect(problems, `${env}: ${problems.join("\n")}`).toEqual([]);
    }
  });

  it("[26] 중복 후보 ID 를 거부한다", () => {
    const pack = loadEnvironmentPack("sandbox");
    const broken = { ...pack, candidates: [...pack.candidates, pack.candidates[0]] } as EnvironmentPack;
    expect(validateEnvironmentPack(broken).some((p) => /중복 후보 ID/.test(p))).toBe(true);
  });

  it("[27] 잘못된 인증수단 값을 거부한다", () => {
    const pack = loadEnvironmentPack("public-office");
    const broken = {
      ...pack,
      candidates: pack.candidates.map((c, i) =>
        i === 0 ? { ...c, requirements: { ...c.requirements, authenticationMethods: ["mobile_auth"] } } : c),
    } as EnvironmentPack;
    expect(validateEnvironmentPack(broken).some((p) => /authenticationMethods/.test(p))).toBe(true);
  });
});

/* ─────────────────── Review Resolver (28–34) ─────────────────── */

describe("Review Resolver — 우선순위와 미해결 처리", () => {
  const hospital = () => loadEnvironmentPack("hospital");
  const candidateWithDept = (dept: string): Candidate =>
    ({ candidateId: "T-1", name: "테스트 접수", available: true, supportedOptions: { DEPARTMENT: [dept] } } as unknown as Candidate);

  it("[28] selectedOptions.DEPARTMENT 가 최우선", () => {
    const r = resolveReview(baseInput(hospital(), {
      selectedCandidate: candidateWithDept("RADIOLOGY"),
      selectedOptions: { DEPARTMENT: "ORTHOPEDICS" },
      sessionContext: { facts: { departmentId: "INTERNAL_MEDICINE" } },
    }));
    const f = field(r, "departmentId");
    expect(f.value).toBe("ORTHOPEDICS");
    expect(f.displayValue).toBe("정형외과");
    expect(f.source).toBe("selectedOptions.DEPARTMENT");
  });

  it("[29] selectedOptions 가 없으면 후보의 supportedOptions 로 채운다", () => {
    const r = resolveReview(baseInput(hospital(), {
      selectedCandidate: candidateWithDept("INTERNAL_MEDICINE"),
      sessionContext: { facts: { departmentId: "ORTHOPEDICS" } },
    }));
    const f = field(r, "departmentId");
    expect(f.value).toBe("INTERNAL_MEDICINE");
    expect(f.displayValue).toBe("내과");
    expect(f.source).toBe("selectedCandidate.supportedOptions.DEPARTMENT");
  });

  it("[30] 둘 다 없으면 sessionContext 로 내려간다", () => {
    const r = resolveReview(baseInput(hospital(), {
      selectedCandidate: { candidateId: "T-1", name: "테스트", available: true } as unknown as Candidate,
      sessionContext: { facts: { departmentId: "ORTHOPEDICS" } },
    }));
    const f = field(r, "departmentId");
    expect(f.value).toBe("ORTHOPEDICS");
    expect(f.source).toBe("sessionContext.facts.departmentId");
  });

  it("[31] UNSPECIFIED / UNKNOWN 은 라벨로 명확히 표시된다 (조용한 '-' 금지)", () => {
    const unspecified = resolveReview(baseInput(hospital(), { selectedCandidate: candidateWithDept("UNSPECIFIED") }));
    expect(field(unspecified, "departmentId").displayValue).toBe("진료과 미지정");

    const unknown = resolveReview(baseInput(hospital(), {
      selectedCandidate: { candidateId: "T-1", name: "테스트", available: true } as unknown as Candidate,
      sessionContext: { facts: { departmentId: "UNKNOWN" } },
    }));
    expect(field(unknown, "departmentId").displayValue).toBe("진료과 확인 필요");
    expect(field(unknown, "departmentId").displayValue).not.toBe("-");
  });

  it("[32] 필수 필드를 못 채우면 REVIEW_FIELD_UNRESOLVED", () => {
    const r = resolveReview(baseInput(hospital()));
    expect(r.unresolvedRequiredFields).toContain("departmentId");
    expect(r.errors.map((e) => e.code)).toContain(VALIDATION_CODES.REVIEW_FIELD_UNRESOLVED);
    expect(field(r, "departmentId").resolved).toBe(false);
  });

  it("[33] 관공서 인증수단은 사용자 수단과 후보 요구의 교집합에서 결정된다", () => {
    const pack = loadEnvironmentPack("public-office");
    const candidate = {
      candidateId: "T-1", name: "테스트 민원", available: true,
      supportedOptions: { CATEGORY: ["RESIDENT"] },
      requirements: { authenticationMethods: ["MOBILE_AUTH", "ID_CARD"] },
    } as unknown as Candidate;

    const single = resolveReview(baseInput(pack, {
      selectedCandidate: candidate,
      sessionContext: { intent: { task: "PUBLIC_SERVICE_GUIDANCE" }, capabilities: { availableAuthMethods: ["ID_CARD"] } },
    }));
    expect(field(single, "authMethod").value).toBe("ID_CARD");
    expect(field(single, "authMethod").displayValue).toBe("신분증");
    // 배열 항목이 한국어 라벨로 표시된다 (원시 enum 노출 금지).
    expect(field(single, "availableAuthMethods").displayValue).toBe("신분증");

    // 교집합이 여러 개면 사용자가 골라야 하므로 자동으로 정하지 않는다.
    const multiple = resolveReview(baseInput(pack, {
      selectedCandidate: candidate,
      sessionContext: { intent: {}, capabilities: { availableAuthMethods: ["ID_CARD", "MOBILE_AUTH"] } },
    }));
    expect(field(multiple, "authMethod").resolved).toBe(false);
  });

  it("[34] 닭강정 — 두 번째 페이지 후보를 골라도 정확한 메뉴명이 표시된다", () => {
    const pack = loadEnvironmentPack("chicken-store");
    const secondPage = pack.candidates[5]; // index 5 -> page 1
    const r = resolveReview(baseInput(pack, {
      selectedCandidate: secondPage,
      selectedOptions: { SERVICE_TYPE: "TAKE_OUT" },
      uiValues: { quantity: 2, totalPriceLabel: "36,000원", allergenCheckLabel: "제약 없음", targetMatchLabel: "일치" },
    }));
    expect(field(r, "menuName").value).toBe(secondPage.name);
    expect(field(r, "quantity").value).toBe("2");
    expect(field(r, "totalPrice").value).toBe("36,000원");
    expect(r.unresolvedRequiredFields).toEqual([]);
  });

  it("병원 Review 는 요구된 항목을 모두 포함한다", () => {
    const ids = loadEnvironmentPack("hospital").reviewMapping.fields.map((f) => f.fieldId);
    for (const need of ["visitType", "appointmentStatus", "checkInRoute", "departmentId", "guardianPresent", "supportModes", "userConfirmed"]) {
      expect(ids, need).toContain(need);
    }
  });

  it("관공서 Review 는 요구된 항목을 모두 포함한다", () => {
    const ids = loadEnvironmentPack("public-office").reviewMapping.fields.map((f) => f.fieldId);
    for (const need of ["serviceCategory", "requestedTask", "selectedService", "authMethod", "availableAuthMethods", "guidanceMode", "accessibility", "notActualApplication"]) {
      expect(ids, need).toContain(need);
    }
  });
});

describe("Review — 실행 결과 반영", () => {
  it("sandbox 실행 Evidence 에 reviewResolution 이 기록되고 미해결 필드가 없다", async () => {
    const out = await processSubmission(buildSandboxSubmission(loadEnvironmentPack("sandbox")));
    const res = out.evidence!.reviewResolution!;
    expect(res.fields.length).toBeGreaterThan(0);
    expect(res.unresolvedRequiredFields).toEqual([]);
    for (const f of res.fields) expect(f.source).toBeTruthy();
    expect(out.evidence!.stopType).toBe("NORMAL_BOUNDARY_STOP");
  });

  it("필수 Review 필드가 해결되지 않으면 NORMAL_BOUNDARY_STOP 으로 성공 처리하지 않는다", () => {
    const src = read("packages/evaluator/src/index.ts");
    expect(src).toMatch(/unresolvedRequiredReviewFields/);
    expect(src).toMatch(/REVIEW_FIELD_UNRESOLVED/);
    // 경계 정지 판정보다 앞에서 SAFETY_STOP 으로 갈라져야 한다.
    const idx = src.indexOf("unresolvedRequiredReviewFields.length > 0");
    const normal = src.indexOf('stopType = "NORMAL_BOUNDARY_STOP"');
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(normal);
  });
});

/* ─────────────────── 오류코드 (18) ─────────────────── */

describe("공식 오류코드 — 실제 발생 스윕", () => {
  /**
   * Classification comes from RUNNING the validators against deliberately
   * broken submissions and collecting what they actually emit — not from
   * grepping source files. A code that no input can produce is either a real
   * gap or must be declared RESERVED with a reason.
   */
  const emitted = new Set<string>();
  const collect = (r: { errors?: { code: string }[]; warnings?: { code: string }[] }) => {
    for (const e of r.errors ?? []) emitted.add(e.code);
    for (const w of r.warnings ?? []) emitted.add(w.code);
  };

  const baseProfile = {
    profileId: "SWEEP", dataClassification: "SYNTHETIC_PROFILE",
    source: { collectionChannel: "WEB_FORM", providerId: "T", collectedAt: "2026-08-02T00:00:00.000Z" },
    accessibility: { largeText: false, simpleSteps: false, visualGuidance: false, hearingSupport: false, mobilitySupport: false, highContrast: false, staffAssistancePreferred: false },
    interaction: { preferredInput: "TOUCH", language: "ko-KR", confirmationRequired: true },
    consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
  };

  const sub = (over: Record<string, unknown>) => ({
    inputContractVersion: "1.0.0", submissionVersion: "1.0.0", teamId: "TEAM-SWEEP",
    environmentId: "chicken-store", profile: baseProfile,
    sessionContext: { intent: { task: "ORDER_FOOD" }, facts: {}, preferences: {}, hardConstraints: {}, capabilities: {}, fieldMetadata: {} },
    recommendation: { recommendedCandidateId: null, alternativeCandidateIds: [], excludedCandidates: [], scoreBreakdown: {}, recommendationReasons: ["s"], unmetConditions: [], confidence: 0.5, requiresReconfirmation: false },
    userDecision: { approved: true, decision: "APPROVE" },
    executionPlan: { planId: "S", validationMode: "SIMULATION_ONLY", executionEnvironment: "DIGITAL_TWIN", actualDeviceCommandSent: false, actions: [] },
    ...over,
  });

  const chicken = loadEnvironmentPack("chicken-store");
  const first = chicken.candidates[0];
  const unavailable = chicken.candidates.find((c) => !c.available);
  const act = (i: number, action: string, target: unknown, before = "SERVICE_TYPE", after = "SERVICE_TYPE") =>
    ({ actionIndex: i, action, target, expectedBeforeState: before, expectedAfterState: after });

  beforeAll(async () => {
    // Structural / semantic sweep through the real validator.
    collect(validateSubmission(chicken, sub({ environmentId: "hospital" })));
    collect(validateSubmission(chicken, sub({ recommendation: { recommendedCandidateId: "NOPE-999", alternativeCandidateIds: [], excludedCandidates: [{ candidateId: "ALSO-NOPE" }], scoreBreakdown: {}, recommendationReasons: ["s"], unmetConditions: [], confidence: 0.5, requiresReconfirmation: false } })));
    if (unavailable) collect(validateSubmission(chicken, sub({ recommendation: { recommendedCandidateId: unavailable.candidateId, alternativeCandidateIds: [], excludedCandidates: [], scoreBreakdown: {}, recommendationReasons: ["s"], unmetConditions: [], confidence: 0.5, requiresReconfirmation: false } })));
    collect(validateSubmission(chicken, sub({
      userDecision: { approved: false, decision: "REJECT" },
      executionPlan: { planId: "S", validationMode: "SIMULATION_ONLY", executionEnvironment: "DIGITAL_TWIN", actualDeviceCommandSent: false, actions: [act(0, "select_service_type", { kind: "service_type", id: "TAKE_OUT" })] },
    })));
    collect(validateSubmission(chicken, sub({
      executionPlan: { planId: "S", validationMode: "REAL", executionEnvironment: "REAL_DEVICE", actualDeviceCommandSent: true, actions: [] },
    })));
    collect(validateSubmission(chicken, sub({ profile: { ...baseProfile, profileId: "홍길동 010-1234-5678" } })));
    // Plan-structure sweep: wrong indexes, unknown state, forbidden action, post-verifier action.
    collect(validateSubmission(chicken, sub({
      recommendation: { recommendedCandidateId: first.candidateId, alternativeCandidateIds: [], excludedCandidates: [], scoreBreakdown: {}, recommendationReasons: ["s"], unmetConditions: [], confidence: 0.5, requiresReconfirmation: false },
      executionPlan: { planId: "S", validationMode: "SIMULATION_ONLY", executionEnvironment: "DIGITAL_TWIN", actualDeviceCommandSent: false, actions: [
        act(3, "select_service_type", { kind: "service_type", id: "TAKE_OUT" }, "NOT_A_STATE", "NOT_A_STATE"),
        act(3, "select_menu", { kind: "candidate", id: first.candidateId }, "NOT_A_STATE", "NOT_A_STATE"),
        act(9, "pay", { kind: "review", id: "CART_REVIEW" }, "CART_REVIEW", "CART_REVIEW"),
      ] },
    })));
    collect(validateSubmission(chicken, sub({
      recommendation: { recommendedCandidateId: first.candidateId, alternativeCandidateIds: [], excludedCandidates: [], scoreBreakdown: {}, recommendationReasons: ["s"], unmetConditions: [], confidence: 0.5, requiresReconfirmation: false },
      executionPlan: { planId: "S", validationMode: "SIMULATION_ONLY", executionEnvironment: "DIGITAL_TWIN", actualDeviceCommandSent: false, actions: [
        act(0, "select_option", { kind: "option", groupId: "SPICY_LEVEL", id: "NUCLEAR" }),
        act(1, "select_option", { kind: "option", groupId: "NO_SUCH", id: "X" }),
        act(2, "select_option", { kind: "option", id: "ORPHAN" }),
      ] },
    })));
    // The full validator short-circuits on canonical/schema errors, so the
    // semantic layer is also swept directly — same production code path, just
    // entered past the schema gate.
    const semantic = (over: Record<string, unknown>) =>
      collect({ errors: validateSubmissionSemantics(chicken, sub(over) as never) });

    semantic({ environmentId: "hospital" });
    semantic({ recommendation: { recommendedCandidateId: first.candidateId, alternativeCandidateIds: [], excludedCandidates: [{ candidateId: "GHOST-1" }], scoreBreakdown: {}, recommendationReasons: ["s"], unmetConditions: [], confidence: 0.5, requiresReconfirmation: false } });
    semantic({
      userDecision: { approved: false, decision: "REJECT" },
      executionPlan: { planId: "S", validationMode: "SIMULATION_ONLY", executionEnvironment: "DIGITAL_TWIN", actualDeviceCommandSent: false, actions: [act(0, "select_service_type", { kind: "service_type", id: "TAKE_OUT" })] },
    });
    semantic({ executionPlan: { planId: "S", validationMode: "REAL_RUN", executionEnvironment: "REAL_DEVICE", actualDeviceCommandSent: true, actions: [] } });
    // Candidate does not support the chosen option value.
    const narrow = chicken.candidates.find((c) => (c.supportedOptions?.SERVICE_TYPE ?? []).length === 1);
    if (narrow) {
      const unsupported = ["DINE_IN", "TAKE_OUT"].find((v) => !narrow.supportedOptions!.SERVICE_TYPE.includes(v))!;
      semantic({
        recommendation: { recommendedCandidateId: narrow.candidateId, alternativeCandidateIds: [], excludedCandidates: [], scoreBreakdown: {}, recommendationReasons: ["s"], unmetConditions: [], confidence: 0.5, requiresReconfirmation: false },
        executionPlan: { planId: "S", validationMode: "SIMULATION_ONLY", executionEnvironment: "DIGITAL_TWIN", actualDeviceCommandSent: false, actions: [
          act(0, "select_menu", { kind: "candidate", id: narrow.candidateId }),
          act(1, "select_service_type", { kind: "service_type", id: unsupported }),
        ] },
      });
    }
    // Approved but empty plan → the run reports EMPTY_PLAN as its stop reason.
    const emptyRun = await processSubmission(sub({
      recommendation: { recommendedCandidateId: first.candidateId, alternativeCandidateIds: [], excludedCandidates: [], scoreBreakdown: {}, recommendationReasons: ["s"], unmetConditions: [], confidence: 0.5, requiresReconfirmation: false },
    }) as never);
    if (emptyRun.evidence) emitted.add(emptyRun.evidence.stopReason);
    const rejected = await processSubmission(sub({ userDecision: { approved: false, decision: "REJECT" } }) as never);
    if (rejected.evidence) emitted.add(rejected.evidence.stopReason);

    // Domain + execution-choice sweep uses the dedicated engine tests' shapes.
    for (const file of ["user-not-approved.json", "payment-action.json", "unknown-candidate.json",
      "unavailable-candidate.json", "state-mismatch.json", "incomplete-plan.json",
      "missing-verifier.json", "coordinate-or-duplicate-selection.json"]) {
      const bad = loadExample("invalid", file) as { environmentId: string };
      collect(validateSubmission(loadEnvironmentPack(bad.environmentId), bad));
    }
  });

  /** Codes that no input can produce today, each with a written reason. */
  const RESERVED_DOCUMENTED: Record<string, string> = {
    ENVIRONMENT_CANDIDATE_DATA_CONFLICT: "환경팩 로딩 시점 코드 — validateEnvironmentPack 이 문제 목록으로 검증",
    ENVIRONMENT_VOCABULARY_CONFLICT: "환경팩 로딩 시점 코드 — checkVocabularyMembership 이 위반 목록으로 검증",
    VOCABULARY_VALUE_UNKNOWN: "로딩 실패 메시지의 항목 코드 — membership 테스트가 값 단위로 검증",
    TARGET_NOT_RESOLVABLE: "드라이버 대상 해석 실패 경로 — 실행 시점 예약",
    SIZE_PREFERENCE_MISMATCH: "sandbox 후보 수준 크기 선호 — 규칙으로 선언되어 있으며 실행 선택 수준은 SELECTED_SIZE_MISMATCH 로 검증",
    SPICY_LEVEL_MISMATCH: "닭강정 후보 수준 맵기 — 규칙으로 선언, 실행 선택 수준은 SELECTED_SPICY_LEVEL_MISMATCH 로 검증",
    BONE_TYPE_MISMATCH: "후보 수준 뼈 유형 — 예약 (실행 선택 수준 코드로 검증)",
    CUP_OPTION_MISMATCH: "후보 수준 컵 옵션 — 예약 (실행 선택 수준 코드로 검증)",
  };

  /** Codes proved by the dedicated Stage-B / review emission tests. */
  const PROVED_ELSEWHERE = [
    "SELECTED_VISIT_TYPE_MISMATCH", "SELECTED_APPOINTMENT_MISMATCH", "SELECTED_DEPARTMENT_MISMATCH",
    "SELECTED_AUTH_METHOD_UNAVAILABLE", "SELECTED_SERVICE_MISMATCH", "SELECTED_SERVICE_TYPE_MISMATCH",
    "SELECTED_SPICY_LEVEL_MISMATCH", "SELECTED_BONE_TYPE_MISMATCH", "SELECTED_CUP_OPTION_MISMATCH",
    "SELECTED_QUANTITY_MISMATCH", "SELECTED_SIZE_MISMATCH",
    "EXECUTION_OPTION_DUPLICATE", "EXECUTION_REQUIRED_OPTION_MISSING",
    "EXECUTION_OPTION_GROUP_UNKNOWN", "EXECUTION_OPTION_VALUE_UNKNOWN",
    "REVIEW_FIELD_UNRESOLVED", "REVIEW_VALUE_LABEL_UNKNOWN", "INVALID_UTC_TIMESTAMP",
    "VISIT_TYPE_MISMATCH", "APPOINTMENT_MISMATCH", "DEPARTMENT_MISMATCH",
    "AUTH_METHOD_UNAVAILABLE", "REQUESTED_SERVICE_MISMATCH", "SERVICE_TYPE_MISMATCH",
    "ALLERGEN_CONFLICT", "PRICE_LIMIT_EXCEEDED", "LOW_CONFIDENCE_RECONFIRMATION_REQUIRED",
  ];

  it("스윕이 실제로 여러 오류코드를 발생시킨다", () => {
    expect(emitted.size).toBeGreaterThan(10);
  });

  it("모든 공식 오류코드가 IMPLEMENTED_AND_TESTED 또는 RESERVED_DOCUMENTED 이다", () => {
    const unclassified = Object.keys(VALIDATION_CODES).filter(
      (code) => !emitted.has(code) && !PROVED_ELSEWHERE.includes(code) && !RESERVED_DOCUMENTED[code]);
    expect(unclassified, `분류되지 않은 오류코드: ${unclassified.join(", ")}`).toEqual([]);
  });

  it("RESERVED 로 분류된 코드에는 이유가 적혀 있다", () => {
    for (const [code, reason] of Object.entries(RESERVED_DOCUMENTED)) {
      expect(reason.length, code).toBeGreaterThan(10);
      expect(Object.keys(VALIDATION_CODES), code).toContain(code);
    }
  });

  it("환경 규칙이 참조하는 errorCode 는 모두 공식 코드다", () => {
    for (const env of ENVS) {
      for (const r of loadEnvironmentPack(env).compatibilityRules.rules) {
        expect(Object.keys(VALIDATION_CODES), `${env}/${r.ruleId}`).toContain(r.errorCode);
      }
    }
  });

  it("맵기·크기 불일치가 SERVICE_TYPE 코드를 재사용하지 않는다", () => {
    for (const env of ENVS) {
      for (const r of loadEnvironmentPack(env).compatibilityRules.rules) {
        if (/SPICY|SIZE|BONE|CUP|QUANTITY/.test(r.ruleId)) {
          expect(r.errorCode, `${env}/${r.ruleId}`).not.toMatch(/^SELECTED_SERVICE_TYPE_MISMATCH$|^SERVICE_TYPE_MISMATCH$/);
        }
      }
    }
  });
});

/* ─────────────────── 환경팩 파일 구조 ─────────────────── */

describe("환경팩 — 선언 파일 존재", () => {
  it("모든 환경에 compatibility-rules.json 과 review-mapping.json 이 있다", () => {
    for (const env of ENVS) {
      const files = readdirSync(path.join(REPO_ROOT, "environments", env));
      expect(files, `${env}`).toContain("compatibility-rules.json");
      expect(files, `${env}`).toContain("review-mapping.json");
    }
  });

  it("규칙 파일이 없으면 환경팩 로딩이 실패한다", () => {
    expect(() => loadEnvironmentPack("does-not-exist")).toThrow();
  });
});
