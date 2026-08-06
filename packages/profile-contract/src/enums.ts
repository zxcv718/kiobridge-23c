/**
 * Official KioBridge vocabularies.
 *
 * Rules (see docs/ENUM_REFERENCE.md):
 *   - JSON field names  : camelCase
 *   - Official ids/enums: UPPER_SNAKE_CASE
 *   - Unknown value     : "UNKNOWN"   (asked, but not determinable / untrusted)
 *   - Not applicable    : "NOT_APPLICABLE"
 *   - No preference     : "NO_PREFERENCE"
 *
 * Participants convert their own raw input to these values themselves — this
 * package never guesses (see MAPPING_GUIDE.md).
 */

export const SENTINEL = {
  UNKNOWN: "UNKNOWN",
  NOT_APPLICABLE: "NOT_APPLICABLE",
  NO_PREFERENCE: "NO_PREFERENCE",
} as const;

// --- Core (profile) ---------------------------------------------------------

export const COLLECTION_CHANNEL = {
  WEB_FORM: "WEB_FORM",
  MOBILE_APP: "MOBILE_APP",
  VOICE: "VOICE",
  CHATBOT: "CHATBOT",
  ASSISTED_INPUT: "ASSISTED_INPUT",
  IMPORTED: "IMPORTED",
  OTHER: "OTHER",
} as const;

export const PREFERRED_INPUT = {
  TOUCH: "TOUCH",
  VOICE: "VOICE",
  KEYBOARD: "KEYBOARD",
  SWITCH: "SWITCH",
  ASSISTED: "ASSISTED",
  MULTIMODAL: "MULTIMODAL",
} as const;

export const RETENTION_POLICY = {
  SESSION_ONLY: "SESSION_ONLY",
  UNTIL_USER_DELETES: "UNTIL_USER_DELETES",
  NOT_STORED: "NOT_STORED",
} as const;

export const FIELD_SOURCE = {
  WEB_FORM: "WEB_FORM",
  MOBILE_APP: "MOBILE_APP",
  VOICE: "VOICE",
  CHATBOT: "CHATBOT",
  ASSISTED_INPUT: "ASSISTED_INPUT",
  IMPORTED: "IMPORTED",
  INFERRED: "INFERRED",
  DEFAULTED: "DEFAULTED",
  OTHER: "OTHER",
} as const;

// --- Domain: chicken-store --------------------------------------------------

export const SERVICE_TYPE = {
  DINE_IN: "DINE_IN",
  TAKE_OUT: "TAKE_OUT",
  NO_PREFERENCE: "NO_PREFERENCE",
  UNKNOWN: "UNKNOWN",
} as const;

export const SPICY_LEVEL = {
  MILD: "MILD",
  MEDIUM: "MEDIUM",
  HOT: "HOT",
  NO_PREFERENCE: "NO_PREFERENCE",
  UNKNOWN: "UNKNOWN",
} as const;

export const BONE_TYPE = {
  BONE: "BONE",
  BONELESS: "BONELESS",
  NO_PREFERENCE: "NO_PREFERENCE",
  UNKNOWN: "UNKNOWN",
} as const;

export const CUP_OPTION = {
  PAPER: "PAPER",
  REGULAR: "REGULAR",
  NONE: "NONE",
  NO_PREFERENCE: "NO_PREFERENCE",
  UNKNOWN: "UNKNOWN",
} as const;

export const ALLERGEN = {
  PEANUT: "PEANUT",
  SOY: "SOY",
  MILK: "MILK",
  EGG: "EGG",
  WHEAT: "WHEAT",
  SHRIMP: "SHRIMP",
  UNKNOWN: "UNKNOWN",
} as const;

// --- Domain: hospital -------------------------------------------------------

export const VISIT_TYPE = {
  FIRST_VISIT: "FIRST_VISIT",
  REVISIT: "REVISIT",
  HEALTH_SCREENING: "HEALTH_SCREENING",
  EXAM: "EXAM",
  UNKNOWN: "UNKNOWN",
} as const;

export const APPOINTMENT_STATUS = {
  HAS_APPOINTMENT: "HAS_APPOINTMENT",
  NO_APPOINTMENT: "NO_APPOINTMENT",
  UNKNOWN: "UNKNOWN",
} as const;

export const DEPARTMENT = {
  INTERNAL_MEDICINE: "INTERNAL_MEDICINE",
  ORTHOPEDICS: "ORTHOPEDICS",
  ENT: "ENT",
  RADIOLOGY: "RADIOLOGY",
  HEALTH_SCREENING: "HEALTH_SCREENING",
  UNSPECIFIED: "UNSPECIFIED",
} as const;

export const SUPPORT_MODE = {
  LARGE_TEXT: "LARGE_TEXT",
  HEARING_SUPPORT: "HEARING_SUPPORT",
  VISUAL_GUIDANCE: "VISUAL_GUIDANCE",
  SIMPLE_STEPS: "SIMPLE_STEPS",
  STAFF_HELP: "STAFF_HELP",
  GUARDIAN_MODE: "GUARDIAN_MODE",
} as const;

// --- Domain: public-office --------------------------------------------------

export const SERVICE_CATEGORY = {
  RESIDENT: "RESIDENT",
  FAMILY: "FAMILY",
  INSURANCE: "INSURANCE",
  TAX: "TAX",
  STAFF: "STAFF",
  UNKNOWN: "UNKNOWN",
} as const;

export const AUTH_METHOD = {
  MOBILE_AUTH: "MOBILE_AUTH",
  ID_CARD: "ID_CARD",
  BIOMETRIC: "BIOMETRIC",
  STAFF_ASSIST: "STAFF_ASSIST",
  NONE: "NONE",
  UNKNOWN: "UNKNOWN",
} as const;

// --- Intent tasks -----------------------------------------------------------

export const INTENT_TASK = {
  ORDER_FOOD: "ORDER_FOOD",
  CHECK_IN: "CHECK_IN",
  PUBLIC_SERVICE_GUIDANCE: "PUBLIC_SERVICE_GUIDANCE",
  PRACTICE: "PRACTICE",
} as const;

// --- Derived types ----------------------------------------------------------

export type CollectionChannel = keyof typeof COLLECTION_CHANNEL;
export type PreferredInput = keyof typeof PREFERRED_INPUT;
export type RetentionPolicy = keyof typeof RETENTION_POLICY;
export type FieldSource = keyof typeof FIELD_SOURCE;
export type ServiceType = keyof typeof SERVICE_TYPE;
export type SpicyLevel = keyof typeof SPICY_LEVEL;
export type BoneType = keyof typeof BONE_TYPE;
export type CupOption = keyof typeof CUP_OPTION;
export type Allergen = keyof typeof ALLERGEN;
export type VisitType = keyof typeof VISIT_TYPE;
export type AppointmentStatus = keyof typeof APPOINTMENT_STATUS;
export type Department = keyof typeof DEPARTMENT;
export type SupportMode = keyof typeof SUPPORT_MODE;
export type ServiceCategory = keyof typeof SERVICE_CATEGORY;
export type AuthMethod = keyof typeof AUTH_METHOD;
export type IntentTask = keyof typeof INTENT_TASK;

export const values = <T extends Record<string, string>>(e: T): string[] => Object.values(e);

/**
 * BCP 47 with a REQUIRED region subtag (ko-KR, en-US, ja-JP).
 * The bare language subtag ("ko") is rejected so the contract is unambiguous —
 * the legacy adapter converts "ko" → "ko-KR" for migrating teams.
 */
export const BCP47_PATTERN = "^[a-z]{2,3}(-[A-Z][a-z]{3})?-([A-Z]{2}|[0-9]{3})$";
export const isBcp47 = (v: string): boolean => new RegExp(BCP47_PATTERN).test(v);
