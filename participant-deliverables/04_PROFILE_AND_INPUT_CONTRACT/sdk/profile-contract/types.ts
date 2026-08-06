/**
 * KioBridge Canonical Input Contract — types.
 *
 * Layer 1 (Core)      : CanonicalProfile, SessionContextBase, FieldMetadata
 * Layer 2 (Domain)    : <Env>SessionContext
 * Layer 3 (Extensions): TeamExtension — free-form, namespaced by teamId
 *
 * How the data is COLLECTED is up to each team (web / app / voice / AI /
 * assisted). What is SUBMITTED must match these types exactly.
 */
import type {
  AppointmentStatus, AuthMethod, Allergen, BoneType, CollectionChannel, CupOption,
  Department, FieldSource, IntentTask, PreferredInput, RetentionPolicy,
  ServiceCategory, ServiceType, SpicyLevel, SupportMode, VisitType,
} from "./enums";

// ---------------------------------------------------------------------------
// Layer 1 — Core
// ---------------------------------------------------------------------------

/** Long-lived, relatively stable information about the user. */
export interface CanonicalProfile {
  /** Pseudonymous id. NEVER a real identifier. */
  profileId: string;
  displayName?: string;
  dataClassification: "SYNTHETIC_PROFILE";
  source: {
    collectionChannel: CollectionChannel;
    providerId: string;
    collectedAt: string; // ISO 8601 UTC
  };
  accessibility: {
    largeText: boolean;
    simpleSteps: boolean;
    visualGuidance: boolean;
    hearingSupport: boolean;
    mobilitySupport: boolean;
    highContrast: boolean;
    staffAssistancePreferred: boolean;
  };
  interaction: {
    preferredInput: PreferredInput;
    language: string; // BCP 47
    confirmationRequired: boolean;
  };
  consent: {
    personalization: boolean;
    retentionPolicy: RetentionPolicy;
  };
}

/** Provenance & trust for a single normalized value (voice / AI / assisted input). */
export interface FieldMetadata {
  source: FieldSource;
  /** 0..1 — how confident the team's own normalizer is. */
  confidence: number;
  confirmedByUser: boolean;
  capturedAt?: string;
  normalizerId?: string;
  /** Hash only — never the raw utterance or personal value. */
  originalValueHash?: string;
}

/**
 * Information that applies to THIS kiosk session only.
 *
 *  intent          — what the user is trying to do now
 *  facts           — objective, established truths (예약 여부 등)
 *  preferences      — soft wishes; a mismatch lowers score, it does not block
 *  hardConstraints — violating these MUST exclude a candidate (알레르기 등)
 *  capabilities    — what the user can actually use right now (인증수단 등)
 *  fieldMetadata   — provenance keyed by JSON Pointer into this object
 */
export interface SessionContextBase {
  intent: { task: IntentTask; [k: string]: unknown };
  facts: Record<string, unknown>;
  preferences: Record<string, unknown>;
  hardConstraints: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  fieldMetadata: Record<string, FieldMetadata>;
}

// ---------------------------------------------------------------------------
// Layer 2 — Domain contexts
// ---------------------------------------------------------------------------

export interface ChickenStoreSessionContext extends SessionContextBase {
  intent: { task: "ORDER_FOOD" };
  facts: Record<string, never>;
  preferences: {
    serviceType?: ServiceType;
    spicyLevel?: SpicyLevel;
    boneType?: BoneType;
    cupOption?: CupOption;
    quantity?: number;
  };
  hardConstraints: {
    allergenIds?: Allergen[];
    maxPriceKrw?: number;
  };
  capabilities: Record<string, never>;
}

export interface HospitalSessionContext extends SessionContextBase {
  intent: { task: "CHECK_IN" };
  facts: {
    visitType?: VisitType;
    appointmentStatus?: AppointmentStatus;
    departmentId?: Department;
    guardianPresent?: boolean;
  };
  preferences: { supportModes?: SupportMode[] };
  /** Medical inference is never allowed — the field exists to make that explicit. */
  hardConstraints: { medicalInferenceAllowed?: false };
  capabilities: { canUseSelfCheckIn?: boolean };
}

export interface PublicOfficeSessionContext extends SessionContextBase {
  intent: { task: "PUBLIC_SERVICE_GUIDANCE"; requestedServiceId?: string };
  facts: { serviceCategory?: ServiceCategory };
  preferences: { stepByStep?: boolean; simpleLanguage?: boolean };
  hardConstraints: { legalEligibilityInferenceAllowed?: false };
  capabilities: { availableAuthMethods?: AuthMethod[] };
}

export interface SandboxSessionContext extends SessionContextBase {
  intent: { task: "PRACTICE" };
  facts: Record<string, unknown>;
  preferences: { size?: "SMALL" | "LARGE" | "NO_PREFERENCE" | "UNKNOWN" };
  hardConstraints: Record<string, unknown>;
  capabilities: Record<string, unknown>;
}

export type AnySessionContext =
  | ChickenStoreSessionContext
  | HospitalSessionContext
  | PublicOfficeSessionContext
  | SandboxSessionContext
  | SessionContextBase;

// ---------------------------------------------------------------------------
// Layer 3 — Extensions
// ---------------------------------------------------------------------------

export interface TeamExtension {
  schemaVersion: string;
  features?: string[];
  profileData?: Record<string, unknown>;
  recommendationData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Canonical input envelope (the profile+context half of a submission)
// ---------------------------------------------------------------------------

export interface CanonicalInput {
  inputContractVersion: string;
  environmentId: string;
  profile: CanonicalProfile;
  sessionContext: AnySessionContext;
  extensions?: Record<string, TeamExtension>;
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type ContractErrorCode =
  | "UNSUPPORTED_INPUT_CONTRACT_VERSION"
  | "REQUIRED_FIELD_MISSING"
  | "ENUM_VALUE_INVALID"
  | "TYPE_MISMATCH"
  | "UNKNOWN_FIELD"
  | "PERSONAL_DATA_NOT_ALLOWED"
  | "USER_CONFIRMATION_REQUIRED"
  | "LOW_CONFIDENCE_RECONFIRMATION_REQUIRED"
  | "DOMAIN_CONTEXT_MISMATCH"
  | "HARD_CONSTRAINT_UNKNOWN"
  | "LEGACY_PROFILE_FORMAT"
  | "EXTENSION_NAMESPACE_INVALID";

export interface ContractError {
  path: string;
  code: ContractErrorCode | string;
  message: string;
  allowedValues?: string[];
  receivedValue?: unknown;
  /** Human-readable shape, e.g. YYYY-MM-DDTHH:mm:ss(.fraction)?Z */
  expectedFormat?: string;
}

export interface ContractValidationResult {
  valid: boolean;
  contractVersion: string;
  errors: ContractError[];
  warnings?: ContractError[];
}
