import { describe, it, expect } from "vitest";
import { evaluateCompatibility } from "@kiobridge/evaluator";
import type { Candidate, CompatibilityRule, EnvironmentPack, ParticipantSubmission } from "@kiobridge/contracts";
import { loadEnvironmentPack } from "../../shared";

/**
 * Domain compatibility is tested with SMALL synthetic candidates and contexts,
 * plus the real rule files. No completed execution plan for an evaluated
 * environment is ever constructed here — that remains the participant's work.
 */

/** Minimal pack carrying only what the compatibility engine reads. */
function packWith(environmentId: string, candidates: Partial<Candidate>[], rules: CompatibilityRule[]): EnvironmentPack {
  return {
    manifest: { environmentId } as EnvironmentPack["manifest"],
    screens: [], optionGroups: [], transitions: [], safetyRules: [],
    candidates: candidates as Candidate[],
    compatibilityRules: { version: "1.0.0", environmentId: environmentId as never, rules },
    reviewMapping: { version: "1.0.0", environmentId: environmentId as never, fields: [] },
    bindings: { simulation: { driver: "SIMULATION", screens: {} }, uprlite: { driver: "UPRLITE", status: "PENDING_REAL_DEVICE", controls: {} } },
  } as EnvironmentPack;
}

const subWith = (environmentId: string, recommendedCandidateId: string, sessionContext: unknown): ParticipantSubmission =>
  ({ environmentId, recommendation: { recommendedCandidateId }, sessionContext } as unknown as ParticipantSubmission);

/** Rules as actually declared by the shipped environment packs. */
const rulesOf = (env: string) => loadEnvironmentPack(env).compatibilityRules.rules;
const ruleById = (env: string, id: string) => rulesOf(env).find((r) => r.ruleId === id)!;

const codes = (o: { errors: { code: string }[] }) => o.errors.map((e) => e.code);
const warnCodes = (o: { warnings: { code: string }[] }) => o.warnings.map((e) => e.code);

/* ───────────────────────────── 병원 (1–9) ───────────────────────────── */

describe("병원 — 방문유형 · 예약 · 진료과 호환성", () => {
  const visitRule = () => ruleById("hospital", "HOSPITAL_VISIT_TYPE_COMPATIBILITY");
  const apptRule = () => ruleById("hospital", "HOSPITAL_APPOINTMENT_COMPATIBILITY");
  const deptRule = () => ruleById("hospital", "HOSPITAL_DEPARTMENT_COMPATIBILITY");

  const hospitalPack = (supported: Record<string, string[]>) =>
    packWith("hospital", [{ candidateId: "T-1", name: "테스트 접수", available: true, supportedOptions: supported }],
      [visitRule(), apptRule(), deptRule()]);

  it("[1] REVISIT 사용자 + REVISIT 후보 → 통과", () => {
    const pack = hospitalPack({ VISIT_TYPE: ["REVISIT"], APPOINTMENT: ["HAS_APPOINTMENT"], DEPARTMENT: ["INTERNAL_MEDICINE"] });
    const out = evaluateCompatibility(pack, subWith("hospital", "T-1", {
      facts: { visitType: "REVISIT", appointmentStatus: "HAS_APPOINTMENT", departmentId: "INTERNAL_MEDICINE" },
    }));
    expect(codes(out)).toEqual([]);
  });

  it("[2] FIRST_VISIT 사용자 + REVISIT 전용 후보 → VISIT_TYPE_MISMATCH", () => {
    const pack = hospitalPack({ VISIT_TYPE: ["REVISIT"], APPOINTMENT: ["HAS_APPOINTMENT"], DEPARTMENT: ["INTERNAL_MEDICINE"] });
    const out = evaluateCompatibility(pack, subWith("hospital", "T-1", {
      facts: { visitType: "FIRST_VISIT", appointmentStatus: "HAS_APPOINTMENT", departmentId: "INTERNAL_MEDICINE" },
    }));
    expect(codes(out)).toContain("VISIT_TYPE_MISMATCH");
  });

  it("[3] NO_APPOINTMENT 사용자 + 예약필수 후보 → APPOINTMENT_MISMATCH", () => {
    const pack = hospitalPack({ VISIT_TYPE: ["REVISIT"], APPOINTMENT: ["HAS_APPOINTMENT"], DEPARTMENT: ["INTERNAL_MEDICINE"] });
    const out = evaluateCompatibility(pack, subWith("hospital", "T-1", {
      facts: { visitType: "REVISIT", appointmentStatus: "NO_APPOINTMENT", departmentId: "INTERNAL_MEDICINE" },
    }));
    expect(codes(out)).toContain("APPOINTMENT_MISMATCH");
  });

  it("[4] HAS_APPOINTMENT 사용자 + 예약 후보 → 통과", () => {
    const pack = hospitalPack({ VISIT_TYPE: ["EXAM"], APPOINTMENT: ["HAS_APPOINTMENT"], DEPARTMENT: ["RADIOLOGY"] });
    const out = evaluateCompatibility(pack, subWith("hospital", "T-1", {
      facts: { visitType: "EXAM", appointmentStatus: "HAS_APPOINTMENT", departmentId: "RADIOLOGY" },
    }));
    expect(codes(out)).toEqual([]);
  });

  it("[5] departmentId 일치 → 통과", () => {
    const pack = hospitalPack({ VISIT_TYPE: ["FIRST_VISIT"], APPOINTMENT: ["NO_APPOINTMENT"], DEPARTMENT: ["ORTHOPEDICS"] });
    const out = evaluateCompatibility(pack, subWith("hospital", "T-1", {
      facts: { visitType: "FIRST_VISIT", appointmentStatus: "NO_APPOINTMENT", departmentId: "ORTHOPEDICS" },
    }));
    expect(codes(out)).toEqual([]);
  });

  it("[6] departmentId 불일치 → DEPARTMENT_MISMATCH", () => {
    const pack = hospitalPack({ VISIT_TYPE: ["FIRST_VISIT"], APPOINTMENT: ["NO_APPOINTMENT"], DEPARTMENT: ["ORTHOPEDICS"] });
    const out = evaluateCompatibility(pack, subWith("hospital", "T-1", {
      facts: { visitType: "FIRST_VISIT", appointmentStatus: "NO_APPOINTMENT", departmentId: "INTERNAL_MEDICINE" },
    }));
    expect(codes(out)).toContain("DEPARTMENT_MISMATCH");
  });

  it("[7] departmentId UNKNOWN → 재확인 요구 (임의 추론 금지)", () => {
    const pack = hospitalPack({ VISIT_TYPE: ["FIRST_VISIT"], APPOINTMENT: ["NO_APPOINTMENT"], DEPARTMENT: ["ORTHOPEDICS"] });
    const out = evaluateCompatibility(pack, subWith("hospital", "T-1", {
      facts: { visitType: "FIRST_VISIT", appointmentStatus: "NO_APPOINTMENT", departmentId: "UNKNOWN" },
    }));
    expect(codes(out)).toContain("LOW_CONFIDENCE_RECONFIRMATION_REQUIRED");
    const issue = out.errors.find((e) => e.code === "LOW_CONFIDENCE_RECONFIRMATION_REQUIRED")!;
    expect(issue.path).toBe("/sessionContext/facts/departmentId");
    expect(issue.ruleId).toBe("HOSPITAL_DEPARTMENT_COMPATIBILITY");
    expect(issue.receivedValue).toBe("UNKNOWN");
  });

  it("[8] UNKNOWN 이어도 UNSPECIFIED(직원 안내) 후보는 재확인 없이 허용 — 진료과를 추론하지 않는다", () => {
    const pack = hospitalPack({ VISIT_TYPE: ["FIRST_VISIT", "REVISIT"], APPOINTMENT: ["NO_APPOINTMENT"], DEPARTMENT: ["UNSPECIFIED"] });
    const out = evaluateCompatibility(pack, subWith("hospital", "T-1", {
      facts: { visitType: "REVISIT", appointmentStatus: "NO_APPOINTMENT", departmentId: "UNKNOWN" },
    }));
    expect(codes(out)).toEqual([]);
    const dept = out.results.find((r) => r.ruleId === "HOSPITAL_DEPARTMENT_COMPATIBILITY")!;
    expect(dept.result).toBe("PASS");
    // 어떤 특정 진료과도 만들어내지 않았다.
    expect(JSON.stringify(out)).not.toMatch(/INTERNAL_MEDICINE|ORTHOPEDICS|RADIOLOGY/);
  });

  it("[9] 엔진은 진단·응급도 같은 의료 판단 정보를 생성하지 않는다", () => {
    const pack = hospitalPack({ VISIT_TYPE: ["REVISIT"], APPOINTMENT: ["HAS_APPOINTMENT"], DEPARTMENT: ["INTERNAL_MEDICINE"] });
    const out = evaluateCompatibility(pack, subWith("hospital", "T-1", {
      facts: { visitType: "REVISIT", appointmentStatus: "HAS_APPOINTMENT", departmentId: "INTERNAL_MEDICINE" },
    }));
    expect(JSON.stringify(out)).not.toMatch(/진단|증상|응급|triage|diagnos/i);
  });

  it("낮은 confidence + 미확인 은 UNKNOWN 과 동일하게 재확인을 요구한다", () => {
    const pack = hospitalPack({ VISIT_TYPE: ["REVISIT"], APPOINTMENT: ["HAS_APPOINTMENT"], DEPARTMENT: ["INTERNAL_MEDICINE"] });
    const out = evaluateCompatibility(pack, subWith("hospital", "T-1", {
      facts: { visitType: "REVISIT", appointmentStatus: "HAS_APPOINTMENT", departmentId: "INTERNAL_MEDICINE" },
      fieldMetadata: { "/facts/appointmentStatus": { source: "CHATBOT", confidence: 0.3, confirmedByUser: false } },
    }));
    expect(codes(out)).toContain("LOW_CONFIDENCE_RECONFIRMATION_REQUIRED");
  });
});

/* ───────────────────────────── 관공서 (10–16) ───────────────────────────── */

describe("관공서 — 인증수단 교집합 · 요청 서비스", () => {
  const authRule = () => ruleById("public-office", "PUBLIC_OFFICE_AUTH_METHOD_INTERSECTION");
  const catRule = () => ruleById("public-office", "PUBLIC_OFFICE_SERVICE_CATEGORY_COMPATIBILITY");
  const svcRule = () => ruleById("public-office", "PUBLIC_OFFICE_REQUESTED_SERVICE_MATCH");

  const officePack = (requirements: string[], category = "RESIDENT", id = "T-1") =>
    packWith("public-office", [{
      candidateId: id, name: "테스트 민원", available: true,
      supportedOptions: { CATEGORY: [category] },
      requirements: { authenticationMethods: requirements },
    }], [authRule(), catRule(), svcRule()]);

  it("[10] 교집합이 있으면 통과", () => {
    const out = evaluateCompatibility(officePack(["MOBILE_AUTH", "ID_CARD"]), subWith("public-office", "T-1", {
      intent: {}, facts: { serviceCategory: "RESIDENT" }, capabilities: { availableAuthMethods: ["ID_CARD"] },
    }));
    expect(codes(out)).toEqual([]);
  });

  it("[11] 교집합이 0개면 AUTH_METHOD_UNAVAILABLE", () => {
    const out = evaluateCompatibility(officePack(["MOBILE_AUTH"]), subWith("public-office", "T-1", {
      intent: {}, facts: { serviceCategory: "RESIDENT" }, capabilities: { availableAuthMethods: ["ID_CARD"] },
    }));
    expect(codes(out)).toContain("AUTH_METHOD_UNAVAILABLE");
    const issue = out.errors.find((e) => e.code === "AUTH_METHOD_UNAVAILABLE")!;
    expect(issue.allowedValues).toEqual(["MOBILE_AUTH"]);
  });

  it("[12] STAFF_ASSIST 후보는 인증수단과 무관하게 허용된다", () => {
    const out = evaluateCompatibility(officePack(["STAFF_ASSIST"], "STAFF"), subWith("public-office", "T-1", {
      intent: {}, facts: { serviceCategory: "RESIDENT" }, capabilities: { availableAuthMethods: [] },
    }));
    expect(codes(out)).not.toContain("AUTH_METHOD_UNAVAILABLE");
  });

  it("[13] availableAuthMethods 가 UNKNOWN/빈배열/누락이면 재확인", () => {
    for (const capabilities of [{ availableAuthMethods: ["UNKNOWN"] }, { availableAuthMethods: [] }, {}]) {
      const out = evaluateCompatibility(officePack(["MOBILE_AUTH"]), subWith("public-office", "T-1", {
        intent: {}, facts: { serviceCategory: "RESIDENT" }, capabilities,
      }));
      expect(codes(out), JSON.stringify(capabilities)).toContain("LOW_CONFIDENCE_RECONFIRMATION_REQUIRED");
    }
  });

  it("[14] requestedServiceId 가 추천 후보와 같으면 통과", () => {
    const out = evaluateCompatibility(officePack(["ID_CARD"]), subWith("public-office", "T-1", {
      intent: { requestedServiceId: "T-1" }, facts: { serviceCategory: "RESIDENT" },
      capabilities: { availableAuthMethods: ["ID_CARD"] },
    }));
    expect(codes(out)).toEqual([]);
  });

  it("[15] requestedServiceId 불일치 → REQUESTED_SERVICE_MISMATCH", () => {
    const out = evaluateCompatibility(officePack(["ID_CARD"]), subWith("public-office", "T-1", {
      intent: { requestedServiceId: "T-9" }, facts: { serviceCategory: "RESIDENT" },
      capabilities: { availableAuthMethods: ["ID_CARD"] },
    }));
    expect(codes(out)).toContain("REQUESTED_SERVICE_MISMATCH");
  });

  it("[16] 엔진은 법적 자격이나 수급 가능성을 판단하지 않는다", () => {
    const out = evaluateCompatibility(officePack(["ID_CARD"]), subWith("public-office", "T-1", {
      intent: {}, facts: { serviceCategory: "RESIDENT" }, capabilities: { availableAuthMethods: ["ID_CARD"] },
    }));
    expect(JSON.stringify(out)).not.toMatch(/자격|수급|eligib|entitle/i);
  });
});

/* ───────────────────────────── 닭강정 (17–22) ───────────────────────────── */

describe("닭강정 — 하드 제약과 소프트 선호", () => {
  const rules = () => rulesOf("chicken-store");
  const chickenPack = (candidate: Partial<Candidate>) =>
    packWith("chicken-store", [{ candidateId: "T-1", name: "테스트 메뉴", available: true, ...candidate }], rules());

  it("[17] 알레르기 충돌 → ALLERGEN_CONFLICT (BLOCK)", () => {
    const pack = chickenPack({ attributes: { allergenIds: ["PEANUT"] }, supportedOptions: { SERVICE_TYPE: ["TAKE_OUT"] }, price: 9000 });
    const out = evaluateCompatibility(pack, subWith("chicken-store", "T-1", {
      preferences: {}, hardConstraints: { allergenIds: ["PEANUT"] },
    }));
    expect(codes(out)).toContain("ALLERGEN_CONFLICT");
  });

  it("알레르기가 겹치지 않으면 통과", () => {
    const pack = chickenPack({ attributes: { allergenIds: ["SOY"] }, supportedOptions: { SERVICE_TYPE: ["TAKE_OUT"] }, price: 9000 });
    const out = evaluateCompatibility(pack, subWith("chicken-store", "T-1", {
      preferences: {}, hardConstraints: { allergenIds: ["PEANUT"] },
    }));
    expect(codes(out)).not.toContain("ALLERGEN_CONFLICT");
  });

  it("[18] 가격상한 초과 → PRICE_LIMIT_EXCEEDED", () => {
    const pack = chickenPack({ attributes: { allergenIds: [] }, supportedOptions: { SERVICE_TYPE: ["TAKE_OUT"] }, price: 20000 });
    const out = evaluateCompatibility(pack, subWith("chicken-store", "T-1", {
      preferences: {}, hardConstraints: { allergenIds: [], maxPriceKrw: 10000 },
    }));
    expect(codes(out)).toContain("PRICE_LIMIT_EXCEEDED");
  });

  it("가격상한 이내면 통과", () => {
    const pack = chickenPack({ attributes: { allergenIds: [] }, supportedOptions: { SERVICE_TYPE: ["TAKE_OUT"] }, price: 9000 });
    const out = evaluateCompatibility(pack, subWith("chicken-store", "T-1", {
      preferences: {}, hardConstraints: { allergenIds: [], maxPriceKrw: 10000 },
    }));
    expect(codes(out)).toEqual([]);
  });

  it("[20] serviceType 불일치는 WARNING (실행은 가능)", () => {
    const pack = chickenPack({ attributes: { allergenIds: [] }, supportedOptions: { SERVICE_TYPE: ["DINE_IN"] }, price: 9000 });
    const out = evaluateCompatibility(pack, subWith("chicken-store", "T-1", {
      preferences: { serviceType: "TAKE_OUT" }, hardConstraints: {},
    }));
    expect(codes(out)).toEqual([]);
    expect(warnCodes(out)).toContain("SERVICE_TYPE_MISMATCH");
  });

  it("[21] 환경이 같은 규칙을 BLOCK 으로 선언하면 실패한다", () => {
    const blocking = rules().map((r) =>
      r.ruleId === "CHICKEN_SERVICE_TYPE_PREFERENCE" ? { ...r, severity: "BLOCK" as const } : r);
    const pack = packWith("chicken-store",
      [{ candidateId: "T-1", name: "테스트", available: true, attributes: { allergenIds: [] }, supportedOptions: { SERVICE_TYPE: ["DINE_IN"] }, price: 9000 }],
      blocking);
    const out = evaluateCompatibility(pack, subWith("chicken-store", "T-1", {
      preferences: { serviceType: "TAKE_OUT" }, hardConstraints: {},
    }));
    expect(codes(out)).toContain("SERVICE_TYPE_MISMATCH");
    expect(warnCodes(out)).toEqual([]);
  });

  it("[22] NO_PREFERENCE 는 경고를 만들지 않는다", () => {
    const pack = chickenPack({ attributes: { allergenIds: [] }, supportedOptions: { SERVICE_TYPE: ["DINE_IN"] }, price: 9000 });
    const out = evaluateCompatibility(pack, subWith("chicken-store", "T-1", {
      preferences: { serviceType: "NO_PREFERENCE" }, hardConstraints: {},
    }));
    expect(codes(out)).toEqual([]);
    expect(warnCodes(out)).toEqual([]);
    expect(out.results.find((r) => r.ruleId === "CHICKEN_SERVICE_TYPE_PREFERENCE")!.result).toBe("SKIPPED");
  });
});

/* ───────────────────── 실행 순서 · Evidence 기록 ───────────────────── */

describe("엔진 동작 규약", () => {
  it("추천 후보가 없으면 규칙을 실행하지 않는다 (앞 단계가 이미 보고함)", () => {
    const pack = loadEnvironmentPack("hospital");
    const out = evaluateCompatibility(pack, subWith("hospital", null as unknown as string, { facts: {} }));
    expect(out.results).toEqual([]);
    expect(out.errors).toEqual([]);
  });

  it("모든 규칙 결과가 Evidence 용으로 기록된다", () => {
    const pack = loadEnvironmentPack("hospital");
    const first = pack.candidates[0];
    const out = evaluateCompatibility(pack, subWith("hospital", first.candidateId, {
      facts: {
        visitType: first.supportedOptions!.VISIT_TYPE[0],
        appointmentStatus: first.supportedOptions!.APPOINTMENT[0],
        departmentId: first.supportedOptions!.DEPARTMENT[0],
      },
    }));
    expect(out.results.length).toBe(pack.compatibilityRules.rules.length);
    for (const r of out.results) expect(["PASS", "FAIL", "WARN", "RECONFIRM", "SKIPPED"]).toContain(r.result);
  });
});
