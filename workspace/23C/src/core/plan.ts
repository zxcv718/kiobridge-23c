/**
 * STEP 9 코어 — 의미 기반 실행계획 빌더.
 *
 * 원칙:
 *  - 좌표·컨트롤 ID를 절대 쓰지 않는다 (스키마가 거부).
 *  - expectedBefore/AfterState는 fixture.transitions에서 파생한다 — 하드코딩 금지.
 *  - reviewBoundaryState에서 멈추고 requiredVerifierAction으로 끝낸다.
 *  - 결제·금지 Action은 만들지 않는다 (계획에 있으면 차단돼도 FAIL).
 */
import type { Candidate, ExecutionPlan, PlanAction, PublicFixture, Recommendation, UserDecision } from "@kiobridge/participant-sdk";
import { SENTINEL } from "@kiobridge/profile-contract";
import type { EngineContext } from "./engine";

const definite = (v: string | undefined): v is string =>
  v !== undefined && v !== SENTINEL.NO_PREFERENCE && v !== SENTINEL.UNKNOWN;

/** transitions에서 (from, action) → to 를 찾는다. 없으면 예외 — 잘못된 계획을 만들지 않는다. */
function transitionTo(fixture: PublicFixture, from: string, action: string): string {
  const t = fixture.transitions.find((x) => x.from === from && x.action === action);
  if (!t) throw new Error(`fixture에 전이가 없습니다: ${from} --${action}--> ?`);
  return t.to;
}

/**
 * 옵션 그룹에서 실제 선택할 값 결정.
 *
 * 선호를 못 맞추면 **후보가 지원하는 값으로 대체한다** — 선택 그룹이라도 마찬가지다.
 *
 * 생략이 아니라 대체인 이유:
 *  - `preferences` 는 사전 정의상 "지키면 좋지만 필수는 아님 · 불일치해도 BLOCK 아님 →
 *    추천 점수/이유에 반영"이다. 즉 불일치는 **허용하되 알리는** 것이지 피할 대상이 아니다.
 *  - `cupOption` 에는 "컵 필요 없음"을 뜻하는 `NONE` 이 따로 있다. 사용자가 REGULAR 라고
 *    말했는데 우리가 생략하면 결과가 NONE 에 가까워져 **의도에서 더 멀어진다**.
 *    종이컵이라도 받는 편이 사용자에게 낫다.
 *  - 호환규칙이 이 대체를 WARN 으로 기록한다(CHICKEN_SELECTED_CUP_OPTION). 그 WARN 은
 *    없애야 할 흠이 아니라 **무엇을 못 맞췄는지 남긴 정직한 기록**이다.
 *
 * 대신 대체했다는 사실을 사용자가 승인 전에 반드시 보게 한다 —
 * `engine.ts` 의 unmetConditions 와 최종 확인 화면의 대체 안내가 그 역할을 한다.
 */
function chooseOptionValue(groupId: string, pref: string | undefined, candidate: Candidate): string | undefined {
  const supported = candidate.supportedOptions?.[groupId] ?? [];
  if (supported.length === 0) return undefined;
  if (definite(pref) && supported.includes(pref)) return pref;
  return supported[0];
}

/**
 * 옵션 그룹 ↔ 선호 필드 매핑 — **환경 의존적인 유일한 지점**이다.
 * 실행계획과 화면 안내가 반드시 같은 값을 보게 하려고 여기 한 곳에만 둔다.
 * (병원·관공서를 붙일 때 바꿀 곳도 여기 하나다)
 */
export function preferenceByGroup(prefs: EngineContext["preferences"]): Record<string, string | undefined> {
  const p = prefs as Record<string, unknown>;
  return {
    SERVICE_TYPE: p.serviceType as string | undefined,
    SPICY_LEVEL: p.spicyLevel as string | undefined,
    BONE_TYPE: p.boneType as string | undefined,
    CUP: p.cupOption as string | undefined,
  };
}

/** 사용자 선호와 다르게 대체된 옵션 목록 — 화면에서 "무엇이 바뀌었는지" 알리는 데 쓴다. */
export interface Substitution { groupId: string; wanted: string; used: string }

export function substitutionsFor(
  fixture: PublicFixture, candidate: Candidate, ctx: EngineContext,
): Substitution[] {
  const byGroup = preferenceByGroup(ctx.preferences);
  const out: Substitution[] = [];
  for (const g of fixture.optionGroups) {
    const pref = byGroup[g.groupId];
    if (!definite(pref)) continue;
    const supported = candidate.supportedOptions?.[g.groupId] ?? [];
    if (supported.length === 0 || supported.includes(pref)) continue;
    out.push({ groupId: g.groupId, wanted: pref, used: supported[0] });
  }
  return out;
}

export function buildExecutionPlanCore(
  decision: UserDecision,
  rec: Recommendation,
  fixture: PublicFixture,
  ctx: EngineContext,
): ExecutionPlan {
  const planId = `PLAN-23C-${fixture.manifest.environmentId}`;
  const base: Omit<ExecutionPlan, "actions"> = {
    planId,
    validationMode: "SIMULATION_ONLY",
    executionEnvironment: "DIGITAL_TWIN",
    actualDeviceCommandSent: false,
  };

  // 승인 없으면 빈 계획 — ACTIONS_WITHOUT_APPROVAL 방지 (자동 추천을 자동 실행으로 잇지 않는다)
  if (!decision.approved || rec.recommendedCandidateId === null) {
    return { ...base, actions: [] };
  }

  const candidate = fixture.candidates.find((c) => c.candidateId === rec.recommendedCandidateId);
  if (!candidate) throw new Error(`추천 후보가 fixture에 없습니다: ${rec.recommendedCandidateId}`);

  const actions: PlanAction[] = [];
  let state = fixture.manifest.initialState;
  const push = (action: string, target: PlanAction["target"], value?: PlanAction["value"]) => {
    const to = transitionTo(fixture, state, action);
    actions.push({
      actionIndex: actions.length,
      action,
      target,
      ...(value !== undefined ? { value } : {}),
      expectedBeforeState: state,
      expectedAfterState: to,
    });
    state = to;
  };

  // 1) 이용 방식 — 선호를 못 맞춰도 후보가 지원하는 값으로 진행한다
  const serviceChoice = chooseOptionValue("SERVICE_TYPE", ctx.preferences.serviceType, candidate);
  if (!serviceChoice) throw new Error("후보가 지원하는 이용 방식이 없습니다");
  push("select_service", { kind: "service_type", id: serviceChoice });

  // 2) 메뉴 선택 — 추천 후보 정확히 1회
  push("select_menu", { kind: "candidate", id: candidate.candidateId });

  // 3) 옵션 — 필수 그룹은 반드시, 선택 그룹(CUP)은 사용자가 선호를 말했을 때만
  const groups = fixture.optionGroups.filter((g) => g.groupId !== "SERVICE_TYPE");
  const prefMap = preferenceByGroup(ctx.preferences); // 화면 안내와 같은 매핑을 쓴다
  for (const g of groups) {
    if (g.groupId === "QUANTITY") {
      const wanted = ctx.preferences.quantity ?? 1;
      const opt =
        g.options.find((o) => (o as { value?: number }).value === wanted) ?? g.options[0];
      push("select_option", { kind: "option", groupId: g.groupId, id: opt.id }, (opt as { value?: number }).value ?? null);
      continue;
    }
    const choice = chooseOptionValue(g.groupId, prefMap[g.groupId], candidate);
    if (choice === undefined) continue;
    // 선택 그룹은 사용자가 아무 말도 안 했으면 건드리지 않는다.
    // (선호를 말했는데 못 맞추는 경우는 위에서 대체값이 잡히므로 여기서 걸리지 않는다)
    if (!g.required && !definite(prefMap[g.groupId])) continue;
    push("select_option", { kind: "option", groupId: g.groupId, id: choice });
  }

  // 4) 옵션 확인 → 담기 → 장바구니 → 검증(읽기 전용) — 전이표 순서 그대로
  push("confirm_option", { kind: "review", id: transitionTo(fixture, state, "confirm_option") });
  push("confirm_option", { kind: "review", id: transitionTo(fixture, state, "confirm_option") });
  push("open_cart_review", { kind: "review", id: fixture.manifest.reviewBoundaryState });
  push(fixture.manifest.requiredVerifierAction, { kind: "review", id: fixture.manifest.reviewBoundaryState });

  return { ...base, actions };
}
