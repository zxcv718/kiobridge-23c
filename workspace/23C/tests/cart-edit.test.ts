/**
 * 장바구니 확인(S13)에서 수량·주문 방식을 그 자리에서 고치는 경로.
 *
 * 원칙: **이미 확정한 메뉴는 바뀌지 않는다.** 주문 방식은 엔진 점수에 들어가므로
 * (engine.ts WEIGHTS.service) 그냥 다시 계산하면 최종 확인 화면에서 메뉴가 갑자기
 * 바뀔 수 있다 — 그래서 다시 계산하되 현재 메뉴를 고정하고(withManualSelection),
 * 조건 대조(«주의 필요»·대체 안내)만 새 값 기준으로 다시 잰다.
 */
import { describe, it, expect } from "vitest";
import { computeRecommendation, recommendKeeping } from "../ui/src/logic";
import { A11Y_DEFAULT, buildRawInput } from "../ui/src/model";
import { loadChickenFixture } from "./helpers";

const fx = loadChickenFixture();
const NOW = new Date("2026-08-13T03:00:00Z"); // 상황신호가 매번 달라지지 않게 고정한다

/** 마법사 답변 그대로 — UI 가 만드는 것과 같은 원문 입력을 만든다 */
const rawOf = (over: Record<string, unknown> = {}) => buildRawInput(
  { serviceType: "매장", spicyLevel: "매운맛", boneType: "뼈", quantity: 1, allergies: ["없음"], budgetKrw: 5000, ...over },
  A11Y_DEFAULT, false, false,
);

describe("장바구니에서 조건 수정 — 메뉴는 유지하고 조건만 다시 잰다", () => {
  it("수량을 바꿔도 메뉴는 그대로이고 새 수량이 반영된다", () => {
    const base = computeRecommendation(rawOf(), fx, NOW);
    const keep = base.rec.recommendedCandidateId!;
    const { u, pinned } = recommendKeeping(rawOf({ quantity: 3 }), fx, keep, NOW);
    expect(u.rec.recommendedCandidateId).toBe(keep);
    expect(u.engineCtx.preferences.quantity).toBe(3);
    expect(pinned).toBe(false); // 수량은 점수에 안 들어가므로 1위가 그대로다 — 고정이 필요 없다
  });

  it("직접 골라 둔 메뉴가 1위가 아니어도 유지되고, «주의 필요»는 그 메뉴 기준이다", () => {
    // 매운맛·뼈 답변의 1위는 매운 뼈 닭강정(CHICKEN-003)이다 — 순한 순살(CHICKEN-002,
    // 6,000원)을 직접 골라 둔 사람이 장바구니에서 주문 방식만 포장으로 바꾸는 경우.
    const { u, pinned } = recommendKeeping(rawOf({ serviceType: "포장" }), fx, "CHICKEN-002", NOW);
    expect(pinned).toBe(true);
    expect(u.rec.recommendedCandidateId).toBe("CHICKEN-002");
    expect(u.engineCtx.preferences.serviceType).toBe("TAKE_OUT");
    // 예산 문장은 고른 메뉴(6,000원)로 다시 재야 한다 — 1위(5,500원)의 문장이 남으면 안 된다
    expect(u.rec.unmetConditions).toContain("원하신 예산은 5,000원인데, 이 메뉴는 6,000원입니다");
    expect(u.rec.unmetConditions).not.toContain("원하신 예산은 5,000원인데, 이 메뉴는 5,500원입니다");
  });

  it("유지할 메뉴가 생존 후보에 없으면 고정하지 않고 엔진의 1위를 쓴다", () => {
    const base = computeRecommendation(rawOf(), fx, NOW);
    const { u, pinned } = recommendKeeping(rawOf(), fx, "NOPE-999", NOW);
    expect(pinned).toBe(false);
    expect(u.rec.recommendedCandidateId).toBe(base.rec.recommendedCandidateId);
  });
});
