/**
 * @kiobridge/kiosk-driver-contract
 *
 * The seam between the official execution engine and *how* a kiosk is driven.
 * The engine speaks only semantic actions (candidate / option / enumeration ids).
 * A driver decides what that means for its surface:
 *
 *   - SimulationDriver → virtual kiosk screens, templates, UI state
 *   - UPRLiteDriver    → UIA ids, OCR, coordinates, Windows Agent commands
 *                        (contract only today — PENDING_REAL_DEVICE)
 *
 * Swapping the driver must NOT require changing the environment manifest,
 * states, candidates, options, transitions, safety rules or a participant's
 * execution plan.
 */
import type {
  DriverId,
  DriverStatus,
  EnvironmentPack,
  ExecutionEvent,
  PlanAction,
  SemanticTarget,
  SimulationUiState,
  AnySessionContext,
  CanonicalProfile,
} from "@kiobridge/contracts";

/**
 * Everything a driver needs to start a run.
 *
 * `profile`        — long-lived user info; drives ACCESSIBILITY presentation
 *                    (largeText, highContrast, simpleSteps, hearing/visual support).
 * `sessionContext` — this session's intent/facts/preferences/hardConstraints;
 *                    drives WHAT is being selected on the kiosk.
 */
export interface DriverContext {
  pack: EnvironmentPack;
  profile: CanonicalProfile;
  sessionContext: AnySessionContext;
  /** Candidate the participant recommended (drives review payloads). */
  recommendedCandidateId: string | null;
}

/** Opaque-ish state a driver carries between actions. */
export interface DriverState {
  driverId: DriverId;
  currentState: string;
  uiState: SimulationUiState;
}

export interface ResolvedTarget {
  ok: boolean;
  /** Human-readable label for logs/Evidence (e.g. the menu name). */
  label?: string;
  /** Driver-specific handle (control id, automation id…). Never leaves the driver. */
  handle?: string;
  reason?: string;
  code?: string;
}

export interface DriverExecutionResult {
  ok: boolean;
  state: DriverState;
  events: ExecutionEvent[];
  resolvedLabel?: string;
  reason?: string;
}

export interface VerificationResult {
  ok: boolean;
  /** Read-only review payload (cart / check-in / application summary). */
  review: Record<string, unknown>;
  events: ExecutionEvent[];
  reason?: string;
}

export interface KioskDriver {
  readonly driverId: DriverId;
  readonly status: DriverStatus;

  initialize(context: DriverContext): Promise<DriverState>;
  resolveTarget(action: PlanAction, context: DriverContext, state: DriverState): Promise<ResolvedTarget>;
  execute(action: PlanAction, state: DriverState, context: DriverContext): Promise<DriverExecutionResult>;
  verify(action: PlanAction, state: DriverState, context: DriverContext): Promise<VerificationResult>;
  stop(reason: string, state: DriverState): Promise<DriverExecutionResult>;
}

// ---------------------------------------------------------------------------
// Shared, driver-agnostic semantic target resolution.
// Both drivers use this to decide whether a target is *meaningful*; each then
// maps it to its own surface.
// ---------------------------------------------------------------------------

export interface SemanticResolution {
  ok: boolean;
  label?: string;
  code?: string;
  reason?: string;
}

/** kind → groupId convention for enumeration-backed kinds (service_type → SERVICE_TYPE). */
export function groupIdForKind(kind: string): string {
  return kind.toUpperCase();
}

export function findOptionGroup(pack: EnvironmentPack, groupId: string) {
  return pack.optionGroups.find((g) => g.groupId === groupId);
}

/**
 * Resolve a semantic target against the (driver-agnostic) fixture.
 * "review" and "staff" kinds carry no lookup — they address the screen itself.
 */
export function resolveSemanticTarget(pack: EnvironmentPack, target: SemanticTarget): SemanticResolution {
  if (!target || !target.kind) {
    return { ok: false, code: "TARGET_NOT_RESOLVABLE", reason: "target.kind 가 없습니다." };
  }
  if (target.kind === "review" || target.kind === "staff" || target.kind === "none") {
    return { ok: true, label: target.id || target.kind };
  }
  if (target.kind === "candidate") {
    const c = pack.candidates.find((x) => x.candidateId === target.id);
    if (!c) return { ok: false, code: "CANDIDATE_NOT_FOUND", reason: `존재하지 않는 후보: ${target.id}` };
    return { ok: true, label: c.name };
  }
  const groupId = target.kind === "option" ? target.groupId : groupIdForKind(target.kind);
  if (!groupId) {
    return { ok: false, code: "OPTION_GROUP_NOT_FOUND", reason: "option 타깃에는 groupId 가 필요합니다." };
  }
  const group = findOptionGroup(pack, groupId);
  if (!group) return { ok: false, code: "OPTION_GROUP_NOT_FOUND", reason: `존재하지 않는 옵션 그룹: ${groupId}` };
  const value = group.options.find((o) => o.id === target.id);
  if (!value) return { ok: false, code: "OPTION_VALUE_NOT_FOUND", reason: `옵션 그룹 ${groupId} 에 없는 값: ${target.id}` };
  return { ok: true, label: value.label };
}
export * from "./review-resolver";
