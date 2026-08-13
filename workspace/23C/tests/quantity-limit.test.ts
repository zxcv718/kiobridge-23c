/**
 * 메뉴별 주문 가능 수량 상한 (사용자 확정 2026-08-13).
 *
 * 근거는 candidates.json 의 supportedOptions.QUANTITY(«Q1·Q2·Q3»)다 — 화면이 임의로
 * 정한 수(QUANTITY_MAX=10)가 아니라 매장 자료가 상한이다. 담긴 메뉴가 있으면 그
 * 메뉴의 최대값, 메뉴가 정해지기 전(질문 S10)에는 판매 중 후보들의 최대값을 쓴다.
 */
import { describe, expect, it } from "vitest";
import { candidateMaxQty, fixtureMaxQty } from "../ui/src/logic";
import { loadChickenFixture } from "./helpers";

const fixture = loadChickenFixture();

describe("메뉴별 수량 상한", () => {
  it("메뉴의 상한은 supportedOptions.QUANTITY 의 최대 Qn 이다", () => {
    expect(candidateMaxQty(fixture, "CHICKEN-001")).toBe(3); // Q1·Q2·Q3
    expect(candidateMaxQty(fixture, "CHICKEN-008")).toBe(1); // Q1 뿐
  });

  it("모르는 메뉴·자료 없는 메뉴에는 상한을 지어내지 않는다", () => {
    expect(candidateMaxQty(fixture, "NO-SUCH-MENU")).toBeUndefined();
    expect(candidateMaxQty(fixture, null)).toBeUndefined();
  });

  it("메뉴가 정해지기 전의 상한은 판매 중 후보들의 최대값이다", () => {
    // 이 가게는 판매 중 메뉴 전부가 Q3 까지다 — 질문 화면은 3까지 열어 준다
    expect(fixtureMaxQty(fixture)).toBe(3);
  });
});
