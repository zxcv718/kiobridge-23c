/**
 * TC-CM-08 QA 1차 — 수량 대체 오안내 (TC-CM-06).
 *
 * 수량 5를 고르면 화면의 수량·가격은 5로 맞게 나오면서 «원하신 5개는 이 메뉴에 없어
 * 바꿨습니다»가 함께 떴다. 계약의 수량은 자유 정수(integer ≥ 1)이고 화면·가격·제출이
 * 전부 사용자가 말한 수를 그대로 쓰므로, «메뉴에 없어 바꿨다»는 말이 성립하지 않는다.
 *
 * 원인은 화면의 출처 보정이었다 — 실행계획의 수량 «옵션»(Q1·Q2·Q3, 키오스크 버튼
 * 눈금)에 사용자의 수가 없으면 대체로 표시했다. 옵션 눈금은 키오스크 조작의 사정이지
 * 주문의 사실이 아니다. 수량을 말한 사람의 행은 언제나 USER 다.
 */
import { describe, expect, it } from "vitest";
import { computeRecommendation } from "../ui/src/logic";
import { A11Y_DEFAULT, buildRawInput } from "../ui/src/model";
import { buildExecutionPlanCore, explainSelections, type PlanSelection } from "../src/core/plan";
import { fixQuantityOrigin } from "../ui/src/screens/CartReview";
import { loadChickenFixture } from "./helpers";

const fx = loadChickenFixture();
const NOW = new Date("2026-08-13T03:00:00Z"); // 상황신호가 매번 달라지지 않게 고정한다

/** 마법사 답변 그대로 — 화면이 만드는 것과 같은 원문 입력 */
const rawOf = (over: Record<string, unknown> = {}) => buildRawInput(
  { serviceType: "포장", spicyLevel: "매운맛", boneType: "순살", quantity: 1, allergies: ["없음"], budgetKrw: "없음", ...over },
  A11Y_DEFAULT, false, false,
);

/** 화면과 같은 길 — 추천 → 실행계획 → 출처 설명 → 수량 출처 보정 */
function qtyRowFor(quantity: number): PlanSelection {
  const u = computeRecommendation(rawOf({ quantity }), fx, NOW);
  const plan = buildExecutionPlanCore({ approved: true, decision: "APPROVE" }, u.rec, fx, u.engineCtx);
  const sels = fixQuantityOrigin(explainSelections(fx, plan, u.engineCtx), u.engineCtx.preferences.quantity);
  const row = sels.find((x) => x.groupId === "QUANTITY");
  expect(row, "실행계획에 수량 행이 없습니다").toBeDefined();
  return row!;
}

describe("장바구니 확인의 수량 출처 — 말한 수는 언제나 USER 다", () => {
  it("옵션 눈금(1·2·3) 밖의 수량 5도 «바꿨다»고 말하지 않는다 (TC-CM-06 재현)", () => {
    // 계획의 옵션 행은 눈금 폴백(Q1)이지만, 주문의 수량은 5 그대로다 — 대체가 아니다
    expect(qtyRowFor(5).origin).toBe("USER");
  });

  it("눈금 안의 수량 2는 지금처럼 USER 다", () => {
    expect(qtyRowFor(2).origin).toBe("USER");
  });

  it("수량을 말한 적이 없으면 AUTO 그대로 — 우리가 정했다는 사실을 숨기지 않는다", () => {
    const sels: PlanSelection[] = [{ groupId: "QUANTITY", id: "Q1", origin: "AUTO" }];
    expect(fixQuantityOrigin(sels, undefined)[0].origin).toBe("AUTO");
  });

  it("수량이 아닌 행은 건드리지 않는다", () => {
    const sels: PlanSelection[] = [{ groupId: "BONE_TYPE", id: "BONELESS", origin: "SUBSTITUTED", wanted: "BONE" }];
    expect(fixQuantityOrigin(sels, 5)).toEqual(sels);
  });
});
