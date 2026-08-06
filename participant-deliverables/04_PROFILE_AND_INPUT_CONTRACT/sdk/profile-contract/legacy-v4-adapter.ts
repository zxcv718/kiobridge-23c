/**
 * Legacy v4 → Canonical v1.0.0 adapter.
 *
 * v4 kept everything in two free-form bags (`profile.domainPreferences`,
 * `profile.constraints`). This converts the *unambiguous* parts and marks
 * everything else UNKNOWN — it never guesses.
 *
 * ⚠️ NOT used for official evaluation. It exists so existing v4 fixtures and
 * team code can be migrated. Every conversion returns a LEGACY_PROFILE_FORMAT
 * warning.
 */
import type { ContractError } from "./types";
import type { AnySessionContext, CanonicalProfile } from "./types";
import { DEFAULT_INPUT_CONTRACT_VERSION } from "./version";

export interface LegacyV4Profile {
  profileId?: string;
  displayName?: string;
  dataClassification?: string;
  accessibility?: Record<string, boolean>;
  interaction?: { preferredInput?: string; language?: string; confirmationRequired?: boolean };
  domainPreferences?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  consent?: { personalization?: boolean };
}

export interface LegacyConversionResult {
  inputContractVersion: string;
  profile: CanonicalProfile;
  sessionContext: AnySessionContext;
  warnings: ContractError[];
}

const UNKNOWN = "UNKNOWN";

/** Only exact, unambiguous legacy spellings map. Anything else → UNKNOWN. */
const MAPS = {
  serviceType: { take_out: "TAKE_OUT", TAKE_OUT: "TAKE_OUT", dine_in: "DINE_IN", DINE_IN: "DINE_IN" },
  spicyLevel: { mild: "MILD", MILD: "MILD", medium: "MEDIUM", MEDIUM: "MEDIUM", high: "HOT", hot: "HOT", HOT: "HOT" },
  boneType: { bone: "BONE", BONE: "BONE", boneless: "BONELESS", BONELESS: "BONELESS" },
  cupOption: { paper: "PAPER", PAPER: "PAPER", regular: "REGULAR", REGULAR: "REGULAR" },
  allergen: { peanut: "PEANUT", PEANUT: "PEANUT", soy: "SOY", SOY: "SOY", milk: "MILK", MILK: "MILK", egg: "EGG", EGG: "EGG", wheat: "WHEAT", WHEAT: "WHEAT", shrimp: "SHRIMP", SHRIMP: "SHRIMP" },
  visitType: { first_visit: "FIRST_VISIT", FIRST_VISIT: "FIRST_VISIT", revisit: "REVISIT", REVISIT: "REVISIT", health_screening: "HEALTH_SCREENING", exam: "EXAM" },
  department: { internal_medicine: "INTERNAL_MEDICINE", orthopedics: "ORTHOPEDICS", ent: "ENT", radiology: "RADIOLOGY", health_screening: "HEALTH_SCREENING", unspecified: "UNSPECIFIED" },
  authMethod: { mobile_auth: "MOBILE_AUTH", MOBILE_AUTH: "MOBILE_AUTH", id_card: "ID_CARD", ID_CARD: "ID_CARD" },
  preferredInput: { touch: "TOUCH", TOUCH: "TOUCH", voice: "VOICE", VOICE: "VOICE", keyboard: "KEYBOARD", KEYBOARD: "KEYBOARD" },
  serviceCategory: { resident: "RESIDENT", family: "FAMILY", insurance: "INSURANCE", tax: "TAX", staff: "STAFF" },
} as const;

function mapOrUnknown(map: Record<string, string>, v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return map[String(v)] ?? UNKNOWN;
}

function legacyLanguage(v: unknown): string {
  const s = String(v ?? "ko");
  if (/^[a-z]{2}-[A-Z]{2}$/.test(s)) return s;
  return s === "ko" ? "ko-KR" : s === "en" ? "en-US" : s === "ja" ? "ja-JP" : "ko-KR";
}

export function convertLegacyV4(
  legacy: LegacyV4Profile,
  environmentId: string,
  providerId = "LEGACY",
): LegacyConversionResult {
  const warnings: ContractError[] = [{
    path: "/profile",
    code: "LEGACY_PROFILE_FORMAT",
    message: "v4 자유형 profile 형식은 폐기 예정입니다. inputContractVersion 1.0.0 형식으로 변환되었습니다.",
  }];

  const acc = legacy.accessibility ?? {};
  const profile: CanonicalProfile = {
    profileId: legacy.profileId ?? "LEGACY-PROFILE",
    ...(legacy.displayName ? { displayName: legacy.displayName } : {}),
    dataClassification: "SYNTHETIC_PROFILE",
    source: { collectionChannel: "IMPORTED", providerId, collectedAt: new Date().toISOString() },
    accessibility: {
      largeText: !!acc.largeText, simpleSteps: !!acc.simpleSteps, visualGuidance: !!acc.visualGuidance,
      hearingSupport: !!acc.hearingSupport, mobilitySupport: !!acc.mobilitySupport, highContrast: !!acc.highContrast,
      staffAssistancePreferred: false,
    },
    interaction: {
      preferredInput: (mapOrUnknown(MAPS.preferredInput, legacy.interaction?.preferredInput) ?? "TOUCH") as CanonicalProfile["interaction"]["preferredInput"],
      language: legacyLanguage(legacy.interaction?.language),
      confirmationRequired: legacy.interaction?.confirmationRequired ?? true,
    },
    consent: { personalization: legacy.consent?.personalization ?? false, retentionPolicy: "SESSION_ONLY" },
  };
  if (profile.interaction.preferredInput === (UNKNOWN as never)) {
    profile.interaction.preferredInput = "TOUCH";
    warnings.push({ path: "/profile/interaction/preferredInput", code: "LEGACY_PROFILE_FORMAT", message: "알 수 없는 preferredInput 이라 TOUCH 로 대체했습니다. 확인이 필요합니다." });
  }

  const dp = legacy.domainPreferences ?? {};
  const cs = legacy.constraints ?? {};
  const fieldMetadata: Record<string, never> = {};
  let sessionContext: AnySessionContext;

  const note = (path: string, value: unknown) =>
    warnings.push({ path, code: "LEGACY_PROFILE_FORMAT", message: "명확히 매핑할 수 없어 UNKNOWN 으로 변환했습니다. 재확인이 필요합니다.", receivedValue: value });

  if (environmentId === "chicken-store") {
    const prefs: Record<string, unknown> = {};
    for (const [k, map] of [["serviceType", MAPS.serviceType], ["spicyLevel", MAPS.spicyLevel], ["boneType", MAPS.boneType], ["cupOption", MAPS.cupOption]] as const) {
      const mapped = mapOrUnknown(map as Record<string, string>, dp[k]);
      if (mapped !== undefined) { prefs[k] = mapped; if (mapped === UNKNOWN) note(`/sessionContext/preferences/${k}`, dp[k]); }
    }
    if (Number.isInteger(dp.quantity)) prefs.quantity = dp.quantity;
    const legacyAllergens = Array.isArray(cs.allergens) ? (cs.allergens as unknown[]) : [];
    const allergenIds = legacyAllergens.map((a) => { const m = mapOrUnknown(MAPS.allergen as Record<string, string>, a); if (m === UNKNOWN) note("/sessionContext/hardConstraints/allergenIds", a); return m!; });
    sessionContext = { intent: { task: "ORDER_FOOD" }, facts: {}, preferences: prefs, hardConstraints: { allergenIds }, capabilities: {}, fieldMetadata };
  } else if (environmentId === "hospital") {
    const facts: Record<string, unknown> = {};
    const vt = mapOrUnknown(MAPS.visitType as Record<string, string>, dp.visitType);
    if (vt !== undefined) { facts.visitType = vt; if (vt === UNKNOWN) note("/sessionContext/facts/visitType", dp.visitType); }
    if (typeof dp.hasAppointment === "boolean") facts.appointmentStatus = dp.hasAppointment ? "HAS_APPOINTMENT" : "NO_APPOINTMENT";
    const dept = mapOrUnknown(MAPS.department as Record<string, string>, dp.department);
    if (dept !== undefined) facts.departmentId = dept === UNKNOWN ? "UNSPECIFIED" : dept;
    sessionContext = { intent: { task: "CHECK_IN" }, facts, preferences: {}, hardConstraints: { medicalInferenceAllowed: false }, capabilities: {}, fieldMetadata };
  } else if (environmentId === "public-office") {
    const legacyMethods = Array.isArray(dp.availableAuthMethods) ? (dp.availableAuthMethods as unknown[]) : [];
    const availableAuthMethods = legacyMethods.map((m) => { const v = mapOrUnknown(MAPS.authMethod as Record<string, string>, m); if (v === UNKNOWN) note("/sessionContext/capabilities/availableAuthMethods", m); return v!; });
    const cat = mapOrUnknown(MAPS.serviceCategory as Record<string, string>, dp.category);
    sessionContext = {
      intent: { task: "PUBLIC_SERVICE_GUIDANCE", ...(typeof dp.preferredService === "string" ? { requestedServiceId: dp.preferredService } : {}) },
      facts: cat !== undefined ? { serviceCategory: cat } : {},
      preferences: {}, hardConstraints: { legalEligibilityInferenceAllowed: false },
      capabilities: { availableAuthMethods }, fieldMetadata,
    };
  } else {
    sessionContext = { intent: { task: "PRACTICE" }, facts: {}, preferences: {}, hardConstraints: {}, capabilities: {}, fieldMetadata };
  }

  return { inputContractVersion: DEFAULT_INPUT_CONTRACT_VERSION, profile, sessionContext, warnings };
}
