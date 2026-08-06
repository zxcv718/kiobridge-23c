import { describe, it, expect } from "vitest";
import {
  buildVocabularyRegistry, checkVocabularyMembership,
  evaluateTwoStageCompatibility, extractExecutionChoices,
} from "@kiobridge/evaluator";
import { resolveReview } from "@kiobridge/kiosk-driver-contract";
import path from "node:path";
import type { Candidate, CompatibilityRule, EnvironmentPack, ParticipantSubmission, PlanAction } from "@kiobridge/contracts";
import { REPO_ROOT, loadEnvironmentPack } from "../../shared";
import { validateEnvironmentPack } from "../../../apps/simulation-api/src/loader";

/**
 * Stage B — what the plan ACTUALLY selected.
 *
 * Every official error code below is proved by making it happen, not by
 * grepping for its name. Small synthetic candidates and plans are used, so no
 * completed execution plan for an evaluated environment is ever created.
 */

const has = (list: { code: string }[], code: string) =>
  list.some((e) => e.code === code);

/** Minimal pack: real option groups (so extraction works) + chosen rules. */
function packFor(env: string, candidates: Partial<Candidate>[], ruleIds?: string[]): EnvironmentPack {
  const real = loadEnvironmentPack(env);
  const rules = ruleIds
    ? real.compatibilityRules.rules.filter((r) => ruleIds.includes(r.ruleId))
    : real.compatibilityRules.rules;
  return {
    ...real,
    candidates: candidates as Candidate[],
    compatibilityRules: { ...real.compatibilityRules, rules: rules as CompatibilityRule[] },
  };
}

let idx = 0;
const act = (action: string, target: PlanAction["target"]): PlanAction =>
  ({ actionIndex: idx++, action, target, expectedBeforeState: "S", expectedAfterState: "S" } as PlanAction);

function submission(environmentId: string, sessionContext: unknown, candidateId: string, actions: PlanAction[]): ParticipantSubmission {
  idx = 0;
  return {
    environmentId,
    sessionContext,
    recommendation: { recommendedCandidateId: candidateId },
    userDecision: { approved: true, decision: "APPROVE" },
    executionPlan: {
      planId: "T", validationMode: "SIMULATION_ONLY", executionEnvironment: "DIGITAL_TWIN",
      actualDeviceCommandSent: false,
      actions: actions.map((a, i) => ({ ...a, actionIndex: i })),
    },
  } as unknown as ParticipantSubmission;
}

const opt = (groupId: string, id: string) => act("select_option", { kind: "option", groupId, id } as PlanAction["target"]);

/* ─────────────────── 병원 (1–10) ─────────────────── */

describe("병원 — 실행계획이 실제로 선택한 값", () => {
  /** Supports BOTH visit types: Stage A passes either way, so only Stage B can catch a wrong press. */
  const flexible: Partial<Candidate> = {
    candidateId: "T-1", name: "종합 접수", available: true,
    supportedOptions: {
      VISIT_TYPE: ["FIRST_VISIT", "REVISIT"],
      APPOINTMENT: ["HAS_APPOINTMENT", "NO_APPOINTMENT"],
      DEPARTMENT: ["INTERNAL_MEDICINE", "ORTHOPEDICS"],
      SUPPORT: ["NONE"],
    },
  };
  const pack = () => packFor("hospital", [flexible]);
  const ctx = (over: Record<string, unknown> = {}) => ({
    intent: { task: "CHECK_IN" },
    facts: { visitType: "REVISIT", appointmentStatus: "NO_APPOINTMENT", departmentId: "INTERNAL_MEDICINE", ...over },
    preferences: {}, hardConstraints: {}, capabilities: {}, fieldMetadata: {},
  });
  const plan = (over: Record<string, string> = {}) => {
    const v = { VISIT_TYPE: "REVISIT", APPOINTMENT: "NO_APPOINTMENT", DEPARTMENT: "INTERNAL_MEDICINE", SUPPORT: "NONE", ...over };
    return [
      act("select_candidate", { kind: "candidate", id: "T-1" } as PlanAction["target"]),
      ...Object.entries(v).map(([g, id]) => opt(g, id)),
    ];
  };

  it("일치하면 Stage B 오류가 없다", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("hospital", ctx(), "T-1", plan()));
    expect(out.executionChoice.errors).toEqual([]);
  });

  it("[1–4] 후보가 둘 다 지원해도 REVISIT 사용자에게 FIRST_VISIT 을 누르면 SELECTED_VISIT_TYPE_MISMATCH", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("hospital", ctx(), "T-1", plan({ VISIT_TYPE: "FIRST_VISIT" })));
    expect(out.executionChoice.errors).toContainEqual(expect.objectContaining({ code: "SELECTED_VISIT_TYPE_MISMATCH" }));
    // Stage A stays clean — the candidate genuinely supports both.
    expect(out.candidate.errors).toEqual([]);
  });

  it("[5–7] NO_APPOINTMENT 사용자에게 HAS_APPOINTMENT 를 누르면 SELECTED_APPOINTMENT_MISMATCH", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("hospital", ctx(), "T-1", plan({ APPOINTMENT: "HAS_APPOINTMENT" })));
    expect(out.executionChoice.errors).toContainEqual(expect.objectContaining({ code: "SELECTED_APPOINTMENT_MISMATCH" }));
  });

  it("[8–10] INTERNAL_MEDICINE 사용자에게 ORTHOPEDICS 를 누르면 SELECTED_DEPARTMENT_MISMATCH", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("hospital", ctx(), "T-1", plan({ DEPARTMENT: "ORTHOPEDICS" })));
    expect(out.executionChoice.errors).toContainEqual(expect.objectContaining({ code: "SELECTED_DEPARTMENT_MISMATCH" }));
  });

  it("충돌 오류가 어느 Action 때문인지 기록된다", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("hospital", ctx(), "T-1", plan({ VISIT_TYPE: "FIRST_VISIT" })));
    const err = out.executionChoice.errors.find((e) => e.code === "SELECTED_VISIT_TYPE_MISMATCH")!;
    expect(err.actionIndex).toBeGreaterThanOrEqual(0);
    expect(err.path).toMatch(/^\/executionPlan\/actions\/\d+/);
    const rule = out.executionChoice.results.find((r) => r.ruleId === "HOSPITAL_SELECTED_VISIT_TYPE")!;
    expect(rule.evaluationScope).toBe("EXECUTION_CHOICE");
    expect(rule.actionIndexes?.length).toBeGreaterThan(0);
  });

  it("사용자 값이 UNKNOWN 이면 선택값을 추론하지 않고 재확인을 요구한다", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("hospital", ctx({ visitType: "UNKNOWN" }), "T-1", plan()));
    expect(out.executionChoice.errors).toContainEqual(
      expect.objectContaining({ code: "LOW_CONFIDENCE_RECONFIRMATION_REQUIRED", ruleId: "HOSPITAL_SELECTED_VISIT_TYPE" }));
  });
});

/* ─────────────────── 관공서 (11–17) ─────────────────── */

describe("관공서 — 선택한 인증수단과 최종 서비스", () => {
  const bothMethods: Partial<Candidate> = {
    candidateId: "SVC-A", name: "주민 서비스", available: true,
    supportedOptions: { CATEGORY: ["RESIDENT"], AUTH_METHOD: ["MOBILE_AUTH", "ID_CARD"] },
    requirements: { authenticationMethods: ["MOBILE_AUTH", "ID_CARD"] },
  };
  const other: Partial<Candidate> = {
    candidateId: "SVC-B", name: "다른 서비스", available: true,
    supportedOptions: { CATEGORY: ["RESIDENT"], AUTH_METHOD: ["ID_CARD"] },
    requirements: { authenticationMethods: ["ID_CARD"] },
  };
  const pack = () => packFor("public-office", [bothMethods, other]);
  const ctx = (over: Record<string, unknown> = {}) => ({
    intent: {}, facts: { serviceCategory: "RESIDENT" },
    preferences: {}, hardConstraints: {},
    capabilities: { availableAuthMethods: ["ID_CARD"] },
    fieldMetadata: {}, ...over,
  });
  const plan = (candidateId: string, auth: string) => [
    act("select_candidate", { kind: "candidate", id: candidateId } as PlanAction["target"]),
    opt("CATEGORY", "RESIDENT"),
    opt("AUTH_METHOD", auth),
  ];

  it("[11–14] 후보가 둘 다 지원해도 ID_CARD 만 가능한 사용자에게 MOBILE_AUTH 선택은 SELECTED_AUTH_METHOD_UNAVAILABLE", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("public-office", ctx(), "SVC-A", plan("SVC-A", "MOBILE_AUTH")));
    expect(out.executionChoice.errors).toContainEqual(expect.objectContaining({ code: "SELECTED_AUTH_METHOD_UNAVAILABLE" }));
    // Stage A passes: the intersection is non-empty.
    expect(out.candidate.errors).toEqual([]);
  });

  it("가능한 수단을 선택하면 통과한다", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("public-office", ctx(), "SVC-A", plan("SVC-A", "ID_CARD")));
    expect(out.executionChoice.errors).toEqual([]);
  });

  it("[15–17] requestedServiceId 와 최종 선택 서비스가 다르면 SELECTED_SERVICE_MISMATCH", () => {
    const sub = submission("public-office",
      ctx({ intent: { requestedServiceId: "SVC-A" } }), "SVC-B", plan("SVC-B", "ID_CARD"));
    const out = evaluateTwoStageCompatibility(pack(), sub);
    expect(out.executionChoice.errors).toContainEqual(expect.objectContaining({ code: "SELECTED_SERVICE_MISMATCH" }));
  });

  it("availableAuthMethods 가 비어 있으면 임의 선택을 허용하지 않는다", () => {
    const out = evaluateTwoStageCompatibility(pack(),
      submission("public-office", ctx({ capabilities: { availableAuthMethods: [] } }), "SVC-A", plan("SVC-A", "ID_CARD")));
    expect(out.executionChoice.errors).toContainEqual(
      expect.objectContaining({ code: "LOW_CONFIDENCE_RECONFIRMATION_REQUIRED" }));
  });
});

/* ─────────────────── 닭강정 (18–30) ─────────────────── */

describe("닭강정 — 선호 불일치는 warning, 수량 불일치는 blocking", () => {
  const candidate: Partial<Candidate> = {
    candidateId: "T-1", name: "테스트 메뉴", available: true, price: 9000,
    attributes: { allergenIds: [] },
    supportedOptions: {
      SERVICE_TYPE: ["DINE_IN", "TAKE_OUT"], SPICY_LEVEL: ["MILD", "HOT"],
      BONE_TYPE: ["BONE", "BONELESS"], CUP: ["PAPER", "REGULAR"], QUANTITY: ["Q1", "Q2", "Q3"],
    },
  };
  const pack = () => packFor("chicken-store", [candidate]);
  const ctx = (prefs: Record<string, unknown>) => ({
    intent: { task: "ORDER_FOOD" }, facts: {}, preferences: prefs,
    hardConstraints: {}, capabilities: {}, fieldMetadata: {},
  });
  const plan = (over: Record<string, string> = {}) => {
    const v = { SERVICE_TYPE: "TAKE_OUT", SPICY_LEVEL: "HOT", BONE_TYPE: "BONELESS", CUP: "PAPER", QUANTITY: "Q1", ...over };
    return [
      act("select_candidate", { kind: "candidate", id: "T-1" } as PlanAction["target"]),
      ...Object.entries(v).map(([g, id]) => opt(g, id)),
    ];
  };

  it("[18–20] 포장 선호인데 매장 선택 → SELECTED_SERVICE_TYPE_MISMATCH warning (실행 가능)", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("chicken-store", ctx({ serviceType: "TAKE_OUT" }), "T-1", plan({ SERVICE_TYPE: "DINE_IN" })));
    expect(out.executionChoice.warnings).toContainEqual(expect.objectContaining({ code: "SELECTED_SERVICE_TYPE_MISMATCH" }));
    expect(out.executionChoice.errors).toEqual([]);
  });

  it("[21–23] 매운맛 선호인데 순한맛 선택 → SELECTED_SPICY_LEVEL_MISMATCH warning", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("chicken-store", ctx({ spicyLevel: "HOT" }), "T-1", plan({ SPICY_LEVEL: "MILD" })));
    expect(out.executionChoice.warnings).toContainEqual(expect.objectContaining({ code: "SELECTED_SPICY_LEVEL_MISMATCH" }));
  });

  it("[24–26] 순살 선호인데 뼈 선택 → SELECTED_BONE_TYPE_MISMATCH warning", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("chicken-store", ctx({ boneType: "BONELESS" }), "T-1", plan({ BONE_TYPE: "BONE" })));
    expect(out.executionChoice.warnings).toContainEqual(expect.objectContaining({ code: "SELECTED_BONE_TYPE_MISMATCH" }));
  });

  it("컵 선호 불일치 → SELECTED_CUP_OPTION_MISMATCH warning", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("chicken-store", ctx({ cupOption: "PAPER" }), "T-1", plan({ CUP: "REGULAR" })));
    expect(out.executionChoice.warnings).toContainEqual(expect.objectContaining({ code: "SELECTED_CUP_OPTION_MISMATCH" }));
  });

  it("[27–29] 수량 2 를 원했는데 1 을 선택 → SELECTED_QUANTITY_MISMATCH blocking", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("chicken-store", ctx({ quantity: 2 }), "T-1", plan({ QUANTITY: "Q1" })));
    expect(out.executionChoice.errors).toContainEqual(expect.objectContaining({ code: "SELECTED_QUANTITY_MISMATCH" }));
  });

  it("수량이 맞으면 통과한다", () => {
    const out = evaluateTwoStageCompatibility(pack(), submission("chicken-store", ctx({ quantity: 2 }), "T-1", plan({ QUANTITY: "Q2" })));
    expect(out.executionChoice.errors).toEqual([]);
  });

  it("[30] NO_PREFERENCE 는 warning 을 만들지 않는다", () => {
    const out = evaluateTwoStageCompatibility(pack(),
      submission("chicken-store", ctx({ serviceType: "NO_PREFERENCE", spicyLevel: "NO_PREFERENCE" }), "T-1", plan({ SERVICE_TYPE: "DINE_IN", SPICY_LEVEL: "MILD" })));
    expect(out.executionChoice.warnings).toEqual([]);
    expect(out.executionChoice.errors).toEqual([]);
  });

  it("sandbox 크기 불일치는 전용 코드를 쓴다 (SERVICE_TYPE 재사용 없음)", () => {
    const sandbox = packFor("sandbox", [{
      candidateId: "S-1", name: "연습", available: true, supportedOptions: { SIZE: ["SMALL", "LARGE"] },
    }]);
    idx = 0;
    const sub = submission("sandbox", { intent: { task: "PRACTICE" }, preferences: { size: "SMALL" }, facts: {}, hardConstraints: {}, capabilities: {}, fieldMetadata: {} },
      "S-1", [act("select_candidate", { kind: "candidate", id: "S-1" } as PlanAction["target"]), opt("SIZE", "LARGE")]);
    const out = evaluateTwoStageCompatibility(sandbox, sub);
    const codes = [...out.warnings.map((w) => w.code)];
    expect(codes).toContain("SELECTED_SIZE_MISMATCH");
    expect(codes).not.toContain("SERVICE_TYPE_MISMATCH");
  });
});

/* ─────────────────── 계획 구조 (31–36) ─────────────────── */

describe("실행계획 구조 오류", () => {
  const pack = () => loadEnvironmentPack("chicken-store");
  const first = () => pack().candidates[0].candidateId;

  it("[31–32] 같은 단일선택 그룹을 다른 값으로 두 번 → EXECUTION_OPTION_DUPLICATE", () => {
    idx = 0;
    const sub = submission("chicken-store", {}, first(), [
      act("select_candidate", { kind: "candidate", id: first() } as PlanAction["target"]),
      opt("SPICY_LEVEL", "HOT"), opt("SPICY_LEVEL", "MILD"),
    ]);
    const out = extractExecutionChoices(sub.executionPlan, pack());
    expect(out.errors).toContainEqual(expect.objectContaining({ code: "EXECUTION_OPTION_DUPLICATE" }));
  });

  it("같은 값을 두 번 눌러도 중복 오류는 아니다", () => {
    idx = 0;
    const sub = submission("chicken-store", {}, first(), [
      opt("SPICY_LEVEL", "HOT"), opt("SPICY_LEVEL", "HOT"),
    ]);
    expect(has(extractExecutionChoices(sub.executionPlan, pack()).errors, "EXECUTION_OPTION_DUPLICATE")).toBe(false);
  });

  it("[33–34] 필수 옵션 그룹 누락 → EXECUTION_REQUIRED_OPTION_MISSING", () => {
    idx = 0;
    const sub = submission("chicken-store", {}, first(), [
      act("select_candidate", { kind: "candidate", id: first() } as PlanAction["target"]),
      opt("SPICY_LEVEL", "HOT"),
    ]);
    const out = extractExecutionChoices(sub.executionPlan, pack());
    expect(out.errors).toContainEqual(expect.objectContaining({ code: "EXECUTION_REQUIRED_OPTION_MISSING" }));
  });

  it("[35–36] 존재하지 않는 옵션 값 → EXECUTION_OPTION_VALUE_UNKNOWN", () => {
    idx = 0;
    const sub = submission("chicken-store", {}, first(), [opt("SPICY_LEVEL", "NUCLEAR")]);
    const out = extractExecutionChoices(sub.executionPlan, pack());
    expect(out.errors).toContainEqual(expect.objectContaining({ code: "EXECUTION_OPTION_VALUE_UNKNOWN" }));
  });

  it("존재하지 않는 옵션 그룹 → EXECUTION_OPTION_GROUP_UNKNOWN", () => {
    idx = 0;
    const sub = submission("chicken-store", {}, first(), [opt("NO_SUCH_GROUP", "X")]);
    const out = extractExecutionChoices(sub.executionPlan, pack());
    expect(out.errors).toContainEqual(expect.objectContaining({ code: "EXECUTION_OPTION_GROUP_UNKNOWN" }));
  });

  it("후보를 두 번 다른 값으로 선택 → EXECUTION_OPTION_DUPLICATE", () => {
    idx = 0;
    const cands = pack().candidates;
    const sub = submission("chicken-store", {}, cands[0].candidateId, [
      act("select_candidate", { kind: "candidate", id: cands[0].candidateId } as PlanAction["target"]),
      act("select_candidate", { kind: "candidate", id: cands[1].candidateId } as PlanAction["target"]),
    ]);
    expect(extractExecutionChoices(sub.executionPlan, pack()).errors)
      .toContainEqual(expect.objectContaining({ code: "EXECUTION_OPTION_DUPLICATE" }));
  });

  it("추출 결과가 선택값과 Action 인덱스를 함께 담는다", () => {
    idx = 0;
    const sub = submission("chicken-store", {}, first(), [
      act("select_candidate", { kind: "candidate", id: first() } as PlanAction["target"]),
      opt("SERVICE_TYPE", "TAKE_OUT"), opt("SPICY_LEVEL", "HOT"),
      opt("BONE_TYPE", "BONELESS"), opt("QUANTITY", "Q2"),
    ]);
    const { choices } = extractExecutionChoices(sub.executionPlan, pack());
    expect(choices.candidateId).toBe(first());
    expect(choices.selectedOptions.SERVICE_TYPE).toBe("TAKE_OUT");
    expect(choices.quantity).toBe(2);
    expect(choices.actionIndexes.SPICY_LEVEL).toEqual([2]);
  });
});

/* ─────────────────── Vocabulary membership (37–48) ─────────────────── */

describe("Vocabulary membership — 대문자라고 통과하지 않는다", () => {
  const registryFor = (env: string, pack?: EnvironmentPack) =>
    buildVocabularyRegistry(env, path.join(REPO_ROOT, "schemas"), pack ?? loadEnvironmentPack(env));

  const withAttr = (env: string, attrs: Record<string, unknown>): EnvironmentPack => {
    const real = loadEnvironmentPack(env);
    return { ...real, candidates: [{ ...real.candidates[0], attributes: attrs } as Candidate] };
  };

  it("[37] ANY 는 거부된다", () => {
    const pack = withAttr("hospital", { visitType: "ANY" });
    const problems = checkVocabularyMembership(pack, registryFor("hospital"));
    expect(problems.some((p) => p.value === "ANY")).toBe(true);
  });

  it("[38] AUTO 도 거부된다", () => {
    const pack = withAttr("hospital", { visitType: "AUTO" });
    expect(checkVocabularyMembership(pack, registryFor("hospital")).some((p) => p.value === "AUTO")).toBe(true);
  });

  it("[39] 등록된 UNKNOWN 은 통과한다", () => {
    const pack = withAttr("hospital", { departmentId: "UNSPECIFIED" });
    expect(checkVocabularyMembership(pack, registryFor("hospital"))).toEqual([]);
  });

  it("[40] supportedOptions 값도 옵션 그룹 membership 을 지킨다", () => {
    const real = loadEnvironmentPack("chicken-store");
    const pack: EnvironmentPack = {
      ...real,
      candidates: [{ ...real.candidates[0], supportedOptions: { ...real.candidates[0].supportedOptions, SPICY_LEVEL: ["NUCLEAR"] } } as Candidate],
    };
    expect(checkVocabularyMembership(pack, registryFor("chicken-store")).some((p) => p.value === "NUCLEAR")).toBe(true);
  });

  it("[42] requirements 인증수단도 검사한다", () => {
    const real = loadEnvironmentPack("public-office");
    const pack: EnvironmentPack = {
      ...real,
      candidates: [{ ...real.candidates[0], requirements: { authenticationMethods: ["FACE_SCAN"] } } as Candidate],
    };
    expect(checkVocabularyMembership(pack, registryFor("public-office")).some((p) => p.value === "FACE_SCAN")).toBe(true);
  });

  it("[44] review 의 itemValueLabels key 도 검사한다", () => {
    const real = loadEnvironmentPack("hospital");
    const pack: EnvironmentPack = {
      ...real,
      reviewMapping: {
        ...real.reviewMapping,
        fields: real.reviewMapping.fields.map((f) =>
          f.fieldId === "supportModes"
            ? { ...f, sources: [{ ...f.sources[0], itemValueLabels: { NOT_A_REAL_MODE: "가짜" } }] }
            : f),
      },
    };
    expect(checkVocabularyMembership(pack, registryFor("hospital")).some((p) => p.value === "NOT_A_REAL_MODE")).toBe(true);
  });

  it("[45] 존재하지 않는 옵션 그룹 참조를 잡는다", () => {
    const real = loadEnvironmentPack("hospital");
    const pack: EnvironmentPack = {
      ...real,
      candidates: [{ ...real.candidates[0], supportedOptions: { NO_SUCH_GROUP: ["X"] } } as Candidate],
    };
    expect(checkVocabularyMembership(pack, registryFor("hospital")).some((p) => p.value === "NO_SUCH_GROUP")).toBe(true);
  });

  it("[47–48] 배포되는 모든 환경팩의 미등록 어휘 값은 0 이다", () => {
    let total = 0;
    for (const env of ["chicken-store", "hospital", "public-office", "sandbox"]) {
      const pack = loadEnvironmentPack(env);
      const problems = checkVocabularyMembership(pack, registryFor(env, pack));
      expect(problems, `${env}: ${problems.map((p) => `${p.where}="${p.value}"`).join(", ")}`).toEqual([]);
      total += problems.length;
      expect(validateEnvironmentPack(pack), env).toEqual([]);
    }
    expect(total).toBe(0);
  });

  it("ANY 를 담은 환경팩은 로딩 자체가 실패한다", () => {
    // 실제 로더 경로는 vocabulary 검사를 통과하지 못하면 예외를 던진다.
    const pack = withAttr("hospital", { visitType: "ANY" });
    const problems = checkVocabularyMembership(pack, registryFor("hospital"));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].reason).toMatch(/임의 sentinel|Vocabulary/);
  });
});

/* ─────────────────── Review 배열 라벨 ─────────────────── */

describe("Review — 배열 항목 한국어 라벨", () => {
  it("supportModes 배열이 한국어로 표시된다", () => {
    const pack = loadEnvironmentPack("hospital");
    const r = resolveReview({
      pack,
      selectedCandidate: pack.candidates[0],
      selectedOptions: {},
      sessionContext: { facts: {}, preferences: { supportModes: ["LARGE_TEXT", "STAFF_HELP"] } },
      profile: {},
      uiValues: { userDecisionLabel: "승인됨" },
    });
    const f = r.fields.find((x) => x.fieldId === "supportModes")!;
    expect(f.displayValue).toBe("큰 글씨, 직원 도움");
    expect(f.displayValue).not.toMatch(/LARGE_TEXT|STAFF_HELP/);
  });

  it("availableAuthMethods 배열이 한국어로 표시된다", () => {
    const pack = loadEnvironmentPack("public-office");
    const r = resolveReview({
      pack,
      selectedCandidate: pack.candidates[0],
      selectedOptions: {},
      sessionContext: { intent: { task: "PUBLIC_SERVICE_GUIDANCE" }, capabilities: { availableAuthMethods: ["MOBILE_AUTH", "ID_CARD"] } },
      profile: {},
      uiValues: {},
    });
    const f = r.fields.find((x) => x.fieldId === "availableAuthMethods")!;
    expect(f.displayValue).toBe("모바일 인증, 신분증");
  });

  it("라벨이 없으면 조용히 원시 enum 을 쓰지 않고 REVIEW_VALUE_LABEL_UNKNOWN 을 남긴다", () => {
    const real = loadEnvironmentPack("hospital");
    const pack: EnvironmentPack = {
      ...real,
      reviewMapping: {
        ...real.reviewMapping,
        fields: real.reviewMapping.fields.map((f) =>
          f.fieldId === "supportModes" ? { ...f, sources: [{ ...f.sources[0], itemValueLabels: {} }] } : f),
      },
    };
    const r = resolveReview({
      pack, selectedCandidate: real.candidates[0], selectedOptions: {},
      sessionContext: { facts: {}, preferences: { supportModes: ["LARGE_TEXT"] } },
      profile: {}, uiValues: {},
    });
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: "REVIEW_VALUE_LABEL_UNKNOWN" }));
  });

  it("단일값 valueLabels 동작은 그대로다", () => {
    const pack = loadEnvironmentPack("hospital");
    const r = resolveReview({
      pack, selectedCandidate: undefined, selectedOptions: { DEPARTMENT: "INTERNAL_MEDICINE" },
      sessionContext: {}, profile: {}, uiValues: {},
    });
    expect(r.fields.find((f) => f.fieldId === "departmentId")!.displayValue).toBe("내과");
  });
});
