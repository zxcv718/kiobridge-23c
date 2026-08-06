/**
 * 시나리오 스위트 — 비공개 프로필 채점 대비.
 * 공개 예제 3종 재현 + 경계 케이스. "그럴듯한 어떤 프로필에서도 무너지지 않는 추천"이 목표.
 */
import { describe, it, expect } from "vitest";
import { buildRecommendation, explainCore, type EngineContext } from "../src/core/engine";
import { buildExecutionPlanCore } from "../src/core/plan";
import { loadChickenFixture, loadPublicExample } from "./helpers";

const fx = loadChickenFixture();

/** 공개 예제의 sessionContext를 엔진 컨텍스트로 변환 */
const fromExample = (name: string): EngineContext => {
  const ex = loadPublicExample(name);
  return {
    preferences: ex.sessionContext?.preferences ?? {},
    hardConstraints: ex.sessionContext?.hardConstraints ?? {},
    fieldMetadata: ex.sessionContext?.fieldMetadata ?? {},
  };
};

describe("공개 예제 재현 (examples/public-canonical-input/chicken-store)", () => {
  it("allergy-aware: 땅콩 알레르기 후보(CHICKEN-005)를 제외하고도 추천을 만든다", () => {
    const ctx = fromExample("allergy-aware");
    const rec = buildRecommendation(fx.candidates, ctx);
    expect(rec.recommendedCandidateId).not.toBeNull();
    expect(rec.recommendedCandidateId).not.toBe("CHICKEN-005");
    expect(rec.excludedCandidates.map((e) => e.candidateId)).toContain("CHICKEN-005");
    expect(rec.requiresReconfirmation).toBe(false);
  });

  it("takeout-hot-boneless: 포장·매운맛·순살 → CHICKEN-001", () => {
    const ctx = fromExample("takeout-hot-boneless");
    const rec = buildRecommendation(fx.candidates, ctx);
    expect(rec.recommendedCandidateId).toBe("CHICKEN-001");
  });

  it("unknown-allergen-needs-reconfirm: UNKNOWN 알레르기 → 임의 추론 없이 재확인 요구", () => {
    const ctx = fromExample("unknown-allergen-needs-reconfirm");
    const rec = buildRecommendation(fx.candidates, ctx);
    expect(rec.requiresReconfirmation).toBe(true);
    // 이 상태로는 승인/제출하지 않는 것이 정책 — 실행계획도 만들지 않는다
    const plan = buildExecutionPlanCore({ approved: false, decision: "REJECT" }, rec, fx, ctx);
    expect(plan.actions).toEqual([]);
  });
});

describe("경계 케이스", () => {
  it("예산 5,500원 → 매운 뼈(CHICKEN-003)만 생존, 추천된다", () => {
    const ctx: EngineContext = { preferences: {}, hardConstraints: { allergenIds: [], maxPriceKrw: 5500 } };
    const rec = buildRecommendation(fx.candidates, ctx);
    expect(rec.recommendedCandidateId).toBe("CHICKEN-003");
    expect(rec.alternativeCandidateIds).toEqual([]);
  });

  it("매장 이용 선호 → 포장 전용(CHICKEN-006) 제외, 매장 전용(CHICKEN-007) 생존", () => {
    const ctx: EngineContext = { preferences: { serviceType: "DINE_IN" }, hardConstraints: {} };
    const rec = buildRecommendation(fx.candidates, ctx);
    const excludedIds = rec.excludedCandidates.map((e) => e.candidateId);
    expect(excludedIds).toContain("CHICKEN-006");
    expect(excludedIds).not.toContain("CHICKEN-007");
  });

  it("복합 전멸: 땅콩+콩 알레르기 + 예산 5,000원 → 추천 null + 직원 안내 문구", () => {
    const ctx: EngineContext = { preferences: {}, hardConstraints: { allergenIds: ["PEANUT", "SOY"], maxPriceKrw: 5000 } };
    const rec = buildRecommendation(fx.candidates, ctx);
    expect(rec.recommendedCandidateId).toBeNull();
    expect(explainCore(rec, ctx).join(" ")).toContain("직원");
  });

  it("선호 없음(전부 미입력) → 그래도 품절만 빼고 추천이 성립한다", () => {
    const ctx: EngineContext = { preferences: {}, hardConstraints: {} };
    const rec = buildRecommendation(fx.candidates, ctx);
    expect(rec.recommendedCandidateId).not.toBeNull();
    expect(rec.excludedCandidates.map((e) => e.candidateId)).toEqual(["CHICKEN-008"]);
  });

  it("수량 3 → 실행계획이 Q3(value 3)를 선택한다", () => {
    const ctx: EngineContext = { preferences: { quantity: 3 }, hardConstraints: {} };
    const rec = buildRecommendation(fx.candidates, ctx);
    const plan = buildExecutionPlanCore({ approved: true, decision: "APPROVE" }, rec, fx, ctx);
    const qty = plan.actions.find((a) => a.target.groupId === "QUANTITY");
    expect(qty?.target.id).toBe("Q3");
    expect(qty?.value).toBe(3);
  });

  it("낯선 표현·과잉 선호(컵 선호가 후보 미지원)에도 계획이 전이표를 벗어나지 않는다", () => {
    const ctx: EngineContext = {
      preferences: { serviceType: "TAKE_OUT", spicyLevel: "MEDIUM", cupOption: "REGULAR", quantity: 2 },
      hardConstraints: { allergenIds: ["PEANUT"] },
    };
    const rec = buildRecommendation(fx.candidates, ctx);
    const plan = buildExecutionPlanCore({ approved: true, decision: "APPROVE" }, rec, fx, ctx);
    let state = fx.manifest.initialState;
    for (const a of plan.actions) {
      const t = fx.transitions.find((x) => x.from === state && x.action === a.action);
      expect(t).toBeDefined();
      state = t!.to;
    }
    expect(state).toBe(fx.manifest.reviewBoundaryState);
  });
});
