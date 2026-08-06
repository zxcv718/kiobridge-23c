/**
 * @kiobridge/participant-sdk
 * Thin client for the official Simulation API. It ONLY transports data and
 * checks types — it does NOT generate profiles, recommendations, user
 * decisions or execution plans. Those are the participant's responsibility.
 */
import type {
  CompatibilityRuleSet,
  EnvironmentId,
  Evidence,
  ReviewMapping,
  ParticipantSubmission,
  PublicFixture,
  RunResultLike,
  Session,
  ValidationResult,
} from "@kiobridge/contracts";

/**
 * Official vocabularies + contract validation are re-exported so participants
 * can reference canonical values directly:
 *   SERVICE_TYPE.TAKE_OUT · SPICY_LEVEL.HOT · VISIT_TYPE.REVISIT · AUTH_METHOD.MOBILE_AUTH
 *
 * The SDK does NOT guess or auto-map a team's raw values — writing the Profile
 * Mapper is the participant's own responsibility (see MAPPING_GUIDE.md).
 */
export {
  SENTINEL, COLLECTION_CHANNEL, PREFERRED_INPUT, RETENTION_POLICY, FIELD_SOURCE,
  SERVICE_TYPE, SPICY_LEVEL, BONE_TYPE, CUP_OPTION, ALLERGEN,
  VISIT_TYPE, APPOINTMENT_STATUS, DEPARTMENT, SUPPORT_MODE,
  SERVICE_CATEGORY, AUTH_METHOD, INTENT_TASK,
  validateCanonicalInput, validateProfile, validateSessionContext,
  assertSupportedVersion, contractCapabilities, ContractValidationError,
  isIso8601UtcTimestamp, validateIso8601UtcTimestamp, nowIso8601Utc,
  UTC_TIMESTAMP_FORMAT,
  SUPPORTED_INPUT_CONTRACT_VERSIONS, DEFAULT_INPUT_CONTRACT_VERSION,
} from "@kiobridge/profile-contract";
export type {
  CanonicalProfile, CanonicalInput, AnySessionContext, FieldMetadata,
  ChickenStoreSessionContext, HospitalSessionContext, PublicOfficeSessionContext,
  ContractError, ContractValidationResult,
} from "@kiobridge/profile-contract";

export type {
  CompatibilityRuleSet,
  ReviewMapping,
  ParticipantSubmission,
  Session,
  ValidationResult,
  Evidence,
  PublicFixture,
  UserProfile,
  UserDecision,
  Recommendation,
  ExecutionPlan,
  PlanAction,
  Candidate,
} from "@kiobridge/contracts";

/**
 * Local self-check helpers.
 *
 * These INSPECT a submission the team already built. They never choose a
 * candidate, never insert a missing option and never repair a wrong value —
 * doing that would be building the team's answer for them.
 */
export {
  extractExecutionChoices,
  evaluateCompatibility,
  evaluateTwoStageCompatibility,
  type ExecutionChoices,
  type CompatibilityOutcome,
  type TwoStageCompatibility,
} from "@kiobridge/evaluator";

export interface EnvSummary {
  environmentId: EnvironmentId;
  name: string;
  description: string;
  summary: string;
  testFocus: string;
  dataClassification: string;
  fixtureVersion: string;
}

export interface ExecuteResult {
  valid: boolean;
  run?: RunResultLike;
  evidence?: Evidence;
  validation?: ValidationResult;
}

export class KioBridgeApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "KioBridgeApiError";
  }
}

export interface ClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class KioBridgeSimulationClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async call<T>(pathName: string, init?: RequestInit): Promise<T> {
    const r = await this.fetchImpl(`${this.baseUrl}${pathName}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await r.text();
    const body = text ? JSON.parse(text) : undefined;
    if (!r.ok) throw new KioBridgeApiError(r.status, (body as { error?: string })?.error ?? `HTTP ${r.status}`, body);
    return body as T;
  }

  environments(): Promise<EnvSummary[]> {
    return this.call("/api/v1/environments");
  }

  fixture(environmentId: string): Promise<PublicFixture> {
    return this.call(`/api/v1/environments/${environmentId}/fixture`);
  }

  /** Alias matching the guide's `getFixture`. */
  getFixture(environmentId: string): Promise<PublicFixture> {
    return this.fixture(environmentId);
  }

  /** Same as getFixture; named for symmetry with the other public contracts. */
  getPublicFixture(environmentId: string): Promise<PublicFixture> {
    return this.fixture(environmentId);
  }

  /**
   * How the platform judges whether a recommendation fits the user's context.
   * Public on purpose: teams should self-check before submitting.
   */
  getCompatibilityRules(environmentId: string): Promise<CompatibilityRuleSet> {
    return this.call(`/api/v1/environments/${environmentId}/compatibility-rules`);
  }

  /** Which official source fills each field of the review screen. */
  getReviewMapping(environmentId: string): Promise<ReviewMapping> {
    return this.call(`/api/v1/environments/${environmentId}/review-mapping`);
  }

  createSession(environmentId: string): Promise<Session> {
    return this.call("/api/v1/sessions", { method: "POST", body: JSON.stringify({ environmentId }) });
  }

  getSession(sessionId: string): Promise<Session> {
    return this.call(`/api/v1/sessions/${sessionId}`);
  }

  /** Submit the participant-produced result. The SDK does not build this object. */
  submit(sessionId: string, submission: ParticipantSubmission): Promise<Session> {
    return this.call(`/api/v1/sessions/${sessionId}/submission`, { method: "POST", body: JSON.stringify(submission) });
  }

  validate(sessionId: string): Promise<ValidationResult> {
    return this.call(`/api/v1/sessions/${sessionId}/validate`, { method: "POST", body: "{}" });
  }

  execute(sessionId: string, opts?: { injectError?: string }): Promise<ExecuteResult> {
    return this.call(`/api/v1/sessions/${sessionId}/execute`, { method: "POST", body: JSON.stringify(opts ?? {}) });
  }

  injectError(sessionId: string, code: string): Promise<ExecuteResult & { injected?: string }> {
    return this.call(`/api/v1/sessions/${sessionId}/error-injection`, { method: "POST", body: JSON.stringify({ code }) });
  }

  getRun(sessionId: string): Promise<RunResultLike & { executionStatus: string }> {
    return this.call(`/api/v1/sessions/${sessionId}/run`);
  }

  getEvidence(sessionId: string): Promise<Evidence> {
    return this.call(`/api/v1/sessions/${sessionId}/evidence`);
  }

  // --- contract negotiation (§13/§28) ---------------------------------------

  /** What contract versions does this server support? Call this first. */
  getSupportedContracts(): Promise<{ supportedInputContractVersions: string[]; defaultInputContractVersion: string; supportedSubmissionVersions: string[] }> {
    return this.call("/api/v1/contracts");
  }

  getInputContract(environmentId: string): Promise<{ environmentId: string; inputContractVersion: string; schemaUrl: string; vocabularyUrl: string; requiredFields: string[]; optionalFields: string[] }> {
    return this.call(`/api/v1/environments/${environmentId}/input-contract`);
  }

  getVocabulary(environmentId: string): Promise<Record<string, unknown>> {
    return this.call(`/api/v1/vocabularies/${environmentId}`);
  }

  /** Server-side canonical input validation (profile + sessionContext). */
  validateCanonicalInputRemote(input: unknown): Promise<{ valid: boolean; contractVersion: string; errors: unknown[] }> {
    return this.call("/api/v1/contracts/input/validate", { method: "POST", body: JSON.stringify(input) });
  }

  validateSessionContextRemote(environmentId: string, sessionContext: unknown): Promise<{ valid: boolean; errors: unknown[] }> {
    return this.call("/api/v1/contracts/session-context/validate", { method: "POST", body: JSON.stringify({ environmentId, sessionContext }) });
  }

  /** Validate a full submission without creating a session (dry check). */
  validateSubmissionRemote(submission: ParticipantSubmission): Promise<{ valid: boolean; errors: unknown[] }> {
    return this.call("/api/v1/contracts/input/validate", { method: "POST", body: JSON.stringify(submission) });
  }

  /**
   * Poll-based run subscription (SSE not required). Calls `onEvent` for each new
   * executed action, then completes. Returns a cancel function.
   */
  subscribeRun(sessionId: string, onEvent: (e: { actionIndex: number; currentState: string; executedAction: string }) => void, intervalMs = 700): () => void {
    let last = -1;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const run = await this.getRun(sessionId);
        run.executedActions.forEach((a) => {
          if (a.actionIndex > last) { last = a.actionIndex; onEvent({ actionIndex: a.actionIndex, currentState: a.resultState, executedAction: a.action }); }
        });
        if (run.stopped || run.stopType !== "NONE") { stopped = true; return; }
      } catch { /* not ready yet */ }
      if (!stopped) setTimeout(tick, intervalMs);
    };
    tick();
    return () => { stopped = true; };
  }
}
