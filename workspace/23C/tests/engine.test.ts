/** STEP 4~7 코어 단위 테스트 — 하드 제약은 제거이지 감점이 아니다. */
import { describe, it, expect } from "vitest";
import {
  filterCandidatesCore, scoreCandidates, buildRecommendation, explainCore,
  alternativesFromRecommendation, computeConfidence, RECONFIRM_THRESHOLD,
  type EngineContext,
} from "../src/core/engine";
import { loadChickenFixture } from "./helpers";

const fx = loadChickenFixture();

const ctx = (over: Partial<EngineContext> = {}): EngineContext => ({
  preferences: { serviceType: "TAKE_OUT", spicyLevel: "HOT", boneType: "BONELESS", quantity: 1, ...over.preferences },
  hardConstraints: { allergenIds: ["PEANUT"], maxPriceKrw: 10000, ...over.hardConstraints },
});

describe("STEP 4 filterCandidatesCore", () => {
  it("땅콩 알레르기 → CHICKEN-005 제거 (감점이 아니라 제거)", () => {
    const { survivors, excluded } = filterCandidatesCore(fx.candidates, ctx());
    expect(survivors.map((c) => c.candidateId)).not.toContain("CHICKEN-005");
    expect(excluded.find((e) => e.candidateId === "CHICKEN-005")?.reasonCode).toBe("ALLERGEN_CONFLICT");
  });

  it("품절(CHICKEN-008)은 항상 제거", () => {
    const { excluded } = filterCandidatesCore(fx.candidates, ctx());
    expect(excluded.find((e) => e.candidateId === "CHICKEN-008")?.reasonCode).toBe("CANDIDATE_UNAVAILABLE");
  });

  it("포장 선호 → 매장 전용(CHICKEN-007) 제거", () => {
    const { excluded } = filterCandidatesCore(fx.candidates, ctx());
    expect(excluded.find((e) => e.candidateId === "CHICKEN-007")?.reasonCode).toBe("SERVICE_TYPE_UNSUPPORTED");
  });

  it("가격 상한 6,000원 → 6,500원 간장(CHICKEN-004) 제거", () => {
    const { excluded } = filterCandidatesCore(fx.candidates, ctx({ hardConstraints: { allergenIds: [], maxPriceKrw: 6000 } }));
    expect(excluded.find((e) => e.candidateId === "CHICKEN-004")?.reasonCode).toBe("PRICE_LIMIT_EXCEEDED");
  });

  it("콩(SOY) 알레르기 → 간장 닭강정(CHICKEN-004) 제거", () => {
    const { excluded } = filterCandidatesCore(fx.candidates, ctx({ hardConstraints: { allergenIds: ["SOY"] } }));
    expect(excluded.find((e) => e.candidateId === "CHICKEN-004")?.reasonCode).toBe("ALLERGEN_CONFLICT");
  });

  it("알레르기 UNKNOWN → 제거하지 않되 재확인 플래그", () => {
    const r = filterCandidatesCore(fx.candidates, ctx({ hardConstraints: { allergenIds: ["UNKNOWN"] } }));
    expect(r.hardConstraintUnknown).toBe(true);
  });
});

describe("STEP 5 scoring·confidence", () => {
  it("포장+매운맛+순살 → CHICKEN-001이 1위", () => {
    const rec = buildRecommendation(fx.candidates, ctx());
    expect(rec.recommendedCandidateId).toBe("CHICKEN-001");
    expect(rec.scoreBreakdown["CHICKEN-001"]).toBeGreaterThan(rec.scoreBreakdown["CHICKEN-002"] ?? 0);
  });

  it("순한맛 선호 → 순한 순살(CHICKEN-002)이 1위", () => {
    const rec = buildRecommendation(fx.candidates, ctx({ preferences: { spicyLevel: "MILD" } }));
    expect(rec.recommendedCandidateId).toBe("CHICKEN-002");
  });

  it("UNKNOWN 하드 제약 → confidence < 임계값 → requiresReconfirmation", () => {
    const rec = buildRecommendation(fx.candidates, ctx({ hardConstraints: { allergenIds: ["UNKNOWN"] } }));
    expect(rec.confidence).toBeLessThan(RECONFIRM_THRESHOLD);
    expect(rec.requiresReconfirmation).toBe(true);
  });

  it("NOT_APPLICABLE은 실값이 아니라 sentinel — 선호 없음과 동일하게 중립 처리 (UNKNOWN_POLICY 4상태)", () => {
    const withNA = buildRecommendation(fx.candidates, {
      preferences: { serviceType: "TAKE_OUT", spicyLevel: "NOT_APPLICABLE" },
      hardConstraints: { allergenIds: [] },
    });
    const without = buildRecommendation(fx.candidates, {
      preferences: { serviceType: "TAKE_OUT" },
      hardConstraints: { allergenIds: [] },
    });
    expect(withNA.recommendedCandidateId).toBe(without.recommendedCandidateId);
    expect(withNA.scoreBreakdown).toEqual(without.scoreBreakdown);
  });

  it("점수 동점은 재질문 사유가 아니다 — 이유·대안 제시로 해결 (confidence 하한 0.6)", () => {
    const rec = buildRecommendation(fx.candidates, {
      preferences: { serviceType: "TAKE_OUT", boneType: "BONELESS" },
      hardConstraints: { allergenIds: ["PEANUT"], maxPriceKrw: 10000 },
    });
    expect(rec.requiresReconfirmation).toBe(false);
    expect(rec.alternativeCandidateIds.length).toBeGreaterThan(0);
  });

  it("입력 신뢰 낮음(음성 confidence 0.4·미확인) → 재질문 (서버 LOW_CONFIDENCE 기준과 동일)", () => {
    const rec = buildRecommendation(fx.candidates, {
      ...ctx(),
      fieldMetadata: { "/preferences/boneType": { confidence: 0.4, confirmedByUser: false } },
    });
    expect(rec.requiresReconfirmation).toBe(true);
  });

  it("후보 전멸(예산 1,000원) → 추천 null", () => {
    const rec = buildRecommendation(fx.candidates, ctx({ hardConstraints: { allergenIds: [], maxPriceKrw: 1000 } }));
    expect(rec.recommendedCandidateId).toBeNull();
    expect(computeConfidence([], false, false)).toBe(0);
  });
});

describe("STEP 6 explain — 근거+행동, 금지 문구 없음", () => {
  it("이유가 1개 이상이고 사용한 정보(알레르기·예산)를 밝힌다", () => {
    const rec = buildRecommendation(fx.candidates, ctx());
    const reasons = explainCore(rec, ctx());
    expect(reasons.length).toBeGreaterThanOrEqual(1);
    expect(reasons.join(" ")).toContain("알레르기");
    expect(reasons.join(" ")).toContain("예산");
  });

  it("'AI가 추천' 류 금지 문구가 없다", () => {
    const rec = buildRecommendation(fx.candidates, ctx());
    const joined = explainCore(rec, ctx()).join(" ");
    expect(joined).not.toMatch(/AI가 추천|최적의 선택|시스템이 결정|시스템 판단/);
  });

  it("후보 전멸 시 직원 도움 경로를 안내한다", () => {
    const rec = buildRecommendation(fx.candidates, ctx({ hardConstraints: { allergenIds: [], maxPriceKrw: 1000 } }));
    expect(explainCore(rec, ctx()).join(" ")).toContain("직원");
  });
});

describe("STEP 7 alternatives — 제외 후보를 되살리지 않는다", () => {
  it("대안은 생존 후보 중 차순위이고, 제외된 후보가 없다", () => {
    const c = ctx();
    const rec = buildRecommendation(fx.candidates, c);
    const alts = alternativesFromRecommendation(fx.candidates, rec);
    expect(alts.length).toBeGreaterThan(0);
    const excludedIds = rec.excludedCandidates.map((e) => e.candidateId);
    for (const id of alts) {
      expect(excludedIds).not.toContain(id);
      expect(id).not.toBe(rec.recommendedCandidateId);
    }
  });
});
