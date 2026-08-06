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

describe("선택 옵션 — 못 맞추면 대체하지 않는다 (SELECTED_CUP_OPTION_MISMATCH 회귀)", () => {
  const fixture = loadChickenFixture();
  /** CUP 을 PAPER 만 지원하는 후보 (일반컵 요청을 만족시킬 수 없다) */
  const paperOnly = fixture.candidates.find(
    (c) => (c.supportedOptions?.CUP ?? []).join() === "PAPER",
  )!;
  const approve = { approved: true, decision: "APPROVE" as const };
  const rec = (id: string) => ({
    recommendedCandidateId: id, alternativeCandidateIds: [], excludedCandidates: [],
    recommendationReasons: [], confidence: 0.9, requiresReconfirmation: false,
  });
  const cupOf = (plan: { actions: { target: { groupId?: string; id: string } }[] }) =>
    plan.actions.find((a) => a.target?.groupId === "CUP")?.target.id;

  it("일반컵을 원했는데 후보가 종이컵만 지원하면 컵을 아예 선택하지 않는다", () => {
    const plan = buildExecutionPlanCore(approve, rec(paperOnly.candidateId), fixture, {
      preferences: { cupOption: "REGULAR" }, hardConstraints: {},
    });
    expect(cupOf(plan)).toBeUndefined(); // PAPER 로 몰래 바꾸지 않는다
  });

  it("후보가 원하는 컵을 지원하면 그대로 선택한다", () => {
    const both = fixture.candidates.find(
      (c) => (c.supportedOptions?.CUP ?? []).includes("REGULAR"),
    )!;
    const plan = buildExecutionPlanCore(approve, rec(both.candidateId), fixture, {
      preferences: { cupOption: "REGULAR" }, hardConstraints: {},
    });
    expect(cupOf(plan)).toBe("REGULAR");
  });

  it("컵 선호가 없으면 선택하지 않는다", () => {
    const plan = buildExecutionPlanCore(approve, rec(paperOnly.candidateId), fixture, {
      preferences: {}, hardConstraints: {},
    });
    expect(cupOf(plan)).toBeUndefined();
  });

  it("필수 그룹은 못 맞춰도 후보가 지원하는 값으로 채운다 (미선택 시 REQUIRED_OPTION_MISSING)", () => {
    const plan = buildExecutionPlanCore(approve, rec(paperOnly.candidateId), fixture, {
      preferences: { spicyLevel: "MILD" }, hardConstraints: {}, // paperOnly 가 MILD 를 지원하지 않아도
    });
    const chosen = plan.actions.filter((a) => a.target?.groupId).map((a) => a.target.groupId);
    for (const g of fixture.optionGroups.filter((x) => x.required && x.groupId !== "SERVICE_TYPE")) {
      expect(chosen, `필수 그룹 ${g.groupId} 미선택`).toContain(g.groupId);
    }
  });
});
