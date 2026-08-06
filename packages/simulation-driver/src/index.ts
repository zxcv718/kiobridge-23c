/**
 * @kiobridge/simulation-driver
 *
 * Drives the VIRTUAL kiosk. It turns semantic actions into concrete screen
 * changes and selection state, and emits the execution events the web replays.
 *
 * It never touches a real device: no coordinates, no UIA, no Windows input.
 * Layout comes from `bindings/simulation.binding.json` (templates), never from
 * device coordinates.
 */
import type {
  Candidate,
  CartItem,
  EnvironmentPack,
  DriverId,
  DriverStatus,
  ExecutionEvent,
  ExecutionEventType,
  PlanAction,
  SimulationUiState,
  Transition,
} from "@kiobridge/contracts";
import {
  resolveSemanticTarget,
  resolveReview,
  reviewToSnapshot,
  groupIdForKind,
  type DriverContext,
  type DriverExecutionResult,
  type DriverState,
  type KioskDriver,
  type ResolvedTarget,
  type VerificationResult,
} from "@kiobridge/kiosk-driver-contract";

/** Paging geometry for a FOUR_CARD_GRID screen. */
export interface CandidatePagePosition {
  pageIndex: number;
  slotIndex: number;
  pageSize: number;
  pageCount: number;
  template: string;
}

/** Cards shown on one page of a grid screen. */
export function pageOf<T>(items: T[], pageIndex: number, pageSize: number): T[] {
  const start = pageIndex * pageSize;
  return items.slice(start, start + pageSize);
}

export function pageCountFor(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Where a semantic candidate id lands on the simulated screen.
 * Participants never compute this — they submit {kind:"candidate", id} and the
 * driver turns it into a page and a slot.
 */
export function locateCandidate(
  candidates: { candidateId: string }[],
  candidateId: string,
  pageSize: number,
  template = "FOUR_CARD_GRID",
): CandidatePagePosition | null {
  const index = candidates.findIndex((c) => c.candidateId === candidateId);
  if (index < 0) return null;
  const size = pageSize > 0 ? pageSize : candidates.length || 1;
  return {
    pageIndex: Math.floor(index / size),
    slotIndex: index % size,
    pageSize: size,
    pageCount: pageCountFor(candidates.length, size),
    template,
  };
}

export class SimulationDriver implements KioskDriver {
  readonly driverId: DriverId = "SIMULATION";
  readonly status: DriverStatus = "READY";

  /** Grid binding for a state, if that state renders candidate cards. */
  private gridBindingFor(pack: EnvironmentPack, state: string) {
    const b = pack.bindings?.simulation?.screens?.[state];
    if (!b || b.dataSource !== "candidates") return null;
    return { template: b.template as string, pageSize: b.pageSize ?? 4, navigation: b.navigation };
  }

  /** Recompute which cards the current page shows. */
  private withPaging(ui: SimulationUiState, pack: EnvironmentPack, state: string, page?: number): SimulationUiState {
    const grid = this.gridBindingFor(pack, state);
    if (!grid) return { ...ui, visibleCandidateIds: [] };
    const pageSize = grid.pageSize;
    const pageCount = pageCountFor(pack.candidates.length, pageSize);
    const currentPage = Math.min(Math.max(page ?? ui.currentPage ?? 0, 0), pageCount - 1);
    return {
      ...ui,
      pageSize,
      pageCount,
      currentPage,
      visibleCandidateIds: pageOf<Candidate>(pack.candidates, currentPage, pageSize).map((c) => c.candidateId),
    };
  }

  async initialize(context: DriverContext): Promise<DriverState> {
    const { pack, profile } = context;
    // Accessibility presentation comes from the PROFILE, not the session context.
    const uiState: SimulationUiState = {
      environmentId: pack.manifest.environmentId,
      currentState: pack.manifest.initialState,
      selectedOptions: {},
      quantity: 1,
      cartItems: [],
      accessibilityMode: {
        largeText: profile.accessibility.largeText,
        highContrast: profile.accessibility.highContrast,
        simpleLanguage: profile.accessibility.simpleSteps,
        visualGuidance: profile.accessibility.visualGuidance,
        hearingSupport: profile.accessibility.hearingSupport,
      },
      currentPage: 0,
      pageSize: 4,
      pageCount: 1,
      visibleCandidateIds: [],
      // Session-scoped selections start empty and are filled by the plan.
    };
    const paged = this.withPaging(uiState, pack, pack.manifest.initialState);
    return { driverId: this.driverId, currentState: pack.manifest.initialState, uiState: paged };
  }

  async resolveTarget(action: PlanAction, context: DriverContext, state: DriverState): Promise<ResolvedTarget> {
    const r = resolveSemanticTarget(context.pack, action.target);
    if (!r.ok) return { ok: false, code: r.code, reason: r.reason };
    // The simulation "handle" is just a stable synthetic id — never a coordinate.
    const handle = `sim:${state.currentState}:${action.target.kind}:${action.target.id}`;
    return { ok: true, label: r.label, handle };
  }

  async execute(action: PlanAction, state: DriverState, context: DriverContext): Promise<DriverExecutionResult> {
    const { pack } = context;
    const events: ExecutionEvent[] = [];
    let ui: SimulationUiState = { ...state.uiState, selectedOptions: { ...state.uiState.selectedOptions }, cartItems: [...state.uiState.cartItems] };

    const resolved = await this.resolveTarget(action, context, state);
    if (!resolved.ok) {
      return { ok: false, state, events, reason: resolved.reason };
    }

    const emit = (type: ExecutionEventType, message: string, extra: Partial<ExecutionEvent> = {}) => {
      events.push({ type, actionIndex: action.actionIndex, message, target: action.target, uiState: { ...ui, selectedOptions: { ...ui.selectedOptions }, cartItems: [...ui.cartItems] }, ...extra });
    };

    emit("TARGET_RESOLVED", `대상 확인: ${resolved.label ?? action.target.id}`);

    // --- semantic candidate -> page + slot on the simulated grid -------------
    // The team submits an id; the kiosk shows four cards at a time. Turning the
    // page is the DRIVER's job, and it is simulated navigation, not a device.
    if (action.target.kind === "candidate") {
      const grid = this.gridBindingFor(pack, state.currentState);
      if (grid) {
        const pos = locateCandidate(pack.candidates, action.target.id, grid.pageSize, grid.template);
        if (pos) {
          const fromPage = ui.currentPage ?? 0;
          if (pos.pageIndex !== fromPage) {
            ui = this.withPaging(ui, pack, state.currentState, pos.pageIndex);
            events.push({
              type: "SYNTHETIC_PAGE_CHANGED",
              actionIndex: action.actionIndex,
              message: `가상 페이지 이동: ${fromPage + 1} → ${pos.pageIndex + 1} (총 ${pos.pageCount}페이지)`,
              target: action.target,
              classification: "SYNTHETIC_MOCK",
              fromPage,
              toPage: pos.pageIndex,
              reason: "RESOLVE_SEMANTIC_CANDIDATE",
              uiState: { ...ui, selectedOptions: { ...ui.selectedOptions }, cartItems: [...ui.cartItems] },
            });
          } else {
            ui = this.withPaging(ui, pack, state.currentState, pos.pageIndex);
          }
          ui = { ...ui, resolvedCandidatePage: pos.pageIndex, resolvedCandidateSlot: pos.slotIndex };
        }
      }
    }

    ui = { ...ui, highlightedTarget: action.target, pressedTarget: undefined };
    emit("TARGET_HIGHLIGHTED", `${resolved.label ?? action.target.id} 강조`);

    ui = { ...ui, pressedTarget: action.target };
    emit("TARGET_PRESSED", `${resolved.label ?? action.target.id} 선택`);

    // --- apply the semantic value to the virtual UI state ---------------------
    ui = this.applyValue(ui, action, context, resolved.label);
    emit("VALUE_APPLIED", `값 적용: ${this.describeValue(action, resolved.label)}`);

    // --- state transition ----------------------------------------------------
    const transition = pack.transitions.find((t: Transition) => t.from === state.currentState && t.action === action.action);
    const readOnly = (transition?.guards ?? []).includes("readOnly");
    const nextState = !transition || readOnly ? state.currentState : transition.to;

    if (nextState !== state.currentState) {
      emit("SCREEN_TRANSITION_STARTED", `${state.currentState} → ${nextState}`, { fromState: state.currentState, toState: nextState });
      ui = { ...ui, previousState: state.currentState, currentState: nextState, highlightedTarget: undefined, pressedTarget: undefined };
      // A new screen may render a different grid: reset to its first page.
      ui = this.withPaging(ui, pack, nextState, 0);
      emit("SCREEN_TRANSITION_COMPLETED", `${nextState} 화면 표시`, { fromState: state.currentState, toState: nextState });
    }

    // Entering the review boundary refreshes the review payload.
    if (nextState === pack.manifest.reviewBoundaryState) {
      ui = this.buildReview(ui, context);
      emit("REVIEW_UPDATED", "검토 화면 내용 갱신");
    }

    return {
      ok: true,
      state: { ...state, currentState: nextState, uiState: ui },
      events,
      resolvedLabel: resolved.label,
    };
  }

  async verify(action: PlanAction, state: DriverState, context: DriverContext): Promise<VerificationResult> {
    // Read-only: refresh & expose the review payload, never advance the screen.
    const ui = this.buildReview(state.uiState, context);
    const review = this.reviewOf(ui, context);
    const events: ExecutionEvent[] = [{
      type: "VERIFIER_EXECUTED",
      actionIndex: action.actionIndex,
      message: `읽기 전용 검증: ${action.action}`,
      target: action.target,
      uiState: ui,
    }];
    return { ok: true, review, events };
  }

  async stop(reason: string, state: DriverState): Promise<DriverExecutionResult> {
    const events: ExecutionEvent[] = [{
      type: "RUN_STOPPED",
      actionIndex: -1,
      message: `안전경계에서 시뮬레이션을 종료했습니다 (${reason})`,
      uiState: state.uiState,
    }];
    return { ok: true, state, events };
  }

  // -------------------------------------------------------------------------
  private applyValue(ui: SimulationUiState, action: PlanAction, context: DriverContext, label?: string): SimulationUiState {
    const { pack } = context;
    const t = action.target;

    if (t.kind === "candidate") {
      const c = pack.candidates.find((x: Candidate) => x.candidateId === t.id);
      if (c) return { ...ui, selectedCandidate: { id: c.candidateId, name: c.name, price: c.price } };
      return ui;
    }

    if (t.kind === "review" || t.kind === "staff" || t.kind === "none") return ui;

    const groupId = t.kind === "option" ? (t.groupId ?? "") : groupIdForKind(t.kind);
    const group = pack.optionGroups.find((g) => g.groupId === groupId);
    const value = group?.options.find((o) => o.id === t.id);
    const next: SimulationUiState = { ...ui, selectedOptions: { ...ui.selectedOptions, [groupId]: t.id } };

    if (groupId === "SERVICE_TYPE") next.serviceType = label ?? t.id;
    if (groupId === "QUANTITY") next.quantity = value?.value ?? (Number(t.id.replace(/\D/g, "")) || 1);
    return next;
  }

  private describeValue(action: PlanAction, label?: string): string {
    const t = action.target;
    const scope = t.kind === "option" ? `${t.groupId}=` : `${t.kind}=`;
    return `${scope}${label ?? t.id}`;
  }

  /**
   * Refresh the review payload. Every field comes from the environment's
   * declared review-mapping; the driver contributes only values it alone knows
   * (totals, confirmation labels) and never guesses a domain value.
   */
  private buildReview(ui: SimulationUiState, context: DriverContext): SimulationUiState {
    const { pack } = context;
    const selectedCandidate = ui.selectedCandidate
      ? pack.candidates.find((c: Candidate) => c.candidateId === ui.selectedCandidate!.id)
      : undefined;

    const labelOf = (groupId: string) => {
      const id = ui.selectedOptions[groupId];
      const g = pack.optionGroups.find((x) => x.groupId === groupId);
      return g?.options.find((o) => o.id === id)?.label ?? (id as string | undefined);
    };

    // Chicken-store keeps a cart so the twin can show a running order.
    const cartItems: CartItem[] = selectedCandidate
      ? [{
          candidateId: selectedCandidate.candidateId,
          name: selectedCandidate.name,
          price: selectedCandidate.price,
          quantity: ui.quantity,
          options: Object.fromEntries(Object.entries(ui.selectedOptions).map(([g, v]) => [g, labelOf(g) ?? String(v)])),
        }]
      : [];
    const total = cartItems.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);

    const allergenIds = ((context.sessionContext as unknown as Record<string, Record<string, unknown>> | undefined)
      ?.hardConstraints?.allergenIds ?? []) as string[];
    const candidateAllergens = ((selectedCandidate?.attributes as Record<string, unknown> | undefined)
      ?.allergenIds ?? []) as string[];
    const clash = allergenIds.filter((a) => candidateAllergens.includes(a));

    const uiValues: Record<string, unknown> = {
      quantity: ui.quantity,
      totalPriceLabel: total > 0 ? `${total.toLocaleString("ko-KR")}원` : undefined,
      allergenCheckLabel: allergenIds.length === 0
        ? "제약 없음"
        : clash.length > 0 ? `충돌: ${clash.join(", ")}` : `확인됨 (${allergenIds.join(", ")} 제외)`,
      targetMatchLabel: selectedCandidate && context.recommendedCandidateId === selectedCandidate.candidateId
        ? "일치" : selectedCandidate ? "불일치" : undefined,
      userDecisionLabel: "승인됨",
      currentPage: ui.currentPage,
    };

    const resolution = resolveReview({
      pack,
      selectedCandidate,
      selectedOptions: ui.selectedOptions,
      sessionContext: context.sessionContext,
      profile: context.profile,
      uiValues,
    });

    const snapshot = reviewToSnapshot(resolution);
    const envId = pack.manifest.environmentId;
    return {
      ...ui,
      cartItems,
      resolvedReview: resolution.fields,
      hospitalReview: envId === "hospital" ? snapshot : ui.hospitalReview,
      publicOfficeReview: envId === "public-office" ? snapshot : ui.publicOfficeReview,
      sandboxReview: envId === "sandbox" ? snapshot : ui.sandboxReview,
    };
  }

  private reviewOf(ui: SimulationUiState, context: DriverContext): Record<string, unknown> {
    const fields = ui.resolvedReview ?? [];
    const out: Record<string, unknown> = {};
    for (const f of fields) out[f.label] = f.displayValue;
    if (context.pack.manifest.environmentId === "chicken-store") {
      out.cartItems = ui.cartItems;
      out.total = ui.cartItems.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0);
    }
    return out;
  }
}

export const simulationDriver = new SimulationDriver();
