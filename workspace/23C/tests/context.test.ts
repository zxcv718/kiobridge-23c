/**
 * 상황신호 — 가이드가 그은 경계를 코드가 실제로 지키는지 검사한다.
 *
 * 지켜야 할 것 (CONTEXT_AWARE_RECOMMENDATION_GUIDE):
 *   1. 외부 맥락은 정렬 순서만 바꾼다 — 후보를 걸러내지 않는다.
 *   2. 우선순위 사다리: hardConstraints > facts > preferences > 외부맥락.
 *   3. 만료된 신호는 없는 것으로 취급하고 이유에서도 언급하지 않는다.
 *   4. 순서를 바꿨으면 반드시 이유로 말한다.
 */
import { describe, expect, it } from "vitest";
import {
  buildContextSignals, contextBonusFor, timeSlotOf, timeSlotFromSignals, CONTEXT_NAMESPACE,
} from "../src/core/context";
import { buildChickenContext } from "../src/core/canonical";
import { buildRecommendation, explainCore, filterCandidatesCore, type EngineContext } from "../src/core/engine";
import { CANDIDATES } from "./helpers";

const at = (hour: number) => { const d = new Date("2026-08-06T00:00:00"); d.setHours(hour, 0, 0, 0); return d; };
const LUNCH = at(12);
const QUIET = at(15);

describe("시간대 판정 — 기기 시계만 쓴다", () => {
  it("점심·저녁·야간·그 외를 구분한다", () => {
    expect(timeSlotOf(at(12))).toBe("LUNCH_PEAK");
    expect(timeSlotOf(at(18))).toBe("DINNER_PEAK");
    expect(timeSlotOf(at(23))).toBe("LATE_NIGHT");
    expect(timeSlotOf(at(15))).toBe("OFF_PEAK");
  });

  it("신호에는 출처와 만료가 붙는다", () => {
    const [time] = buildContextSignals(CANDIDATES, LUNCH);
    expect(time.source).toBe("DEVICE_CLOCK");
    expect(Date.parse(time.expiresAt)).toBeGreaterThan(Date.parse(time.observedAt));
    expect(time.confidence).toBe(1);
  });
});

describe("경계 1·2 — 맥락은 순서만 바꾸고, 선호를 이기지 못한다", () => {
  const ctxOf = (prefs: Record<string, unknown>, now: Date): EngineContext => ({
    preferences: prefs as EngineContext["preferences"],
    hardConstraints: {},
    contextSignals: buildContextSignals(CANDIDATES, now),
    now,
  });

  it("맥락이 있어도 후보 수가 줄지 않는다 (필터가 아니다)", () => {
    const quiet = filterCandidatesCore(CANDIDATES, ctxOf({}, QUIET)).survivors.length;
    const lunch = filterCandidatesCore(CANDIDATES, ctxOf({}, LUNCH)).survivors.length;
    expect(lunch).toBe(quiet);
  });

  it("붐비는 시간 + 이용방식 미지정 → 포장 가능 후보에만 가점", () => {
    const takeOut = CANDIDATES.find((c) => c.supportedOptions?.SERVICE_TYPE?.includes("TAKE_OUT"))!;
    const dineOnly = CANDIDATES.find(
      (c) => !(c.supportedOptions?.SERVICE_TYPE ?? []).includes("TAKE_OUT"),
    )!;
    expect(contextBonusFor(takeOut, "LUNCH_PEAK", false)).toBeGreaterThan(0);
    expect(contextBonusFor(dineOnly, "LUNCH_PEAK", false)).toBe(0);
  });

  it("사용자가 이용방식을 직접 골랐으면 맥락은 개입하지 않는다", () => {
    const takeOut = CANDIDATES.find((c) => c.supportedOptions?.SERVICE_TYPE?.includes("TAKE_OUT"))!;
    expect(contextBonusFor(takeOut, "LUNCH_PEAK", /* serviceTypeChosen */ true)).toBe(0);
  });

  it("한산한 시간에는 순서를 바꾸지 않는다", () => {
    const takeOut = CANDIDATES.find((c) => c.supportedOptions?.SERVICE_TYPE?.includes("TAKE_OUT"))!;
    expect(contextBonusFor(takeOut, "OFF_PEAK", false)).toBe(0);
  });
});

describe("경계 3 — 만료된 신호는 없는 것으로 본다", () => {
  it("만료 후에는 시간대를 읽지 않는다", () => {
    const signals = buildContextSignals(CANDIDATES, LUNCH);
    expect(timeSlotFromSignals(signals, LUNCH)).toBe("LUNCH_PEAK");
    const twoHoursLater = new Date(LUNCH.getTime() + 2 * 60 * 60 * 1000);
    expect(timeSlotFromSignals(signals, twoHoursLater)).toBeUndefined();
  });

  it("만료된 신호는 추천 이유에서도 언급되지 않는다", () => {
    const signals = buildContextSignals(CANDIDATES, LUNCH);
    const expired = new Date(LUNCH.getTime() + 2 * 60 * 60 * 1000);
    const ctx: EngineContext = { preferences: {}, hardConstraints: {}, contextSignals: signals, now: expired };
    const rec = buildRecommendation(CANDIDATES, ctx);
    const reasons = explainCore(rec, ctx).join(" ");
    expect(reasons).not.toMatch(/붐빔|시간대라/);
    expect(reasons).toMatch(/시간대 정보는 사용하지 않았습니다/);
  });
});

describe("경계 4 — 반영했으면 반드시 말한다", () => {
  it("붐비는 시간에 순서를 바꿨으면 이유에 적는다", () => {
    const ctx: EngineContext = {
      preferences: {}, hardConstraints: {},
      contextSignals: buildContextSignals(CANDIDATES, LUNCH), now: LUNCH,
    };
    const rec = buildRecommendation(CANDIDATES, ctx);
    const reasons = explainCore(rec, ctx).join(" ");
    expect(reasons).toMatch(/점심 붐빔/);
    expect(reasons).toMatch(/순서만 바꿨습니다/);
  });

  it("선호가 있어 반영하지 않았으면 그 사실도 적는다", () => {
    const ctx: EngineContext = {
      preferences: { serviceType: "TAKE_OUT" }, hardConstraints: {},
      contextSignals: buildContextSignals(CANDIDATES, LUNCH), now: LUNCH,
    };
    const rec = buildRecommendation(CANDIDATES, ctx);
    expect(explainCore(rec, ctx).join(" ")).toMatch(/순서에 반영하지 않았습니다/);
  });
});

describe("계약 — Core 를 건드리지 않고 팀 namespace 로만 들어간다", () => {
  it("sessionContext.extensions 아래 팀 namespace 에 실린다", () => {
    const signals = buildContextSignals(CANDIDATES, LUNCH);
    const { ctx } = buildChickenContext({ serviceType: "포장" }, signals);
    const ext = (ctx as unknown as { extensions?: Record<string, unknown> }).extensions ?? {};
    expect(Object.keys(ext)).toEqual([CONTEXT_NAMESPACE]);
    // 공식 검증기의 sessionContext 확장 namespace 규칙을 그대로 검사한다.
    // (제출 최상위 extensions 는 teamId 와 정확히 일치해야 하는 별개 규칙이다)
    expect(CONTEXT_NAMESPACE).toMatch(/^[A-Z][A-Z0-9_]*\.[A-Za-z][A-Za-z0-9_]*$/);
  });

  it("신호가 없으면 extensions 키 자체를 만들지 않는다", () => {
    const { ctx } = buildChickenContext({ serviceType: "포장" });
    expect((ctx as unknown as { extensions?: unknown }).extensions).toBeUndefined();
  });

  it("5개 필수 섹션은 그대로 유지된다", () => {
    const { ctx } = buildChickenContext({ serviceType: "포장" }, buildContextSignals(CANDIDATES, LUNCH));
    for (const k of ["intent", "facts", "preferences", "hardConstraints", "capabilities"]) {
      expect(ctx).toHaveProperty(k);
    }
  });
});
