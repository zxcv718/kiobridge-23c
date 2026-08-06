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
 * 필수 그룹은 반드시 하나를 골라야 하므로(REQUIRED_OPTION_MISSING), 선호를 못 맞추면
 * 후보가 지원하는 첫 값으로 대체한다 — 계약이 강제하는 어쩔 수 없는 대체다.
 *
 * 선택 그룹은 다르다. 넣지 않아도 되므로, 선호를 정확히 만족하지 못하면 **아무것도 넣지 않는다**.
 * 못 맞추는데 다른 값으로 바꿔 넣으면 사용자가 말하지 않은 것을 우리가 정하는 셈이고,
 * 호환규칙도 그것을 잡아낸다(예: CHICKEN_SELECTED_CUP_OPTION — 사용자 REGULAR vs 실행 PAPER).
 */
function chooseOptionValue(
  groupId: string, pref: string | undefined, candidate: Candidate, required: boolean,
): string | undefined {
  const supported = candidate.supportedOptions?.[groupId] ?? [];
  if (supported.length === 0) return undefined;
  if (definite(pref) && supported.includes(pref)) return pref;
  if (!required) return undefined; // 선택 그룹은 선호를 못 맞추면 건드리지 않는다
  return supported[0];
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

  // 1) 이용 방식 — 필수 그룹이므로 선호를 못 맞춰도 후보가 지원하는 값으로 진행한다
  const serviceChoice = chooseOptionValue("SERVICE_TYPE", ctx.preferences.serviceType, candidate, true);
  if (!serviceChoice) throw new Error("후보가 지원하는 이용 방식이 없습니다");
  push("select_service", { kind: "service_type", id: serviceChoice });

  // 2) 메뉴 선택 — 추천 후보 정확히 1회
  push("select_menu", { kind: "candidate", id: candidate.candidateId });

  // 3) 옵션 — 필수 그룹은 반드시, 선택 그룹(CUP)은 선호를 정확히 만족할 때만
  const groups = fixture.optionGroups.filter((g) => g.groupId !== "SERVICE_TYPE");
  for (const g of groups) {
    const prefMap: Record<string, string | undefined> = {
      SPICY_LEVEL: ctx.preferences.spicyLevel,
      BONE_TYPE: ctx.preferences.boneType,
      CUP: ctx.preferences.cupOption,
    };
    if (g.groupId === "QUANTITY") {
      const wanted = ctx.preferences.quantity ?? 1;
      const opt =
        g.options.find((o) => (o as { value?: number }).value === wanted) ?? g.options[0];
      push("select_option", { kind: "option", groupId: g.groupId, id: opt.id }, (opt as { value?: number }).value ?? null);
      continue;
    }
    // 선택 그룹에서 선호가 없거나 후보가 못 맞추면 chooseOptionValue 가 undefined 를 준다 → 건너뛴다
    const choice = chooseOptionValue(g.groupId, prefMap[g.groupId], candidate, g.required === true);
    if (choice === undefined) continue;
    push("select_option", { kind: "option", groupId: g.groupId, id: choice });
  }

  // 4) 옵션 확인 → 담기 → 장바구니 → 검증(읽기 전용) — 전이표 순서 그대로
  push("confirm_option", { kind: "review", id: transitionTo(fixture, state, "confirm_option") });
  push("confirm_option", { kind: "review", id: transitionTo(fixture, state, "confirm_option") });
  push("open_cart_review", { kind: "review", id: fixture.manifest.reviewBoundaryState });
  push(fixture.manifest.requiredVerifierAction, { kind: "review", id: fixture.manifest.reviewBoundaryState });

  return { ...base, actions };
}
