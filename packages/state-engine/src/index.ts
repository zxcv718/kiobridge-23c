/**
 * @kiobridge/state-engine
 * Data-driven common state machine — DRIVER-AGNOSTIC.
 *
 * It validates MEANING and STATE TRANSITIONS only. It knows nothing about
 * coordinates, UIA ids or virtual controls; semantic target resolution is
 * delegated to the shared resolver in @kiobridge/kiosk-driver-contract.
 */
import type { EnvironmentPack, PlanAction, ScreenDef, SemanticTarget, Transition } from "@kiobridge/contracts";
import { resolveSemanticTarget } from "@kiobridge/kiosk-driver-contract";

export type StepErrorCode =
  | "UNKNOWN_STATE"
  | "FORBIDDEN_ACTION"
  | "INVALID_TRANSITION"
  | "STATE_MISMATCH"
  | "TARGET_KIND_NOT_ALLOWED"
  | "TARGET_NOT_RESOLVABLE";

export interface ApplyInput {
  currentState: string;
  action: string;
  target?: SemanticTarget;
  expectedBeforeState?: string;
  expectedAfterState?: string;
}

export interface ApplyResult {
  ok: boolean;
  nextState: string;
  errorCode?: StepErrorCode;
  reason?: string;
  readOnly: boolean;
}

export function getTransition(pack: EnvironmentPack, from: string, action: string): Transition | undefined {
  return pack.transitions.find((t) => t.from === from && t.action === action);
}

export function getScreen(pack: EnvironmentPack, state: string): ScreenDef | undefined {
  return pack.screens.find((s) => s.state === state);
}

export const isKnownState = (pack: EnvironmentPack, state: string) => pack.manifest.states.includes(state);
export const isForbiddenAction = (pack: EnvironmentPack, action: string) => pack.manifest.forbiddenActions.includes(action);

/** Is this semantic target kind selectable on this screen? */
export function isTargetKindAllowed(pack: EnvironmentPack, state: string, kind: string): boolean {
  const screen = getScreen(pack, state);
  if (!screen) return false;
  return screen.targetKinds.includes(kind);
}

/** Validate & apply one semantic action. Structured result; caller decides STOP. */
export function applyAction(pack: EnvironmentPack, input: ApplyInput): ApplyResult {
  const { currentState, action, target, expectedBeforeState, expectedAfterState } = input;

  if (!isKnownState(pack, currentState)) return fail(currentState, "UNKNOWN_STATE", `알 수 없는 상태: ${currentState}`);
  if (isForbiddenAction(pack, action)) return fail(currentState, "FORBIDDEN_ACTION", `금지된 Action: ${action}`);
  if (expectedBeforeState !== undefined && expectedBeforeState !== currentState) {
    return fail(currentState, "STATE_MISMATCH", `현재 상태는 ${currentState} 이지만 expectedBeforeState 는 ${expectedBeforeState} 입니다.`);
  }

  const transition = getTransition(pack, currentState, action);
  if (!transition) return fail(currentState, "INVALID_TRANSITION", `상태 ${currentState} 에서 허용되지 않는 Action: ${action}`);

  if (target) {
    if (!isTargetKindAllowed(pack, currentState, target.kind)) {
      return fail(currentState, "TARGET_KIND_NOT_ALLOWED", `${currentState} 화면에서 선택할 수 없는 대상 종류: ${target.kind}`);
    }
    const resolved = resolveSemanticTarget(pack, target);
    if (!resolved.ok) return fail(currentState, "TARGET_NOT_RESOLVABLE", resolved.reason ?? "대상을 확인할 수 없습니다.");
  }

  if (expectedAfterState !== undefined && expectedAfterState !== transition.to) {
    return fail(currentState, "STATE_MISMATCH", `expectedAfterState(${expectedAfterState}) 가 transition.to(${transition.to}) 와 다릅니다.`);
  }

  const readOnly = (transition.guards ?? []).includes("readOnly");
  return { ok: true, nextState: readOnly ? currentState : transition.to, readOnly };
}

function fail(currentState: string, errorCode: StepErrorCode, reason: string): ApplyResult {
  return { ok: false, nextState: currentState, errorCode, reason, readOnly: false };
}

/** Is `state` the environment's read-only review boundary? */
export function isFinalReviewState(pack: EnvironmentPack, state: string): boolean {
  return state === pack.manifest.reviewBoundaryState || Boolean(getScreen(pack, state)?.isFinalReview);
}

export type { PlanAction };
