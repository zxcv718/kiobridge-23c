/** STEP 9 실행계획 테스트 — 전이 정합·경계 정지·결제 0건. */
import { describe, it, expect } from "vitest";
import { buildRecommendation, type EngineContext } from "../src/core/engine";
import { buildExecutionPlanCore } from "../src/core/plan";
import { loadChickenFixture } from "./helpers";

const fx = loadChickenFixture();
const CTX: EngineContext = {
  preferences: { serviceType: "TAKE_OUT", spicyLevel: "HOT", boneType: "BONELESS", quantity: 1 },
  hardConstraints: { allergenIds: ["PEANUT"], maxPriceKrw: 10000 },
};
const APPROVE = { approved: true, decision: "APPROVE" as const };
const REJECT = { approved: false, decision: "REJECT" as const };

const rec = () => buildRecommendation(fx.candidates, CTX);

describe("STEP 9 buildExecutionPlanCore", () => {
  it("거절이면 actions는 빈 배열 (승인 없는 실행 없음)", () => {
    const plan = buildExecutionPlanCore(REJECT, rec(), fx, CTX);
    expect(plan.actions).toEqual([]);
  });

  it("모든 액션의 expectedBefore/After가 fixture 전이표와 일치한다", () => {
    const plan = buildExecutionPlanCore(APPROVE, rec(), fx, CTX);
    let state = fx.manifest.initialState;
    for (const a of plan.actions) {
      expect(a.expectedBeforeState).toBe(state);
      const t = fx.transitions.find((x) => x.from === state && x.action === a.action);
      expect(t, `${state} --${a.action}--> ?`).toBeDefined();
      expect(a.expectedAfterState).toBe(t!.to);
      state = t!.to;
    }
  });

  it("검토 경계(CART_REVIEW)에 도달하고 마지막 액션은 verify_cart 다", () => {
    const plan = buildExecutionPlanCore(APPROVE, rec(), fx, CTX);
    const last = plan.actions[plan.actions.length - 1];
    expect(last.action).toBe(fx.manifest.requiredVerifierAction);
    expect(last.expectedBeforeState).toBe(fx.manifest.reviewBoundaryState);
  });

  it("결제·금지 액션이 계획에 없다 (차단이 아니라 애초에 계획하지 않는다)", () => {
    const plan = buildExecutionPlanCore(APPROVE, rec(), fx, CTX);
    const forbidden = new Set(fx.manifest.forbiddenActions ?? []);
    for (const a of plan.actions) expect(forbidden.has(a.action)).toBe(false);
  });

  it("추천 후보 선택(select_menu)이 정확히 1회이고 추천과 일치한다", () => {
    const r = rec();
    const plan = buildExecutionPlanCore(APPROVE, r, fx, CTX);
    const menuActions = plan.actions.filter((a) => a.action === "select_menu");
    expect(menuActions).toHaveLength(1);
    expect(menuActions[0].target.id).toBe(r.recommendedCandidateId);
  });

  it("필수 옵션 그룹(SPICY·BONE·QUANTITY)이 전부 선택되고 수량 값이 선호와 같다", () => {
    const plan = buildExecutionPlanCore(APPROVE, rec(), fx, CTX);
    const groups = plan.actions.filter((a) => a.action === "select_option").map((a) => a.target.groupId);
    expect(groups).toContain("SPICY_LEVEL");
    expect(groups).toContain("BONE_TYPE");
    expect(groups).toContain("QUANTITY");
    const qty = plan.actions.find((a) => a.target.groupId === "QUANTITY");
    expect(qty?.value).toBe(CTX.preferences.quantity);
  });

  it("좌표·컨트롤 ID·automationId가 어디에도 없다", () => {
    const plan = buildExecutionPlanCore(APPROVE, rec(), fx, CTX);
    const json = JSON.stringify(plan);
    expect(json).not.toMatch(/automationId|coordinate|"x"\s*:|"y"\s*:|btn[A-Z]/);
  });

  it("actualDeviceCommandSent는 항상 false", () => {
    expect(buildExecutionPlanCore(APPROVE, rec(), fx, CTX).actualDeviceCommandSent).toBe(false);
  });
});
