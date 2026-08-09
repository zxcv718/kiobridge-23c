/**
 * 질문 흐름 게이트 검사.
 *
 * 이 파일의 테스트는 UX 취향이 아니라 **계약 조건**이다.
 * guide.txt §5 «알레르기·품절·이용 불가 후보는 제외해야 합니다» 를 지키려면
 * 알레르기를 묻기 전에 추천을 확정해서는 안 된다.
 *
 * 이 위반은 스키마 검증을 통과하면서 조용히 일어난다(아래 "조용한 실패" 참조).
 * 자동 검출 수단이 여기 말고는 없으므로, 이 테스트가 유일한 방어선이다.
 */
import { describe, expect, it } from "vitest";
import type { Recommendation } from "@kiobridge/participant-sdk";
import { loadChickenFixture } from "./helpers";
import { buildChickenContext } from "../src/core/canonical";
import { buildRecommendation } from "../src/core/engine";
import {
  allergensAnswered, canStopAsking, preferenceAxisAsked, EARLY_STOP_CONFIDENCE,
} from "../src/core/ask";

const fixture = loadChickenFixture();
/** 한산한 시간 — 시간대 보너스를 배제해 점수를 재현 가능하게 고정한다. */
const NOW = new Date("2026-08-09T15:00:00+09:00");

/** 부분 답변으로 추천을 만든다 — 마법사 중간 상태와 같은 경로. */
function recFor(raw: Record<string, unknown>) {
  const { engineCtx } = buildChickenContext(raw);
  engineCtx.now = NOW;
  return { rec: buildRecommendation(fixture.candidates, engineCtx), ctx: engineCtx };
}

/** 게이트 단위 검사용 — 엔진을 거치지 않고 값만 세운다. */
const fakeRec = (confidence: number, requiresReconfirmation = false) =>
  ({ confidence, requiresReconfirmation } as Recommendation);

describe("조기 종료 게이트 — 계약 조건", () => {
  it("알레르기를 묻지 않았으면 신뢰도가 아무리 높아도 멈추지 않는다", () => {
    const { ctx } = recFor({ spicyLevel: "매운맛", boneType: "뼈" }); // allergies 없음
    expect(allergensAnswered(ctx)).toBe(false);
    expect(canStopAsking(fakeRec(0.99), ctx)).toBe(false);
  });

  it("재확인이 필요한 상태에서는 멈추지 않는다", () => {
    // 다른 조건은 전부 충족시켜 재확인 하나만 원인이 되게 한다
    const { ctx } = recFor({ allergies: [], spicyLevel: "매운맛" });
    expect(canStopAsking(fakeRec(0.99, true), ctx)).toBe(false);
  });

  it("알레르기를 답했고 선호를 물었고 신뢰도가 기준 이상이면 멈춘다", () => {
    const { ctx } = recFor({ allergies: [], spicyLevel: "매운맛" });
    expect(allergensAnswered(ctx)).toBe(true);
    expect(canStopAsking(fakeRec(EARLY_STOP_CONFIDENCE), ctx)).toBe(true);
  });

  it("기준에 0.01 모자라면 계속 묻는다", () => {
    const { ctx } = recFor({ allergies: [], spicyLevel: "매운맛" });
    expect(canStopAsking(fakeRec(EARLY_STOP_CONFIDENCE - 0.01), ctx)).toBe(false);
  });

  it("'알레르기 없음'도 답변이다 — 빈 배열과 미수집을 구분한다", () => {
    expect(allergensAnswered(recFor({ allergies: [] }).ctx)).toBe(true);
    expect(allergensAnswered(recFor({}).ctx)).toBe(false);
  });

  it("알레르기를 모른다(UNKNOWN)고 답하면 재확인이 걸려 멈추지 않는다", () => {
    const { rec, ctx } = recFor({ allergies: ["모름"], spicyLevel: "매운맛" });
    expect(rec.requiresReconfirmation).toBe(true);
    expect(canStopAsking(rec, ctx)).toBe(false);
  });
});

describe("안 물어봐서 생긴 확신 — confidence 단독 판정의 함정", () => {
  /* 실측 회귀 고정. scoreCandidates 는 선호를 말하지 않은 축에 중립점을 모든 후보에 똑같이
     얹으므로, 아무것도 안 물으면 변별 축이 상쇄되고 가격만 남아 confidence 가 최대가 된다.
     이 테스트가 깨지면 조기 종료가 "맵기·형태를 한 번도 안 묻고 확정"하는 동작으로 퇴행한다. */

  it("알레르기만 답한 상태의 confidence 가 실제로 매우 높다 (함정의 실재 확인)", () => {
    const { rec } = recFor({ allergies: ["땅콩", "콩"] });
    expect(rec.confidence).toBeGreaterThanOrEqual(EARLY_STOP_CONFIDENCE);
  });

  it("그런데도 선호를 하나도 묻지 않았으면 멈추지 않는다", () => {
    const { rec, ctx } = recFor({ allergies: ["땅콩", "콩"] });
    expect(preferenceAxisAsked(ctx)).toBe(false);
    expect(canStopAsking(rec, ctx)).toBe(false);
  });

  it("'상관없어요'도 물어본 것으로 친다 — 누락과 양보 가능은 다르다", () => {
    const { ctx } = recFor({ allergies: [], spicyLevel: "상관없음" });
    expect(ctx.preferences.spicyLevel).toBe("NO_PREFERENCE");
    expect(preferenceAxisAsked(ctx)).toBe(true);
  });

  it("수량·컵은 변별 축으로 치지 않는다", () => {
    const { ctx } = recFor({ allergies: [], quantity: 2, cupOption: "종이컵" });
    expect(preferenceAxisAsked(ctx)).toBe(false);
  });
});

describe("조용한 실패 — 이 게이트가 왜 필요한가", () => {
  it("알레르기를 묻지 않으면 하드제약이 비어 알레르기 제외가 아예 일어나지 않는다", () => {
    const { rec, ctx } = recFor({ spicyLevel: "보통" });
    // UNKNOWN 이 아니라 '미수집'이라 안전 정지도 걸리지 않는다 — 그래서 조용하다
    expect(ctx.hardConstraints.allergenIds).toBeUndefined();
    expect(rec.requiresReconfirmation).toBe(false);
    expect(rec.excludedCandidates.some((e) => e.reasonCode === "ALLERGEN_CONFLICT")).toBe(false);
    // 땅콩이 든 후보가 추천 대상에 그대로 살아 있다
    expect(Object.keys(rec.scoreBreakdown ?? {})).toContain("CHICKEN-005");
  });

  it("알레르기를 답하면 같은 입력에서 해당 후보가 제외된다", () => {
    const { rec } = recFor({ spicyLevel: "보통", allergies: ["땅콩"] });
    expect(rec.excludedCandidates.some((e) => e.reasonCode === "ALLERGEN_CONFLICT")).toBe(true);
    expect(Object.keys(rec.scoreBreakdown ?? {})).not.toContain("CHICKEN-005");
  });
});

describe("임계값 보정 — 조기 종료가 사문이 아님을 실측으로 고정한다", () => {
  /* 이 fixture(후보 8개)에서 computeConfidence 는 다수 후보일 때 0.82 를 넘지 못한다.
     기준을 그 위로 올리면 조기 종료는 '후보가 이미 1개로 좁혀진 자명한 경우'에만 발동해
     기능이 죽는다. 아래 두 테스트가 그 회귀를 막는다. */

  it("기준값이 다수 후보에서 실제로 도달 가능한 범위에 있다", () => {
    expect(EARLY_STOP_CONFIDENCE).toBeLessThanOrEqual(0.82);
  });

  it("알레르기·맵기·형태 3문항만 답해도 조기 종료가 실제로 발생한다", () => {
    const { rec, ctx } = recFor({ allergies: ["땅콩", "콩"], spicyLevel: "매운맛", boneType: "뼈" });
    expect(Object.keys(rec.scoreBreakdown ?? {}).length).toBeGreaterThan(1); // 자명한 단일 후보가 아니다
    expect(canStopAsking(rec, ctx)).toBe(true);
  });

  it("맵기 하나만 답한 단계에서는 아직 멈추지 않는다", () => {
    const { rec, ctx } = recFor({ allergies: [], spicyLevel: "매운맛" });
    expect(canStopAsking(rec, ctx)).toBe(false);
  });

  it("조건이 좁혀져 후보가 하나만 남으면 멈춘다", () => {
    const { rec, ctx } = recFor({ allergies: [], budgetKrw: 5500, spicyLevel: "매운맛" });
    expect(Object.keys(rec.scoreBreakdown ?? {}).length).toBe(1);
    expect(canStopAsking(rec, ctx)).toBe(true);
  });

  it("후보가 하나뿐이어도 선호를 안 물었으면 멈추지 않는다 — 옵션 선택이 남아 있다", () => {
    // 후보가 하나로 좁혀져도 맵기·형태·컵은 실행계획의 옵션으로 여전히 선택된다.
    // "메뉴가 정해졌으니 그만 물어도 된다"는 성립하지 않는다.
    const { rec, ctx } = recFor({ allergies: [], budgetKrw: 5500 });
    expect(Object.keys(rec.scoreBreakdown ?? {}).length).toBe(1);
    expect(canStopAsking(rec, ctx)).toBe(false);
  });
});
