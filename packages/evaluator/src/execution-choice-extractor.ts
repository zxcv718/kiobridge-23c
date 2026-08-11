/**
 * Execution choice extractor.
 *
 * Stage A asks "can this candidate serve the user?". That is not enough: a
 * candidate may support both FIRST_VISIT and REVISIT, and the plan can still
 * press the wrong one. This module reads what the plan ACTUALLY selected so
 * Stage B can compare those choices against the user's context.
 *
 * The action → option-group mapping comes from the environment pack (semantic
 * target kinds and declared option groups), never from per-environment
 * if-statements here.
 */
import {
  VALIDATION_CODES,
  type EnvironmentPack,
  type ExecutionPlan,
  type PlanAction,
  type ValidationError,
} from "@kiobridge/contracts";
import { groupIdForKind } from "@kiobridge/kiosk-driver-contract";

export interface ExecutionChoices {
  candidateId?: string;
  /** groupId → chosen value (or values when the group allows several). */
  selectedOptions: Record<string, string | string[]>;
  quantity?: number;
  /** groupId (or "candidate"/"quantity") → the action indexes that set it. */
  actionIndexes: Record<string, number[]>;
}

export interface ExecutionChoiceResult {
  choices: ExecutionChoices;
  errors: ValidationError[];
}

/** Target kinds that address the screen, not a value. */
const NON_VALUE_KINDS = new Set(["review", "staff", "none"]);

/**
 * Which option group an action writes to. `option` targets carry it explicitly;
 * other kinds map by name (service_type → SERVICE_TYPE), which is the same rule
 * the driver and the semantic resolver already use.
 */
export function optionGroupForAction(action: PlanAction): string | null {
  const t = action.target;
  if (!t || !t.kind || t.kind === "candidate" || NON_VALUE_KINDS.has(t.kind)) return null;
  if (t.kind === "option") return t.groupId ?? null;
  return groupIdForKind(t.kind);
}

/**
 * Read the plan's actual selections. Structural problems (duplicate selection
 * of a single-select group, unknown group, unknown value, missing required
 * group) are reported here — they make Stage B's comparison meaningless.
 */
export function extractExecutionChoices(plan: ExecutionPlan, pack: EnvironmentPack): ExecutionChoiceResult {
  const errors: ValidationError[] = [];
  const selectedOptions: Record<string, string | string[]> = {};
  const actionIndexes: Record<string, number[]> = {};
  const actions = plan?.actions ?? [];

  let candidateId: string | undefined;
  let quantity: number | undefined;

  const note = (key: string, index: number) => {
    (actionIndexes[key] ??= []).push(index);
  };

  for (const a of actions) {
    const t = a.target;
    if (!t || !t.kind) continue;

    if (t.kind === "candidate") {
      note("candidate", a.actionIndex);
      if (candidateId !== undefined && candidateId !== t.id) {
        errors.push({
          actionIndex: a.actionIndex,
          path: `/executionPlan/actions/${a.actionIndex}/target/id`,
          code: VALIDATION_CODES.EXECUTION_OPTION_DUPLICATE,
          message: `후보를 두 번 다른 값으로 선택했습니다: ${candidateId} → ${t.id}`,
          receivedValue: t.id,
        });
      }
      candidateId ??= t.id;
      continue;
    }
    if (NON_VALUE_KINDS.has(t.kind)) continue;

    const groupId = optionGroupForAction(a);
    if (!groupId) {
      errors.push({
        actionIndex: a.actionIndex,
        path: `/executionPlan/actions/${a.actionIndex}/target`,
        code: VALIDATION_CODES.EXECUTION_OPTION_GROUP_UNKNOWN,
        message: "이 Action 이 어느 옵션 그룹을 선택하는지 알 수 없습니다 (groupId 누락).",
      });
      continue;
    }

    const group = pack.optionGroups.find((g) => g.groupId === groupId);
    if (!group) {
      errors.push({
        actionIndex: a.actionIndex,
        path: `/executionPlan/actions/${a.actionIndex}/target/groupId`,
        code: VALIDATION_CODES.EXECUTION_OPTION_GROUP_UNKNOWN,
        message: `환경에 존재하지 않는 옵션 그룹: ${groupId}`,
        receivedValue: groupId,
      });
      continue;
    }

    const option = group.options.find((o) => o.id === t.id);
    if (!option) {
      errors.push({
        actionIndex: a.actionIndex,
        path: `/executionPlan/actions/${a.actionIndex}/target/id`,
        code: VALIDATION_CODES.EXECUTION_OPTION_VALUE_UNKNOWN,
        message: `옵션 그룹 ${groupId} 에 존재하지 않는 값: ${t.id}`,
        receivedValue: t.id,
        allowedValues: group.options.map((o) => o.id),
      });
      continue;
    }

    note(groupId, a.actionIndex);

    const previous = selectedOptions[groupId];
    if (previous !== undefined) {
      const previousList = Array.isArray(previous) ? previous : [previous];
      if (group.multiSelect === true) {
        if (!previousList.includes(t.id)) selectedOptions[groupId] = [...previousList, t.id];
      } else if (!previousList.includes(t.id)) {
        // Two different values for a single-select group: the plan contradicts
        // itself, and "last write wins" would hide that from the team.
        errors.push({
          actionIndex: a.actionIndex,
          path: `/executionPlan/actions/${a.actionIndex}/target/id`,
          code: VALIDATION_CODES.EXECUTION_OPTION_DUPLICATE,
          message: `${groupId} 를 서로 다른 값으로 두 번 선택했습니다: ${previousList.join(",")} → ${t.id}`,
          receivedValue: t.id,
        });
      }
    } else {
      selectedOptions[groupId] = group.multiSelect === true ? [t.id] : t.id;
    }

    // Quantity is a normal option group whose value carries a number.
    if (groupId === "QUANTITY") {
      const parsed = typeof option.value === "number" ? option.value : Number(String(t.id).replace(/\D/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) quantity = parsed;
      else {
        errors.push({
          actionIndex: a.actionIndex,
          path: `/executionPlan/actions/${a.actionIndex}/target/id`,
          code: VALIDATION_CODES.EXECUTION_OPTION_VALUE_UNKNOWN,
          message: `수량 값을 해석할 수 없습니다: ${t.id}`,
          receivedValue: t.id,
        });
      }
    }
  }

  // Required groups must actually be chosen — but only once the plan does
  // something at all (an empty plan is reported by an earlier stage).
  if (actions.length > 0) {
    for (const g of pack.optionGroups.filter((x) => x.required)) {
      if (selectedOptions[g.groupId] === undefined) {
        errors.push({
          path: "/executionPlan/actions",
          code: VALIDATION_CODES.EXECUTION_REQUIRED_OPTION_MISSING,
          message: `필수 옵션 그룹을 선택하지 않았습니다: ${g.groupId} (${g.label})`,
          receivedValue: null,
          allowedValues: g.options.map((o) => o.id),
        });
      }
    }
  }

  return { choices: { candidateId, selectedOptions, quantity, actionIndexes }, errors };
}
