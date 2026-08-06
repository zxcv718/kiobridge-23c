/**
 * @kiobridge/contracts
 * Shared, DRIVER-AGNOSTIC types and fixed constants.
 *
 * Everything here is used identically by the Simulation Driver (today) and by a
 * future UPRLite Driver (real device). Coordinates, UIA identifiers and screen
 * captures NEVER appear in these contracts — they belong to a driver binding.
 */

// ---------------------------------------------------------------------------
// Fixed execution principles.
// ---------------------------------------------------------------------------

export const FIXED_PRINCIPLES = {
  validationMode: "SIMULATION_ONLY",
  executionEnvironment: "DIGITAL_TWIN",
  actualDeviceCommandSent: false,
  participantSubmissionUsed: true,
  officialRecommendationGenerated: false,
} as const;

export type ValidationMode = typeof FIXED_PRINCIPLES.validationMode;
export type ExecutionEnvironment = typeof FIXED_PRINCIPLES.executionEnvironment;

// ---------------------------------------------------------------------------
// Drivers.
// ---------------------------------------------------------------------------

/** Which driver executed a run. Recorded in Evidence. */
export type DriverId = "SIMULATION" | "UPRLITE";

export type DriverStatus = "READY" | "PENDING_REAL_DEVICE";

// ---------------------------------------------------------------------------
// Data classification.
// ---------------------------------------------------------------------------

export type DataClassification = "ACTUAL_EXTRACTED" | "SYNTHETIC_MOCK" | "PENDING_REAL_DEVICE";

export type EnvironmentId = string;

// ---------------------------------------------------------------------------
// User profile.
// ---------------------------------------------------------------------------

export type {
  CanonicalProfile,
  FieldMetadata,
  SessionContextBase,
  AnySessionContext,
  ChickenStoreSessionContext,
  HospitalSessionContext,
  PublicOfficeSessionContext,
  SandboxSessionContext,
  ContractError,
  ContractValidationResult,
} from "@kiobridge/profile-contract";
import type { CanonicalProfile, AnySessionContext } from "@kiobridge/profile-contract";

/** Accessibility flags carried by the canonical profile. */
export interface AccessibilityPrefs {
  largeText: boolean;
  simpleSteps: boolean;
  visualGuidance: boolean;
  hearingSupport: boolean;
  mobilitySupport: boolean;
  highContrast: boolean;
  staffAssistancePreferred: boolean;
}

/** @deprecated v4 name — use CanonicalProfile. Kept as an alias during migration. */
export type UserProfile = CanonicalProfile;

// ---------------------------------------------------------------------------
// Candidates & option groups (driver-agnostic domain data).
// ---------------------------------------------------------------------------

export interface Candidate {
  candidateId: string;
  name: string;
  domain: EnvironmentId;
  available: boolean;
  dataClassification: DataClassification;
  price?: number;
  description?: string;
  /** groupId -> allowed option ids. Used by semantic validation. */
  supportedOptions?: Record<string, string[]>;
  attributes?: Record<string, unknown>;
  requirements?: Record<string, unknown>;
  supports?: Record<string, unknown>;
}

export interface OptionValue {
  id: string;
  label: string;
  /** Optional numeric payload (e.g. QUANTITY). */
  value?: number;
}

export interface OptionGroup {
  groupId: string;
  label: string;
  required: boolean;
  /** Semantic target kind this group backs (e.g. "service_type"). */
  kind?: string;
  /** When true the plan may select several values (e.g. support modes). */
  multiSelect?: boolean;
  options: OptionValue[];
}

// ---------------------------------------------------------------------------
// Semantic targets & actions — the participant-facing execution vocabulary.
// Participants never reference coordinates or control identifiers.
// ---------------------------------------------------------------------------

export interface SemanticTarget {
  /** "candidate" | "option" | or a group-backed kind such as "service_type". */
  kind: string;
  /** Candidate id, option id, or enumeration id. */
  id: string;
  /** Required when kind === "option". */
  groupId?: string;
}

export interface PlanAction {
  actionIndex: number;
  action: string;
  target: SemanticTarget;
  value?: string | number | boolean | null;
  expectedBeforeState: string;
  expectedAfterState: string;
}

// ---------------------------------------------------------------------------
// Environment pack (common, driver-agnostic).
// ---------------------------------------------------------------------------

export interface Transition {
  from: string;
  action: string;
  to: string;
  /** e.g. "readOnly" for verifier actions. */
  guards?: string[];
}

export interface ScreenDef {
  state: string;
  title: string;
  /** Semantic target kinds selectable on this screen. */
  targetKinds: string[];
  progress: number;
  isFinalReview?: boolean;
  /** Short helper text rendered by the driver. */
  hint?: string;
}

export interface SafetyRuleDef {
  ruleId: SafetyRuleId;
  description: string;
  severity: "BLOCK" | "STOP";
}

export interface EnvironmentManifest {
  environmentId: EnvironmentId;
  name: string;
  displayName?: string;
  description: string;
  summary: string;
  testFocus: string;
  fixtureVersion: string;
  dataClassification: DataClassification;
  states: string[];
  initialState: string;
  reviewBoundaryState: string;
  requiredVerifierAction: string;
  terminalState: string;
  allowedActions: string[];
  forbiddenActions: string[];
  /** true for the practice environment (never used for evaluation). */
  sandbox?: boolean;
  /** Which SessionContext contract this environment requires (section 34). */
  inputContract: {
    version: string;
    schemaRef: string;
    vocabularyRef: string;
  };
  supportedProfileContractVersions: string[];
}

// --- Driver bindings (NOT part of the participant contract) -----------------

export interface SimulationScreenBinding {
  template: SimulationTemplate;
  dataSource?: "candidates" | "option-groups" | "review";
  /** groupIds rendered on this screen when dataSource === "option-groups". */
  groups?: string[];
  /** Cards per page for FOUR_CARD_GRID. A kiosk shows a page, not a list. */
  pageSize?: number;
  /** Paging is simulated: it never drives a real device. */
  navigation?: { enabled: boolean; classification: "SYNTHETIC_MOCK" };
}

export type SimulationTemplate =
  | "LANDING"
  | "TWO_COLUMN_SELECTION"
  | "FOUR_CARD_GRID"
  | "OPTION_GROUP_LIST"
  | "ORDER_REVIEW"
  | "HOSPITAL_REVIEW"
  | "PUBLIC_SERVICE_REVIEW"
  | "BASIC_SANDBOX_REVIEW";

export interface SimulationBinding {
  driver: "SIMULATION";
  screens: Record<string, SimulationScreenBinding>;
}

/** Placeholder for real-device data. Filled in only when a device is available. */
export interface UprliteBinding {
  driver: "UPRLITE";
  status: DriverStatus;
  processName?: string;
  windowTitle?: string;
  baseResolution?: { width: number; height: number };
  rootAutomationId?: string;
  screens?: Record<string, { controls: Record<string, UprliteControlBinding> }>;
  controls?: Record<string, UprliteControlBinding>;
}

export interface UprliteControlBinding {
  automationId?: string;
  coordinate?: { x: number; y: number };
  ocrRegion?: { x: number; y: number; width: number; height: number };
}

// ---------------------------------------------------------------------------
// Domain compatibility rules.
//
// The platform must be able to reject a recommendation that is FORMALLY valid
// but incompatible with what the user actually told us (their facts, hard
// constraints and available means). Environments DECLARE those rules; one
// shared engine executes them, so adding an environment never means adding
// another branch of if-statements to the validator.
// ---------------------------------------------------------------------------

export type CompatibilitySeverity = "BLOCK" | "WARN";

/** What to do when the user's value is UNKNOWN / missing / unconfirmed. */
export type CompatibilityUnknownPolicy = "ALLOW" | "RECONFIRM" | "BLOCK" | "IGNORE";

export type CompatibilityOperator =
  /** scalar user value must be one of the candidate's values */
  | "IN"
  /** user list and candidate list must share at least one value */
  | "INTERSECTS"
  /** scalar equality */
  | "EQUALS"
  /** candidate list must contain every user value */
  | "CONTAINS"
  /** numeric: candidate value must be <= user value (e.g. price ceiling) */
  | "MAX"
  /** the two lists must NOT overlap (e.g. allergens the user must avoid) */
  | "DISJOINT"
  /** the user's list must contain the single value the plan selected */
  | "CONTAINS_SELECTED"
  /** the value the plan selected must equal the user's value */
  | "EQUALS_SELECTED";

export type CompatibilitySourceSection = "facts" | "preferences" | "hardConstraints" | "capabilities" | "intent";
export type CompatibilityCandidateSource = "supportedOptions" | "requirements" | "attributes" | "field";

/**
 * What the user's value is compared against.
 *
 * `candidate*` sources ask "COULD this candidate serve the user?" (Stage A).
 * `execution*` sources ask "did the plan actually CHOOSE something compatible?"
 * (Stage B) — a candidate that supports both FIRST_VISIT and REVISIT passes
 * Stage A either way, so only Stage B catches pressing the wrong one.
 */
export type CompatibilityTargetSource =
  | "candidateSupportedOptions"
  | "candidateRequirements"
  | "candidateAttributes"
  | "candidateField"
  | "executionSelectedOption"
  | "executionSelectedValue";

export type CompatibilityEvaluationScope = "CANDIDATE" | "EXECUTION_CHOICE";

export interface CompatibilityRule {
  ruleId: string;
  /** Human-readable purpose, shown in Evidence and error messages. */
  description?: string;
  source: { section: CompatibilitySourceSection; path: string };
  /** Legacy Stage-A form. Kept so existing rule files keep working. */
  candidate?: { source: CompatibilityCandidateSource; key: string };
  /** Preferred form; covers both stages. */
  target?: { source: CompatibilityTargetSource; key?: string; path?: string };
  operator: CompatibilityOperator;
  severity: CompatibilitySeverity;
  unknownPolicy: CompatibilityUnknownPolicy;
  errorCode: string;
  /** Derived from the target when omitted. */
  evaluationScope?: CompatibilityEvaluationScope;
  /**
   * Values that mean "the user did not commit to anything here". They are
   * treated as an explicit non-answer, never as a wildcard match.
   */
  neutralValues?: string[];
  /** Candidate values that satisfy the rule regardless of the user value
   *  (e.g. a staff-assisted path that works for everyone). */
  wildcardCandidateValues?: string[];
  /** Minimum fieldMetadata confidence before the value counts as confirmed. */
  minConfidence?: number;
  /**
   * What an ABSENT or EMPTY value means for this rule. `allergenIds: []` (or a
   * missing key) is a definite "no allergies"; `availableAuthMethods: []` is
   * "we never found out". That difference decides between skipping the rule and
   * demanding reconfirmation, so it is declared rather than assumed.
   *
   * An explicit "UNKNOWN" sentinel always means unknown, whatever this says —
   * a missing field and a collected-but-unknown value are not the same thing.
   */
  absentMeans?: "NONE" | "UNKNOWN";
}

export interface CompatibilityRuleSet {
  version: string;
  environmentId: EnvironmentId;
  rules: CompatibilityRule[];
}

export type CompatibilityRuleOutcome = "PASS" | "FAIL" | "WARN" | "RECONFIRM" | "SKIPPED";

export interface CompatibilityRuleResult {
  ruleId: string;
  result: CompatibilityRuleOutcome;
  sourceValue: unknown;
  /** Legacy alias of targetValue, kept for existing Evidence consumers. */
  candidateValues: unknown;
  severity: CompatibilitySeverity;
  message?: string;
  evaluationScope?: CompatibilityEvaluationScope;
  sourcePath?: string;
  targetSource?: CompatibilityTargetSource;
  targetKey?: string;
  targetValue?: unknown;
  operator?: CompatibilityOperator;
  errorCode?: string;
  /** Plan actions responsible for the chosen value (Stage B only). */
  actionIndexes?: number[];
}

// ---------------------------------------------------------------------------
// Review mapping. The review screen must never guess: each field declares an
// ordered list of official sources, and a required field that resolves to
// nothing is an error, not a dash.
// ---------------------------------------------------------------------------

export type ReviewSourceType =
  | "selectedOption"
  | "selectedCandidateSupportedOption"
  | "selectedCandidateAttribute"
  | "selectedCandidateRequirement"
  | "selectedCandidateField"
  | "sessionContext"
  | "profile"
  | "uiState"
  | "constant";

export interface ReviewFieldSource {
  type: ReviewSourceType;
  /** Option group / attribute / requirement key. */
  key?: string;
  /** Dot path for sessionContext / profile / uiState sources. */
  path?: string;
  /** How to collapse a list value. */
  strategy?: "FIRST" | "JOIN" | "INTERSECTION_SINGLE";
  /** Separator for JOIN. Defaults to ", ". */
  separator?: string;
  /**
   * Label per ARRAY ITEM. Without this a JOIN prints raw enums
   * ("LARGE_TEXT, STAFF_HELP") at the last screen before the boundary.
   */
  itemValueLabels?: Record<string, string>;
  /** Literal for type=constant. */
  value?: string;
}

export interface ReviewFieldDef {
  fieldId: string;
  label: string;
  sources: ReviewFieldSource[];
  required?: boolean;
  /** Value → display label (e.g. INTERNAL_MEDICINE → 내과). */
  valueLabels?: Record<string, string>;
  /** Shown when every source yields nothing but the field is optional. */
  fallbackLabel?: string;
}

export interface ReviewMapping {
  version: string;
  environmentId: EnvironmentId;
  title?: string;
  notice?: string;
  fields: ReviewFieldDef[];
}

export interface ResolvedReviewField {
  fieldId: string;
  label: string;
  value: string | null;
  displayValue: string;
  source: string;
  resolved: boolean;
  required: boolean;
}

export interface EnvironmentPack {
  manifest: EnvironmentManifest;
  screens: ScreenDef[];
  candidates: Candidate[];
  optionGroups: OptionGroup[];
  transitions: Transition[];
  safetyRules: SafetyRuleDef[];
  compatibilityRules: CompatibilityRuleSet;
  reviewMapping: ReviewMapping;
  bindings: {
    simulation: SimulationBinding;
    uprlite: UprliteBinding;
  };
  // NOTE: environment packs deliberately carry NO profile data. Canonical
  // profile examples live in examples/public-canonical-input; evaluation
  // profiles live only in the private evaluation repository.
}

/** Public fixture handed to participants (no private evaluation material). */
export interface PublicFixture {
  manifest: EnvironmentManifest;
  candidates: Candidate[];
  optionGroups: OptionGroup[];
  /**
   * Public contracts: teams need these to self-check BEFORE submitting.
   * They describe how the platform judges compatibility — they are not the
   * hidden recommendation answer.
   */
  compatibilityRules?: CompatibilityRuleSet;
  reviewMapping?: ReviewMapping;
  screens: ScreenDef[];
  transitions: Transition[];
  safetyRules: SafetyRuleDef[];
  /** Simulation layout templates only — no coordinates. */
  simulationBinding: SimulationBinding;
}

// ---------------------------------------------------------------------------
// Recommendation / decision / plan (participant-produced).
// ---------------------------------------------------------------------------

export interface ExcludedCandidate {
  candidateId: string;
  reasonCode: string;
  explanation?: string;
  reasonText?: string;
}

export interface Recommendation {
  recommendedCandidateId: string | null;
  alternativeCandidateIds: string[];
  excludedCandidates: ExcludedCandidate[];
  scoreBreakdown: Record<string, number>;
  recommendationReasons: string[];
  unmetConditions?: string[];
  confidence: number;
  requiresReconfirmation: boolean;
}

export interface UserDecision {
  approved: boolean;
  decision: "APPROVE" | "REJECT" | "MODIFY";
  confirmedAt?: string;
  note?: string;
}

export interface ExecutionPlan {
  planId: string;
  validationMode: ValidationMode;
  executionEnvironment: ExecutionEnvironment;
  actualDeviceCommandSent: false;
  actions: PlanAction[];
}

export interface TeamExtension {
  schemaVersion: string;
  features?: string[];
  profileData?: Record<string, unknown>;
  recommendationData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ParticipantSubmission {
  /** Canonical Input Contract version this submission targets. */
  inputContractVersion: string;
  submissionVersion: string;
  teamId: string;
  environmentId: EnvironmentId;
  /** Long-lived user information (canonical, closed schema). */
  profile: CanonicalProfile;
  /** Information about THIS kiosk session (intent/facts/preferences/…). */
  sessionContext: AnySessionContext;
  recommendation: Recommendation;
  userDecision: UserDecision;
  executionPlan: ExecutionPlan;
  /** Free extension, namespaced by teamId. Cannot bypass official safety. */
  extensions?: Record<string, TeamExtension>;
  accessibilityEvidence?: Record<string, unknown>;
  teamMetadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Safety engine.
// ---------------------------------------------------------------------------

export type SafetyRuleId =
  | "REQUIRE_USER_CONFIRMATION"
  | "BLOCK_PAYMENT_ACTION"
  | "BLOCK_ACTUAL_DEVICE_COMMAND"
  | "UNKNOWN_STATE_STOP"
  | "STATE_MISMATCH_STOP"
  | "UNAVAILABLE_CANDIDATE_BLOCK"
  | "ALLERGEN_CONFLICT_BLOCK"
  | "FINAL_BOUNDARY_STOP"
  | "VERIFY_CART_READ_ONLY";

export type SafetyOutcome = "PASS" | "BLOCK" | "STOP";

export interface SafetyCheckResult {
  ruleId: SafetyRuleId | "SUMMARY";
  outcome: SafetyOutcome;
  message: string;
  actionIndex?: number;
}

export type SafetyErrorCode =
  | "UNKNOWN_STATE"
  | "FORBIDDEN_ACTION"
  | "USER_NOT_APPROVED"
  | "CANDIDATE_UNAVAILABLE"
  | "PAYMENT_ACTION_ATTEMPT"
  | "STATE_MISMATCH"
  | "MISSING_VERIFIER";

// ---------------------------------------------------------------------------
// Driver-side UI state & execution events (produced by the driver, replayed by
// the web). The shape is common; only the *values* differ per driver.
// ---------------------------------------------------------------------------

export interface CartItem {
  candidateId: string;
  name: string;
  price?: number;
  quantity: number;
  options: Record<string, string>;
}

export interface SimulationUiState {
  environmentId: EnvironmentId;
  currentState: string;
  /** FOUR_CARD_GRID paging. A real kiosk shows a page at a time, not a list. */
  currentPage: number;
  pageSize: number;
  pageCount: number;
  visibleCandidateIds: string[];
  resolvedCandidatePage?: number;
  resolvedCandidateSlot?: number;
  previousState?: string;
  highlightedTarget?: SemanticTarget;
  pressedTarget?: SemanticTarget;
  serviceType?: string;
  selectedCandidate?: { id: string; name: string; price?: number };
  selectedOptions: Record<string, string | number | boolean>;
  quantity: number;
  cartItems: CartItem[];
  hospitalReview?: Record<string, unknown>;
  publicOfficeReview?: Record<string, unknown>;
  sandboxReview?: Record<string, unknown>;
  /** Resolver output — the single source the review screen renders. */
  resolvedReview?: ResolvedReviewField[];
  accessibilityMode: {
    largeText: boolean;
    highContrast: boolean;
    simpleLanguage: boolean;
    visualGuidance: boolean;
    hearingSupport: boolean;
  };
}

export type ExecutionEventType =
  | "TARGET_RESOLVED"
  | "TARGET_HIGHLIGHTED"
  | "TARGET_PRESSED"
  | "VALUE_APPLIED"
  | "SCREEN_TRANSITION_STARTED"
  | "SCREEN_TRANSITION_COMPLETED"
  | "SYNTHETIC_PAGE_CHANGED"
  | "REVIEW_UPDATED"
  | "VERIFIER_EXECUTED"
  | "RUN_STOPPED";

export interface ExecutionEvent {
  type: ExecutionEventType;
  actionIndex: number;
  /** Human-readable label for the UI log. */
  message: string;
  target?: SemanticTarget;
  fromState?: string;
  toState?: string;
  /** UI state snapshot AFTER this event (drives the virtual kiosk). */
  uiState: SimulationUiState;
  /** SYNTHETIC_PAGE_CHANGED only — this is simulated navigation, never a real
   *  device page turn. */
  classification?: "SYNTHETIC_MOCK";
  fromPage?: number;
  toPage?: number;
  reason?: string;
}

export interface ExecutedAction extends PlanAction {
  resultState: string;
  ok: boolean;
  /** Label resolved by the driver (e.g. the menu name that was selected). */
  resolvedLabel?: string;
}

// ---------------------------------------------------------------------------
// Validation.
// ---------------------------------------------------------------------------

export interface ValidationError {
  path: string;
  code: string;
  message: string;
  actionIndex?: number;
  /** Compatibility rule that produced this issue, when applicable. */
  ruleId?: string;
  receivedValue?: unknown;
  allowedValues?: string[];
  /** Human-readable shape for format failures. */
  expectedFormat?: string;
}

export interface ValidationResult {
  valid: boolean;
  /** Canonical Input Contract version this result was produced against. */
  contractVersion?: string;
  errors: ValidationError[];
  /**
   * Non-blocking findings (e.g. a soft preference the recommendation did not
   * satisfy). Warnings never change `valid`; they are surfaced to the team and
   * recorded in Evidence because judges may weigh them.
   */
  warnings?: ValidationError[];
  /** Per-rule outcome of the domain compatibility pass (both stages). */
  compatibility?: CompatibilityRuleResult[];
  /** What the execution plan actually selected, as the platform read it. */
  executionChoices?: {
    candidateId?: string;
    selectedOptions: Record<string, string | string[]>;
    quantity?: number;
    actionIndexes: Record<string, number[]>;
  };
}

// ---------------------------------------------------------------------------
// Session lifecycle.
// ---------------------------------------------------------------------------

export type SubmissionStatus =
  | "WAITING" | "SUBMITTED" | "VALIDATING" | "VALIDATED" | "VALIDATION_FAILED"
  | "READY_TO_RUN" | "RUNNING" | "PASSED" | "FAILED" | "STOPPED";

export type ValidationStatus = "NOT_STARTED" | "VALIDATING" | "VALIDATED" | "VALIDATION_FAILED";
export type ExecutionStatus = "NOT_STARTED" | "RUNNING" | "PASSED" | "FAILED" | "STOPPED";

export interface Session {
  sessionId: string;
  environmentId: EnvironmentId;
  fixtureVersion: string;
  initialState: string;
  driverId: DriverId;
  submissionStatus: SubmissionStatus;
  validationStatus: ValidationStatus;
  executionStatus: ExecutionStatus;
  validationMode: ValidationMode;
  executionEnvironment: ExecutionEnvironment;
  createdAt: string;
  submissionEndpoint: string;
  /**
   * Increments on every accepted submission. Clients use it to notice that a
   * NEW submission replaced the one they are looking at, so stale validation,
   * run and evidence are never shown next to fresh input.
   */
  submissionSeq: number;
  submission?: ParticipantSubmission;
  validation?: ValidationResult;
  evidence?: Evidence;
}

// ---------------------------------------------------------------------------
// Evidence (server-authoritative).
// ---------------------------------------------------------------------------

export type StopType = "NORMAL_BOUNDARY_STOP" | "SAFETY_STOP" | "NONE";

export interface Evidence {
  evidenceVersion: "1.2";
  runId: string;
  sessionId: string;
  teamId?: string;
  environmentId: EnvironmentId;
  fixtureVersion: string;
  submissionHash: string;
  createdAt: string;
  /** Which driver produced this run. */
  driverId: DriverId;
  driverStatus: DriverStatus;
  dataClassification: {
    actualExtractedDataUsed: boolean;
    syntheticMockDataUsed: boolean;
  };
  validationMode: ValidationMode;
  executionEnvironment: ExecutionEnvironment;
  actualDeviceCommandSent: false;
  participantSubmissionUsed: true;
  officialRecommendationGenerated: false;
  profileSummary: { profileId: string; accessibility: AccessibilityPrefs; language: string };
  /** Canonical session context essentials (intent + hard constraints). */
  sessionContextSummary: { intent: Record<string, unknown>; hardConstraints: Record<string, unknown> };
  recommendation: Recommendation | null;
  userDecision: UserDecision | null;
  executionPlan: PlanAction[];
  executedActions: ExecutedAction[];
  stateHistory: string[];
  safetyChecks: SafetyCheckResult[];
  validationErrors: ValidationError[];
  /** Non-blocking findings. Present even when result is PASS. */
  validationWarnings?: ValidationError[];
  /** Outcome of the declared domain compatibility rules for this environment. */
  domainCompatibility?: {
    /** Stage A — could this candidate serve the user at all? */
    candidate: { evaluated: boolean; rules: CompatibilityRuleResult[]; blockingErrorCount: number; warningCount: number };
    /** Stage B — did the plan actually choose compatible values? */
    executionChoice: { evaluated: boolean; rules: CompatibilityRuleResult[]; blockingErrorCount: number; warningCount: number };
    /** Combined view, kept so existing consumers keep working. */
    evaluated: boolean;
    rules: CompatibilityRuleResult[];
    blockingErrorCount: number;
    warningCount: number;
  };
  /** What the plan selected, as the platform read it. */
  executionChoices?: {
    candidateId?: string;
    selectedOptions: Record<string, string | string[]>;
    quantity?: number;
    actionIndexes: Record<string, number[]>;
  };
  /**
   * How each semantic target was resolved onto the simulated screen. These are
   * SYNTHETIC page/slot positions in the digital twin — never real device
   * coordinates and never real kiosk control ids.
   */
  resolvedSimulationTrace?: {
    actionIndex: number;
    semanticTarget: SemanticTarget;
    resolvedTarget: {
      pageIndex: number;
      slotIndex: number;
      template: string;
      navigationClassification: "SYNTHETIC_MOCK";
    };
  }[];
  /** Which official source produced every field on the review screen. */
  reviewResolution?: { fields: ResolvedReviewField[]; unresolvedRequiredFields: string[] };
  /** Final review payload produced by the driver (cart / check-in / application). */
  reviewSnapshot: Record<string, unknown>;
  plannedPaymentActionCount: number;
  executedPaymentActionCount: number;
  blockedPaymentActionCount: number;
  lastBusinessState: string;
  terminalState: string;
  stopType: StopType;
  stopReason: string;
  boundaryReached: boolean;
  requiredVerifierExecuted: boolean;
  submissionValid: boolean;
  extensions: Record<string, unknown>;
  /**
   * Legacy field, kept for backwards compatibility with existing consumers.
   * Read `resultScope` to understand WHAT it covers.
   */
  result: "PASS" | "FAIL";
  /** Always SIMULATION_VALIDATION_ONLY — never a hackathon score. */
  resultScope: "SIMULATION_VALIDATION_ONLY";
  /** What the platform actually verified. */
  simulationValidation: {
    result: "PASS" | "FAIL";
    contractValid: boolean;
    safetyValid: boolean;
    stateTransitionValid: boolean;
    boundaryReached: boolean;
    requiredVerifierExecuted: boolean;
  };
  /** Recommendation quality is NOT judged by the public simulator. */
  recommendationEvaluation: { status: "NOT_EVALUATED_PUBLICLY" };
  /** Final score comes from private evaluation + judges. */
  hackathonEvaluation: { status: "PRIVATE_AND_JUDGE_EVALUATION_REQUIRED" };
}

/** Serializable summary of a replay (transport-friendly). */
export interface RunResultLike {
  executedActions: ExecutedAction[];
  events: ExecutionEvent[];
  stateHistory: string[];
  safetyChecks: SafetyCheckResult[];
  lastBusinessState: string;
  terminalState: string;
  stopType: StopType;
  stopReason: string;
  boundaryReached: boolean;
  requiredVerifierExecuted: boolean;
  plannedPaymentActionCount: number;
  executedPaymentActionCount: number;
  blockedPaymentActionCount: number;
  reviewSnapshot: Record<string, unknown>;
  finalUiState: SimulationUiState;
  stopped: boolean;
}

// ---------------------------------------------------------------------------
// Fixed vocabularies.
// ---------------------------------------------------------------------------

export const FORBIDDEN_ACTIONS: readonly string[] = [
  "select_payment", "confirm_payment", "submit_payment", "complete_payment",
  "open_payment_method", "process_card", "process_cash",
  "complete_checkin", "submit_application", "issue_document",
];

export const PAYMENT_ACTION_MARKERS: readonly string[] = ["payment", "pay_", "card", "cash", "checkout"];

export const REASON_CODES = {
  UNAVAILABLE: "UNAVAILABLE",
  ALLERGEN_CONFLICT: "ALLERGEN_CONFLICT",
  SERVICE_TYPE_MISMATCH: "SERVICE_TYPE_MISMATCH",
  MISSING_REQUIRED_OPTION: "MISSING_REQUIRED_OPTION",
  AUTH_METHOD_UNAVAILABLE: "AUTH_METHOD_UNAVAILABLE",
  PREFERENCE_MISMATCH: "PREFERENCE_MISMATCH",
  APPOINTMENT_MISMATCH: "APPOINTMENT_MISMATCH",
} as const;

export const RESULT = { PASS: "PASS", FAIL: "FAIL" } as const;

export const VALIDATION_CODES = {
  SCHEMA_INVALID: "SCHEMA_INVALID",
  ENVIRONMENT_MISMATCH: "ENVIRONMENT_MISMATCH",
  CANDIDATE_NOT_FOUND: "CANDIDATE_NOT_FOUND",
  CANDIDATE_UNAVAILABLE: "CANDIDATE_UNAVAILABLE",
  RECOMMENDATION_TARGET_MISMATCH: "RECOMMENDATION_TARGET_MISMATCH",
  RECOMMENDED_CANDIDATE_NOT_SELECTED: "RECOMMENDED_CANDIDATE_NOT_SELECTED",
  DUPLICATE_CANDIDATE_SELECTION: "DUPLICATE_CANDIDATE_SELECTION",
  EXCLUDED_CANDIDATE_NOT_FOUND: "EXCLUDED_CANDIDATE_NOT_FOUND",
  USER_NOT_APPROVED: "USER_NOT_APPROVED",
  ACTIONS_WITHOUT_APPROVAL: "ACTIONS_WITHOUT_APPROVAL",
  FORBIDDEN_ACTION: "FORBIDDEN_ACTION",
  ALLERGEN_CONFLICT: "ALLERGEN_CONFLICT",
  ACTUAL_DEVICE_COMMAND: "ACTUAL_DEVICE_COMMAND",
  INVALID_FIXED_PRINCIPLE: "INVALID_FIXED_PRINCIPLE",
  EMPTY_PLAN: "EMPTY_PLAN",
  PERSONAL_DATA_NOT_ALLOWED: "PERSONAL_DATA_NOT_ALLOWED",
  // semantic target codes
  TARGET_KIND_NOT_ALLOWED: "TARGET_KIND_NOT_ALLOWED",
  OPTION_GROUP_NOT_FOUND: "OPTION_GROUP_NOT_FOUND",
  OPTION_VALUE_NOT_FOUND: "OPTION_VALUE_NOT_FOUND",
  OPTION_NOT_SUPPORTED_BY_CANDIDATE: "OPTION_NOT_SUPPORTED_BY_CANDIDATE",
  REQUIRED_OPTION_MISSING: "REQUIRED_OPTION_MISSING",
  TARGET_NOT_RESOLVABLE: "TARGET_NOT_RESOLVABLE",
  // dry-run codes
  ACTION_INDEX_NOT_ZERO_BASED: "ACTION_INDEX_NOT_ZERO_BASED",
  ACTION_INDEX_DUPLICATE: "ACTION_INDEX_DUPLICATE",
  ACTION_INDEX_NON_CONTIGUOUS: "ACTION_INDEX_NON_CONTIGUOUS",
  STATE_MISMATCH: "STATE_MISMATCH",
  UNKNOWN_STATE: "UNKNOWN_STATE",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  BOUNDARY_NOT_REACHED: "BOUNDARY_NOT_REACHED",
  MISSING_VERIFIER: "MISSING_VERIFIER",
  ACTION_AFTER_VERIFIER: "ACTION_AFTER_VERIFIER",
  // domain compatibility codes (emitted by the compatibility engine from
  // environments/<env>/compatibility-rules.json)
  VISIT_TYPE_MISMATCH: "VISIT_TYPE_MISMATCH",
  APPOINTMENT_MISMATCH: "APPOINTMENT_MISMATCH",
  DEPARTMENT_MISMATCH: "DEPARTMENT_MISMATCH",
  AUTH_METHOD_UNAVAILABLE: "AUTH_METHOD_UNAVAILABLE",
  REQUESTED_SERVICE_MISMATCH: "REQUESTED_SERVICE_MISMATCH",
  SERVICE_TYPE_MISMATCH: "SERVICE_TYPE_MISMATCH",
  PRICE_LIMIT_EXCEEDED: "PRICE_LIMIT_EXCEEDED",
  LOW_CONFIDENCE_RECONFIRMATION_REQUIRED: "LOW_CONFIDENCE_RECONFIRMATION_REQUIRED",
  SPICY_LEVEL_MISMATCH: "SPICY_LEVEL_MISMATCH",
  SIZE_PREFERENCE_MISMATCH: "SIZE_PREFERENCE_MISMATCH",
  BONE_TYPE_MISMATCH: "BONE_TYPE_MISMATCH",
  CUP_OPTION_MISMATCH: "CUP_OPTION_MISMATCH",
  // execution-choice codes: what the plan actually selected
  SELECTED_VISIT_TYPE_MISMATCH: "SELECTED_VISIT_TYPE_MISMATCH",
  SELECTED_APPOINTMENT_MISMATCH: "SELECTED_APPOINTMENT_MISMATCH",
  SELECTED_DEPARTMENT_MISMATCH: "SELECTED_DEPARTMENT_MISMATCH",
  SELECTED_AUTH_METHOD_UNAVAILABLE: "SELECTED_AUTH_METHOD_UNAVAILABLE",
  SELECTED_SERVICE_MISMATCH: "SELECTED_SERVICE_MISMATCH",
  SELECTED_SERVICE_TYPE_MISMATCH: "SELECTED_SERVICE_TYPE_MISMATCH",
  SELECTED_SPICY_LEVEL_MISMATCH: "SELECTED_SPICY_LEVEL_MISMATCH",
  SELECTED_BONE_TYPE_MISMATCH: "SELECTED_BONE_TYPE_MISMATCH",
  SELECTED_CUP_OPTION_MISMATCH: "SELECTED_CUP_OPTION_MISMATCH",
  SELECTED_SIZE_MISMATCH: "SELECTED_SIZE_MISMATCH",
  SELECTED_QUANTITY_MISMATCH: "SELECTED_QUANTITY_MISMATCH",
  // execution-plan structure
  EXECUTION_OPTION_DUPLICATE: "EXECUTION_OPTION_DUPLICATE",
  EXECUTION_REQUIRED_OPTION_MISSING: "EXECUTION_REQUIRED_OPTION_MISSING",
  EXECUTION_OPTION_GROUP_UNKNOWN: "EXECUTION_OPTION_GROUP_UNKNOWN",
  EXECUTION_OPTION_VALUE_UNKNOWN: "EXECUTION_OPTION_VALUE_UNKNOWN",
  // vocabulary integrity (environment pack load time)
  VOCABULARY_VALUE_UNKNOWN: "VOCABULARY_VALUE_UNKNOWN",
  ENVIRONMENT_VOCABULARY_CONFLICT: "ENVIRONMENT_VOCABULARY_CONFLICT",
  // canonical input timestamps (UTC ISO 8601, see profile-contract/timestamp.ts)
  INVALID_UTC_TIMESTAMP: "INVALID_UTC_TIMESTAMP",
  // review resolution
  REVIEW_FIELD_UNRESOLVED: "REVIEW_FIELD_UNRESOLVED",
  REVIEW_VALUE_LABEL_UNKNOWN: "REVIEW_VALUE_LABEL_UNKNOWN",
  // environment pack integrity (thrown at load time, never reaches a team)
  ENVIRONMENT_CANDIDATE_DATA_CONFLICT: "ENVIRONMENT_CANDIDATE_DATA_CONFLICT",
} as const;
