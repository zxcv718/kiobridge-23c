/** STEP 9 실행계획 테스트 — 전이 정합·경계 정지·결제 0건. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildRecommendation, type EngineContext } from "../src/core/engine";
import { buildExecutionPlanCore , substitutionsFor , explainSelections } from "../src/core/plan";
import { computeRecommendation, buildUiSubmission, summarizeOrderPlan } from "../ui/src/logic";
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

describe("선택 옵션 — 못 맞추면 대체하고 알린다", () => {
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

  it("일반컵을 원했는데 후보가 종이컵만 지원하면 종이컵으로 대체한다", () => {
    // 생략하면 결과가 '컵 없음(NONE)'에 가까워져 사용자 의도에서 더 멀어진다.
    const plan = buildExecutionPlanCore(approve, rec(paperOnly.candidateId), fixture, {
      preferences: { cupOption: "REGULAR" }, hardConstraints: {},
    });
    expect(cupOf(plan)).toBe("PAPER");
  });

  it("대체한 사실을 화면이 알릴 수 있도록 목록으로 내놓는다", () => {
    const subs = substitutionsFor(fixture, paperOnly, { preferences: { cupOption: "REGULAR" }, hardConstraints: {} });
    expect(subs).toEqual([{ groupId: "CUP", wanted: "REGULAR", used: "PAPER" }]);
  });

  it("후보가 원하는 컵을 지원하면 그대로 선택하고 대체 목록은 비어 있다", () => {
    const both = fixture.candidates.find((c) => (c.supportedOptions?.CUP ?? []).includes("REGULAR"))!;
    const plan = buildExecutionPlanCore(approve, rec(both.candidateId), fixture, {
      preferences: { cupOption: "REGULAR" }, hardConstraints: {},
    });
    expect(cupOf(plan)).toBe("REGULAR");
    expect(substitutionsFor(fixture, both, { preferences: { cupOption: "REGULAR" }, hardConstraints: {} })).toEqual([]);
  });

  it("컵 선호를 말하지 않았으면 선택 그룹을 건드리지 않는다", () => {
    const plan = buildExecutionPlanCore(approve, rec(paperOnly.candidateId), fixture, {
      preferences: {}, hardConstraints: {},
    });
    expect(cupOf(plan)).toBeUndefined();
    expect(substitutionsFor(fixture, paperOnly, { preferences: {}, hardConstraints: {} })).toEqual([]);
  });

  it("필수 그룹은 못 맞춰도 반드시 채운다 (REQUIRED_OPTION_MISSING 방지)", () => {
    const plan = buildExecutionPlanCore(approve, rec(paperOnly.candidateId), fixture, {
      preferences: { spicyLevel: "MILD" }, hardConstraints: {},
    });
    const chosen = plan.actions.filter((a) => a.target?.groupId).map((a) => a.target.groupId);
    for (const g of fixture.optionGroups.filter((x) => x.required && x.groupId !== "SERVICE_TYPE")) {
      expect(chosen, `필수 그룹 ${g.groupId} 미선택`).toContain(g.groupId);
    }
  });
});

describe("대체는 특정 옵션에 한정되지 않는다 (전 그룹 공통)", () => {
  const fixture = loadChickenFixture();
  const approve = { approved: true, decision: "APPROVE" as const };
  const rec = (id: string) => ({
    recommendedCandidateId: id, alternativeCandidateIds: [], excludedCandidates: [],
    recommendationReasons: [], confidence: 0.9, requiresReconfirmation: false,
  });

  /** 각 옵션 그룹마다 "후보가 지원하지 않는 값"을 골라 넣고 대체되는지 본다 */
  const cases = [
    { group: "SPICY_LEVEL", prefs: { spicyLevel: "MILD" } },
    { group: "BONE_TYPE", prefs: { boneType: "BONELESS" } },
    { group: "CUP", prefs: { cupOption: "REGULAR" } },
  ] as const;

  for (const { group, prefs } of cases) {
    it(`${group} — 후보가 못 맞추면 지원값으로 대체한다`, () => {
      const cand = fixture.candidates.find((c) => {
        const sup = c.supportedOptions?.[group] ?? [];
        return sup.length > 0 && !sup.includes(Object.values(prefs)[0] as string);
      })!;
      expect(cand, `${group} 를 못 맞추는 후보가 fixture 에 없습니다`).toBeDefined();
      const plan = buildExecutionPlanCore(approve, rec(cand.candidateId), fixture, {
        preferences: prefs, hardConstraints: {},
      });
      const chosen = plan.actions.find((a) => a.target?.groupId === group)?.target.id;
      expect(chosen).toBeDefined();
      expect(chosen).not.toBe(Object.values(prefs)[0]);       // 대체됐다
      expect(cand.supportedOptions?.[group]).toContain(chosen); // 후보가 지원하는 값이다
    });
  }

  it("이용 방식(SERVICE_TYPE)도 대체된다", () => {
    const takeOutOnly = fixture.candidates.find(
      (c) => (c.supportedOptions?.SERVICE_TYPE ?? []).join() === "TAKE_OUT",
    )!;
    const plan = buildExecutionPlanCore(approve, rec(takeOutOnly.candidateId), fixture, {
      preferences: { serviceType: "DINE_IN" }, hardConstraints: {},
    });
    expect(plan.actions[0].target.id).toBe("TAKE_OUT");
  });

  it("화면 안내와 실행계획이 같은 매핑을 쓴다 — 어긋날 수 없다", () => {
    const cand = fixture.candidates.find((c) => c.candidateId === "CHICKEN-003")!;
    const ctx = {
      preferences: { spicyLevel: "MILD", boneType: "BONELESS", cupOption: "REGULAR" },
      hardConstraints: {},
    };
    const subs = substitutionsFor(fixture, cand, ctx);
    const plan = buildExecutionPlanCore(approve, rec(cand.candidateId), fixture, ctx);
    for (const s of subs) {
      const inPlan = plan.actions.find((a) => a.target?.groupId === s.groupId)?.target.id;
      expect(inPlan, `${s.groupId}: 안내는 ${s.used} 인데 계획은 ${inPlan}`).toBe(s.used);
    }
    expect(subs.length).toBeGreaterThan(0);
  });
});

describe('"상관없어요" 가 필수/선택 그룹에서 어떻게 끝나는가', () => {
  const fixture = loadChickenFixture();
  const approve = { approved: true, decision: "APPROVE" as const };
  const rec = (id: string) => ({
    recommendedCandidateId: id, alternativeCandidateIds: [], excludedCandidates: [],
    recommendationReasons: [], confidence: 0.9, requiresReconfirmation: false,
  });
  /** 맵기 HOT · 형태 BONE · 컵 PAPER 만 지원하는 후보 */
  const c3 = fixture.candidates.find((c) => c.candidateId === "CHICKEN-003")!;

  it("필수 그룹은 상관없어도 반드시 하나가 정해진다", () => {
    const plan = buildExecutionPlanCore(approve, rec(c3.candidateId), fixture, {
      preferences: {}, hardConstraints: {},
    });
    const groups = plan.actions.filter((a) => a.target?.groupId).map((a) => a.target.groupId);
    for (const g of fixture.optionGroups.filter((x) => x.required && x.groupId !== "SERVICE_TYPE")) {
      expect(groups, `필수 ${g.groupId} 가 정해지지 않았습니다`).toContain(g.groupId);
    }
  });

  it("선택 그룹은 상관없으면 정해지지 않는다", () => {
    const plan = buildExecutionPlanCore(approve, rec(c3.candidateId), fixture, {
      preferences: {}, hardConstraints: {},
    });
    expect(plan.actions.find((a) => a.target?.groupId === "CUP")).toBeUndefined();
  });

  it("자동으로 정해진 값은 AUTO 로 표시돼 사용자가 승인 전에 본다", () => {
    const ctx = { preferences: {}, hardConstraints: {} };
    const plan = buildExecutionPlanCore(approve, rec(c3.candidateId), fixture, ctx);
    const sels = explainSelections(fixture, plan, ctx);
    // 필수 그룹은 전부 사용자가 말하지 않았으므로 AUTO 여야 한다
    expect(sels.length).toBeGreaterThan(0);
    expect(sels.every((x) => x.origin === "AUTO")).toBe(true);
    expect(sels.map((x) => x.groupId)).toContain("SPICY_LEVEL");
  });

  it("고른 대로면 USER, 못 맞추면 SUBSTITUTED 로 구분된다", () => {
    const ctx = { preferences: { spicyLevel: "HOT", boneType: "BONELESS" }, hardConstraints: {} };
    const plan = buildExecutionPlanCore(approve, rec(c3.candidateId), fixture, ctx);
    const sels = explainSelections(fixture, plan, ctx);
    expect(sels.find((x) => x.groupId === "SPICY_LEVEL")?.origin).toBe("USER");
    const bone = sels.find((x) => x.groupId === "BONE_TYPE");
    expect(bone?.origin).toBe("SUBSTITUTED");
    expect(bone?.wanted).toBe("BONELESS");
    expect(bone?.id).toBe("BONE");
  });

  it("화면에 보이는 선택이 실행계획과 정확히 같다", () => {
    const ctx = { preferences: { cupOption: "REGULAR" }, hardConstraints: {} };
    const plan = buildExecutionPlanCore(approve, rec(c3.candidateId), fixture, ctx);
    // select_service 는 groupId 없이 kind:"service_type" 을 쓴다 — 코드와 같은 방식으로 환원한다
    const groupOf = (t: { kind?: string; groupId?: string }) => t.groupId ?? t.kind?.toUpperCase();
    for (const sel of explainSelections(fixture, plan, ctx)) {
      const inPlan = plan.actions.find((a) => groupOf(a.target) === sel.groupId)?.target.id;
      expect(inPlan, `${sel.groupId}`).toBe(sel.id);
    }
  });
});

/* ───────── 체험 모드 결과 요약 (summarizeOrderPlan) ─────────
 * 서버 없는 배포본에서 "이 주문의 결말"로 보여주는 값들이다.
 * 공식 재생 없이도 계획만으로 단언할 수 있어야 한다는 것이 이 함수의 전제이므로,
 * 그 전제가 깨지면(예: 계획이 결제 화면까지 가면) 여기서 잡힌다. */
describe("체험 모드 summarizeOrderPlan", () => {
  const raw = JSON.parse(
    readFileSync(fileURLToPath(new URL("../input/raw-user-input.json", import.meta.url)), "utf-8"),
  );
  const submissionOf = () =>
    buildUiSubmission(computeRecommendation(raw, fx, new Date("2026-08-06T09:00:00Z")), fx, true, false);

  it("단계 수가 실제 계획 길이와 같다", () => {
    const sub = submissionOf();
    expect(summarizeOrderPlan(sub, fx).stepCount).toBe(sub.executionPlan.actions.length);
  });

  it("결제 직전 검토 경계에서 끝나고, 결제 동작은 0건이다", () => {
    const s = summarizeOrderPlan(submissionOf(), fx);
    expect(s.endsAtState).toBe(fx.manifest.reviewBoundaryState);
    expect(s.stopsAtReviewBoundary).toBe(true);
    expect(s.paymentActionCount).toBe(0);
  });

  it("읽기 전용 확인이 계획에 포함되고, 실기기 명령은 나가지 않는다", () => {
    const s = summarizeOrderPlan(submissionOf(), fx);
    expect(s.includesRequiredVerifier).toBe(true);
    expect(s.deviceCommandSent).toBe(false);
  });

  it("끝나는 화면 이름은 fixture의 screens에서 가져온다 (하드코딩 금지)", () => {
    const s = summarizeOrderPlan(submissionOf(), fx);
    const title = fx.screens.find((sc) => sc.state === s.endsAtState)?.title;
    expect(s.endsAtTitle).toBe(title);
  });

  it("거절한 주문은 0단계이고 경계에 도달하지 않는다", () => {
    const u = computeRecommendation(raw, fx, new Date("2026-08-06T09:00:00Z"));
    const s = summarizeOrderPlan(buildUiSubmission(u, fx, false, false), fx);
    expect(s.stepCount).toBe(0);
    expect(s.stopsAtReviewBoundary).toBe(false);
  });
});
