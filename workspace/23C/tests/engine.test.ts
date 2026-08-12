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

/**
 * 사용자에게 나가는 문장에 **영문 enum 이 섞이지 않는가.**
 *
 * 실제로 한 번 샜다 — 추천 화면의 「선호하신 맵기(MILD)와 다른 맵기입니다」. 바로 아래
 * 추천 사유는 SPICY_KO 로 「순한맛을 선호하셔서…」라고 제대로 말하고 있었으니, 한 화면에서
 * 같은 값이 두 언어로 나란히 떴다. 문장을 하나씩 눈으로 보고 잡을 수 있는 종류가 아니라
 * (조합마다 다른 문장이 나온다) 여기서 전수로 훑는다.
 *
 * 두 글자 이상 이어진 대문자를 찾는다. 계약 enum 은 전부 그 꼴이고(MILD·BONELESS·
 * TAKE_OUT·PEANUT…), 우리 문장은 한국어와 숫자뿐이라 거짓 경보가 나지 않는다.
 * 새 문장에 약어를 정말 써야 하면 그때 이 검사가 먼저 걸리고, 사람이 판단해 적으면 된다.
 */
describe("화면에 나가는 문장", () => {
  const 조합: Partial<EngineContext["preferences"]>[] = [
    {}, { spicyLevel: "MILD" }, { spicyLevel: "HOT" }, { boneType: "BONE" }, { boneType: "BONELESS" },
    { spicyLevel: "MILD", boneType: "BONE" }, { serviceType: "DINE_IN" }, { serviceType: "TAKE_OUT" },
    { spicyLevel: "MEDIUM", boneType: "BONE", serviceType: "DINE_IN" },
  ];

  it("영문 enum 이 그대로 나오지 않는다", () => {
    const 샌곳: string[] = [];
    let 본문장 = 0;
    let 못맞춘조건 = 0;
    for (const prefs of 조합) {
      for (const 알레르기 of [[], ["PEANUT"], ["SOY", "PEANUT"]]) {
        const c: EngineContext = { preferences: { quantity: 1, ...prefs }, hardConstraints: { allergenIds: 알레르기 } };
        const rec = buildRecommendation(fx.candidates, c);
        // 계약상 옵셔널이라 없을 수 있다 — 없는 것과 빈 것을 같게 다룬다
        const 못맞춘 = rec.unmetConditions ?? [];
        못맞춘조건 += 못맞춘.length;
        const 문장 = [
          ...못맞춘,
          ...explainCore(rec, c),
          // explanation 도 계약상 옵셔널이다 — 있는 것만 훑는다
          ...rec.excludedCandidates.map((e) => e.explanation).filter((s): s is string => s !== undefined),
        ];
        본문장 += 문장.length;
        for (const s of 문장) if (/[A-Z]{2,}/.test(s)) 샌곳.push(`${JSON.stringify(prefs)} → ${s}`);
      }
    }
    /* 문장을 하나도 안 만들고 통과하면 이 검사는 아무것도 지키지 않는다. 특히 실제로
       샜던 자리가 unmetConditions 라, 그 문장이 이 조합들에서 실제로 나오는지까지 본다. */
    expect(본문장, "문장을 하나도 못 모았습니다 — 이 검사가 공짜로 통과하고 있습니다")
      .toBeGreaterThan(20);
    expect(못맞춘조건, "«못 맞춘 조건» 문장이 한 번도 안 나왔습니다 — 실제로 샜던 자리가 여깁니다")
      .toBeGreaterThan(0);
    expect(샌곳, `영문 enum 이 섞인 문장:\n${샌곳.join("\n")}`).toEqual([]);
  });
});
