/** STEP 4~7 코어 단위 테스트 — 하드 제약은 제거이지 감점이 아니다. */
import { describe, it, expect } from "vitest";
import {
  filterCandidatesCore, scoreCandidates, buildRecommendation, explainCore,
  alternativesFromRecommendation, computeConfidence, RECONFIRM_THRESHOLD,
  unmetConditionsFor, metConditionsFor,
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
 * 예산은 상한이 아니라 희망 금액이다 — 넘는 메뉴도 추천될 수 있다(STEP 5 주석).
 * 그래서 넘었을 때는 «주의 필요»가 반드시 말해야 한다. 실제로 빠져 있었다 —
 * 예산 5,000원에 5,500원 메뉴가 추천됐는데 주의 필요에는 맵기 이야기만 있었다.
 */
describe("주의 필요 — 예산 초과", () => {
  // 이 가게의 최저가는 5,500원이다. 5,000원을 말하면 «가장 가까운 것»으로 5,500원이 오고, 그 순간 예산을 넘는다.
  const 예산5천 = ctx({
    preferences: { serviceType: "DINE_IN", spicyLevel: "MILD", boneType: "BONE", quantity: 1 },
    hardConstraints: { allergenIds: [] },
  });

  /* 문구는 QA(TC-CM-04)가 요구한 «예산 {금액}원을 초과합니다» 형식이다. 초과 사실만
     알리고 실제 가격을 안 말하면 확인할 수 없으므로(unmetConditionsFor 주석) 뒤에 잇는다. */
  it("예산 5,000원에 5,500원 메뉴 → «예산 5,000원을 초과합니다» 형식으로 말한다", () => {
    const rec = buildRecommendation(fx.candidates, { ...예산5천, budgetKrw: 5000 });
    expect(rec.unmetConditions).toContain("예산 5,000원을 초과합니다 — 이 메뉴는 5,500원입니다");
  });

  it("예산 안이면 가격 문장이 없다 — 예산보다 싼 것은 주의가 아니다", () => {
    const rec = buildRecommendation(fx.candidates, { ...예산5천, budgetKrw: 10000 });
    expect((rec.unmetConditions ?? []).filter((s) => s.includes("예산"))).toEqual([]);
  });

  it("예산을 말하지 않으면 가격 문장이 없다", () => {
    const rec = buildRecommendation(fx.candidates, 예산5천);
    expect((rec.unmetConditions ?? []).filter((s) => s.includes("예산"))).toEqual([]);
  });
});

/**
 * 선호↔메뉴 불일치는 어느 경로에서 왔든 unmetConditionsFor 하나가 잰다 (QA TC-CM-04).
 * 첫 추천(buildRecommendation)·조건 수정 후 재추천·직접 선택(withManualSelection)·
 * 장바구니 인라인 수정(recommendKeeping)이 전부 이 함수를 지난다 — 여기서 축 하나가
 * 빠지면 모든 경로에서 같이 빠지므로, 축 셋(맵기·형태·이용 방식)을 전부 못 박는다.
 */
describe("주의 필요 — 선호↔메뉴 불일치 (맵기·형태·이용 방식)", () => {
  // 순한맛·뼈·매장 → 1순위는 매운 뼈 닭강정(CHICKEN-003). 맵기만 어긋난다.
  const 순한맛뼈 = ctx({
    preferences: { serviceType: "DINE_IN", spicyLevel: "MILD", boneType: "BONE", quantity: 1 },
    hardConstraints: { allergenIds: [] },
  });

  it("첫 추천에서 맵기 불일치가 주의 필요에 남는다 — 순한맛 선호에 매운맛 1순위", () => {
    const rec = buildRecommendation(fx.candidates, 순한맛뼈);
    expect(rec.recommendedCandidateId).toBe("CHICKEN-003");
    expect(rec.unmetConditions).toContain("원하신 맵기는 순한맛인데, 이 메뉴는 매운맛입니다");
  });

  it("형태 불일치 — 뼈를 원했는데 순살 메뉴면 주의 필요가 말한다", () => {
    const 순살메뉴 = fx.candidates.find((c) => c.candidateId === "CHICKEN-002");
    const out = unmetConditionsFor(순살메뉴, 순한맛뼈);
    expect(out).toContain("원하신 형태는 뼈인데, 이 메뉴는 순살입니다");
  });

  it("이용 방식 불일치 — 매장 이용을 원했는데 포장 전용 메뉴면 주의 필요가 말한다", () => {
    /* 엔진 1순위는 STEP 4 필터 덕에 이용 방식이 늘 맞지만, 이 함수는 직접 고른 메뉴도
       재므로(withManualSelection) 축이 비어 있으면 그 경로에서 조용히 새는 자리다. */
    const 포장전용 = fx.candidates.find((c) => c.candidateId === "CHICKEN-006");
    const out = unmetConditionsFor(포장전용, ctx({
      preferences: { serviceType: "DINE_IN", quantity: 1 },
      hardConstraints: { allergenIds: [] },
    }));
    expect(out).toContain("원하신 이용 방식은 매장 이용인데, 이 메뉴는 포장만 가능합니다");
  });

  it("선호와 메뉴가 다 맞으면 불일치 문장이 하나도 없다", () => {
    const rec = buildRecommendation(fx.candidates, ctx()); // 포장·매운맛·순살 → CHICKEN-001
    expect(rec.recommendedCandidateId).toBe("CHICKEN-001");
    expect((rec.unmetConditions ?? []).filter((s) => s.startsWith("원하신"))).toEqual([]);
  });
});

/**
 * «추천해요»에는 추천 메뉴가 **실제로 만족하는** 조건만 적는다 (QA TC-CM-03).
 * 화면(MenuConfirm)의 문장 조립이 이 목록을 그대로 쓴다 — 사용자 선호만 보고 만들면
 * 순한맛을 골랐는데 매운맛 메뉴가 왔을 때 «순한맛이고» 같은 거짓 문장이 생긴다.
 */
describe("metConditionsFor — 추천해요는 만족한 축만 말한다", () => {
  const 순한맛뼈 = ctx({
    preferences: { serviceType: "DINE_IN", spicyLevel: "MILD", boneType: "BONE", quantity: 1 },
    hardConstraints: { allergenIds: [] },
  });
  const candOf = (id: string) => fx.candidates.find((c) => c.candidateId === id);

  it("어긋난 맵기는 빠지고, 맞은 형태·이용 방식만 남는다", () => {
    const rec = buildRecommendation(fx.candidates, 순한맛뼈);
    const met = metConditionsFor(candOf(rec.recommendedCandidateId!), 순한맛뼈);
    expect(met.map((m) => m.key)).toEqual(["boneType", "serviceType"]);
    expect(met.find((m) => m.key === "boneType")?.value).toBe("BONE");
  });

  it("직접 고른 순살 메뉴에는 «뼈» 축이 남지 않는다 — 맵기는 맞아서 남는다", () => {
    const met = metConditionsFor(candOf("CHICKEN-002"), 순한맛뼈); // 순한 순살
    expect(met.map((m) => m.key)).toEqual(["spicyLevel", "serviceType"]);
  });

  it("전부 맞으면 세 축이 다 남고, 선호를 안 말한 축은 애초에 없다", () => {
    expect(metConditionsFor(candOf("CHICKEN-001"), ctx()).map((m) => m.key))
      .toEqual(["spicyLevel", "boneType", "serviceType"]); // 포장·매운맛·순살
    expect(metConditionsFor(candOf("CHICKEN-001"), ctx({
      preferences: { serviceType: "TAKE_OUT", spicyLevel: "NO_PREFERENCE", boneType: "BONELESS", quantity: 1 },
    })).map((m) => m.key)).toEqual(["boneType", "serviceType"]);
  });

  it("후보가 없으면 빈 목록이다", () => {
    expect(metConditionsFor(undefined, 순한맛뼈)).toEqual([]);
  });
});

describe("explainCore — 어긋난 축의 긍정 문장을 만들지 않는다 (QA TC-CM-03)", () => {
  it("순한맛 선호에 매운맛 1순위 → «순한맛» 사유가 사라지고 주의 필요가 대신 말한다", () => {
    const c = ctx({
      preferences: { serviceType: "DINE_IN", spicyLevel: "MILD", boneType: "BONE", quantity: 1 },
      hardConstraints: { allergenIds: [] },
    });
    const rec = buildRecommendation(fx.candidates, c); // CHICKEN-003 (매운맛·뼈)
    const joined = explainCore(rec, c).join(" ");
    expect(joined).not.toContain("순한맛을 선호하셔서");
    expect(joined).toContain("뼈");                    // 맞은 축은 그대로 말한다
    expect(rec.unmetConditions).toContain("원하신 맵기는 순한맛인데, 이 메뉴는 매운맛입니다");
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
