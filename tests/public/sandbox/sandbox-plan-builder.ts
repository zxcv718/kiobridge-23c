/**
 * SANDBOX-ONLY plan builder.
 *
 * ⚠️ This helper refuses to run for the three EVALUATED environments
 * (chicken-store / hospital / public-office). Generating a complete execution
 * plan for those is the PARTICIPANT'S job — publishing a generator here would
 * hand out the answer and let the official package do the team's work.
 *
 * It exists so the practice environment can ship a working end-to-end example
 * and so the sandbox connection flow can be regression-tested.
 *
 * The official-environment equivalent lives only in the private evaluation
 * repository (see docs/PRIVATE_EVALUATION_BOUNDARY.md).
 */
import type { AnySessionContext, Candidate, EnvironmentPack, ParticipantSubmission, PlanAction, SemanticTarget } from "@kiobridge/contracts";
import { groupIdForKind } from "@kiobridge/kiosk-driver-contract";

const NON_GROUP_KINDS = new Set(["candidate", "review", "staff", "none"]);

/** Shortest transition path initialState → reviewBoundaryState (self-loops excluded). */
function shortestPath(pack: EnvironmentPack): { from: string; action: string; to: string }[] {
  const goal = pack.manifest.reviewBoundaryState;
  const queue: { state: string; path: { from: string; action: string; to: string }[] }[] = [
    { state: pack.manifest.initialState, path: [] },
  ];
  const seen = new Set([pack.manifest.initialState]);
  while (queue.length) {
    const { state, path } = queue.shift()!;
    if (state === goal) return path;
    for (const t of pack.transitions) {
      if (t.from !== state || t.to === state || seen.has(t.to)) continue;
      seen.add(t.to);
      queue.push({ state: t.to, path: [...path, { from: t.from, action: t.action, to: t.to }] });
    }
  }
  throw new Error(`no path to ${goal} in ${pack.manifest.environmentId}`);
}

function groupKindsOnScreen(pack: EnvironmentPack, state: string): string[] {
  const screen = pack.screens.find((s) => s.state === state);
  return (screen?.targetKinds ?? []).filter((k) => !NON_GROUP_KINDS.has(k));
}

function optionIdFor(pack: EnvironmentPack, groupId: string, candidate?: Candidate): string | undefined {
  const group = pack.optionGroups.find((g) => g.groupId === groupId);
  if (!group) return undefined;
  const supported = candidate?.supportedOptions?.[groupId];
  const pick = group.options.find((o) => !supported || supported.includes(o.id));
  return pick?.id;
}

export interface BuiltPlan {
  actions: PlanAction[];
  candidate: Candidate;
}

/** Environments this helper is allowed to build plans for. */
const SANDBOX_ONLY = new Set(["sandbox"]);

function assertSandbox(pack: EnvironmentPack): void {
  if (SANDBOX_ONLY.has(pack.manifest.environmentId) || pack.manifest.sandbox === true) return;
  throw new Error(
    `[sandbox-plan-builder] "${pack.manifest.environmentId}" 환경의 실행계획은 생성할 수 없습니다. ` +
      "공식 평가 환경의 실행계획은 참가팀이 직접 개발해야 합니다 " +
      "(docs/PRIVATE_EVALUATION_BOUNDARY.md 참고).",
  );
}

/** Build a complete, valid SANDBOX plan (reaches the boundary and runs the verifier). */
export function buildSandboxPlan(pack: EnvironmentPack, candidateId?: string): BuiltPlan {
  assertSandbox(pack);
  // Default to a candidate on the SECOND grid page, so the shipped sandbox
  // example exercises the driver's page resolution rather than card slot 0.
  const pageSize = Object.values(pack.bindings?.simulation?.screens ?? {})
    .find((b) => b.dataSource === "candidates")?.pageSize ?? 4;
  const secondPage = pack.candidates.slice(pageSize).find((c) => c.available);
  const candidate =
    (candidateId ? pack.candidates.find((c) => c.candidateId === candidateId) : undefined) ??
    secondPage ??
    pack.candidates.find((c) => c.available)!;

  const path = shortestPath(pack);
  const actions: PlanAction[] = [];
  const chosenGroups = new Set<string>();
  const push = (action: string, target: SemanticTarget, before: string, after: string) =>
    actions.push({ actionIndex: actions.length, action, target, expectedBeforeState: before, expectedAfterState: after });

  for (const step of path) {
    // 1. satisfy option groups selectable on this screen via self-loop actions.
    const selfLoop = pack.transitions.find((t) => t.from === step.from && t.to === step.from && !(t.guards ?? []).includes("readOnly"));
    if (selfLoop) {
      for (const kind of groupKindsOnScreen(pack, step.from)) {
        const groupId = groupIdForKind(kind);
        for (const g of pack.optionGroups.filter((x) => x.groupId === groupId || (kind === "option" && !chosenGroups.has(x.groupId) && groupKindsOnScreen(pack, step.from).includes("option")))) {
          if (chosenGroups.has(g.groupId)) continue;
          // only groups actually reachable through this screen's kinds
          const reachable = kind === "option" ? g.kind === "option" : groupIdForKind(kind) === g.groupId;
          if (!reachable) continue;
          const optionId = optionIdFor(pack, g.groupId, candidate);
          if (!optionId) continue;
          chosenGroups.add(g.groupId);
          push(selfLoop.action, kind === "option" ? { kind: "option", groupId: g.groupId, id: optionId } : { kind, id: optionId }, step.from, step.from);
        }
      }
    }

    // 2. the advancing action.
    const kinds = pack.screens.find((s) => s.state === step.from)?.targetKinds ?? [];
    let target: SemanticTarget;
    // The generic "option" kind is only used for self-loop group selection;
    // an advancing action targets a named enumeration, a candidate, or the screen.
    const groupKinds = groupKindsOnScreen(pack, step.from)
      .filter((k) => k !== "option")
      .filter((k) => !chosenGroups.has(groupIdForKind(k)));
    if (kinds.includes("candidate") && !actions.some((a) => a.target.kind === "candidate")) {
      target = { kind: "candidate", id: candidate.candidateId };
    } else if (groupKinds.length > 0) {
      const groupId = groupIdForKind(groupKinds[0]);
      const optionId = optionIdFor(pack, groupId, candidate);
      chosenGroups.add(groupId);
      target = { kind: groupKinds[0], id: optionId ?? "" };
    } else {
      target = { kind: "review", id: step.to };
    }
    push(step.action, target, step.from, step.to);
  }

  // 3. any remaining required groups selectable at the last non-boundary screen.
  const boundary = pack.manifest.reviewBoundaryState;
  for (const g of pack.optionGroups.filter((x) => x.required && !chosenGroups.has(x.groupId))) {
    const host = pack.screens.find((s) => s.state !== boundary && (s.targetKinds.includes("option") || s.targetKinds.includes(g.kind ?? "")));
    const selfLoop = host && pack.transitions.find((t) => t.from === host.state && t.to === host.state && !(t.guards ?? []).includes("readOnly"));
    if (!host || !selfLoop) continue;
    const optionId = optionIdFor(pack, g.groupId, candidate);
    if (!optionId) continue;
    const insertAt = actions.findIndex((a) => a.expectedBeforeState === host.state);
    const act: PlanAction = {
      actionIndex: 0, action: selfLoop.action,
      target: g.kind === "option" || !g.kind ? { kind: "option", groupId: g.groupId, id: optionId } : { kind: g.kind, id: optionId },
      expectedBeforeState: host.state, expectedAfterState: host.state,
    };
    if (insertAt >= 0) actions.splice(insertAt, 0, act);
    else actions.push(act);
    chosenGroups.add(g.groupId);
  }

  // 4. the required read-only verifier at the boundary.
  actions.push({
    actionIndex: 0, action: pack.manifest.requiredVerifierAction,
    target: { kind: "review", id: boundary },
    expectedBeforeState: boundary, expectedAfterState: boundary,
  });

  actions.forEach((a, i) => (a.actionIndex = i));
  return { actions, candidate };
}

/** Minimal canonical SessionContext consistent with the plan we just built. */
function buildSessionContext(pack: EnvironmentPack, candidate: Candidate): AnySessionContext {
  const env = pack.manifest.environmentId;
  const base = { facts: {}, preferences: {}, hardConstraints: {}, capabilities: {}, fieldMetadata: {} };
  if (env === "chicken-store") {
    return { ...base, intent: { task: "ORDER_FOOD" }, preferences: { serviceType: "NO_PREFERENCE", spicyLevel: "NO_PREFERENCE", boneType: "NO_PREFERENCE", quantity: 1 }, hardConstraints: { allergenIds: [] } } as AnySessionContext;
  }
  if (env === "hospital") {
    return { ...base, intent: { task: "CHECK_IN" }, facts: { visitType: "UNKNOWN", appointmentStatus: "UNKNOWN", departmentId: "UNSPECIFIED" }, hardConstraints: { medicalInferenceAllowed: false } } as AnySessionContext;
  }
  if (env === "public-office") {
    return { ...base, intent: { task: "PUBLIC_SERVICE_GUIDANCE", requestedServiceId: candidate.candidateId }, facts: { serviceCategory: "UNKNOWN" }, hardConstraints: { legalEligibilityInferenceAllowed: false }, capabilities: { availableAuthMethods: ["MOBILE_AUTH", "ID_CARD"] } } as AnySessionContext;
  }
  return { ...base, intent: { task: "PRACTICE" }, preferences: { size: "NO_PREFERENCE" } } as AnySessionContext;
}

/** A complete, schema-valid SANDBOX submission for tests / the sandbox example. */
export function buildSandboxSubmission(pack: EnvironmentPack, teamId = "TEAM-EXAMPLE"): ParticipantSubmission {
  assertSandbox(pack);
  const { actions, candidate } = buildSandboxPlan(pack);
  const excluded = pack.candidates.filter((c) => !c.available).map((c) => ({
    candidateId: c.candidateId, reasonCode: "UNAVAILABLE", explanation: "이용할 수 없는 항목입니다.",
  }));
  return {
    inputContractVersion: "1.0.0",
    submissionVersion: "1.0.0",
    teamId,
    environmentId: pack.manifest.environmentId,
    profile: {
      profileId: "TEAM-PROFILE-001",
      dataClassification: "SYNTHETIC_PROFILE",
      source: { collectionChannel: "WEB_FORM", providerId: teamId, collectedAt: "2026-08-01T05:30:00.000Z" },
      accessibility: { largeText: false, simpleSteps: false, visualGuidance: false, hearingSupport: false, mobilitySupport: false, highContrast: false, staffAssistancePreferred: false },
      interaction: { preferredInput: "TOUCH", language: "ko-KR", confirmationRequired: true },
      consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
    },
    sessionContext: buildSessionContext(pack, candidate),
    recommendation: {
      recommendedCandidateId: candidate.candidateId,
      alternativeCandidateIds: [],
      excludedCandidates: excluded,
      scoreBreakdown: {},
      recommendationReasons: ["사용자 조건에 맞는 항목입니다."],
      unmetConditions: [],
      confidence: 0.8,
      requiresReconfirmation: false,
    },
    userDecision: { approved: true, decision: "APPROVE", confirmedAt: "2026-08-01T06:00:00.000Z" },
    executionPlan: {
      planId: `PLAN-${pack.manifest.environmentId}`,
      validationMode: "SIMULATION_ONLY",
      executionEnvironment: "DIGITAL_TWIN",
      actualDeviceCommandSent: false,
      actions,
    },
  };
}
