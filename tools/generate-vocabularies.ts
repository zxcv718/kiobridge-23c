/** Regenerates schemas/vocabularies/* from the enum source of truth. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import * as E from "../packages/profile-contract/src/enums";

const ROOT = process.cwd();
const w = (name: string, obj: unknown) => {
  writeFileSync(path.join(ROOT, "schemas", "vocabularies", name), JSON.stringify(obj, null, 2) + "\n");
  console.log("wrote", name);
};
const V = "1.0.0";

w("common.vocabulary.json", {
  vocabularyVersion: V,
  description: "공통 sentinel 및 프로필 enum. 값은 UPPER_SNAKE_CASE.",
  sentinels: E.SENTINEL,
  collectionChannel: E.values(E.COLLECTION_CHANNEL),
  preferredInput: E.values(E.PREFERRED_INPUT),
  retentionPolicy: E.values(E.RETENTION_POLICY),
  fieldSource: E.values(E.FIELD_SOURCE),
  intentTask: E.values(E.INTENT_TASK),
  languagePattern: E.BCP47_PATTERN,
});

w("accessibility.vocabulary.json", {
  vocabularyVersion: V,
  description: "접근성 관련 표준 값.",
  profileAccessibilityFlags: ["largeText","simpleSteps","visualGuidance","hearingSupport","mobilitySupport","highContrast","staffAssistancePreferred"],
  supportModes: E.values(E.SUPPORT_MODE),
});

w("chicken-store.vocabulary.json", {
  vocabularyVersion: V, environmentId: "chicken-store",
  preferences: { serviceType: E.values(E.SERVICE_TYPE), spicyLevel: E.values(E.SPICY_LEVEL), boneType: E.values(E.BONE_TYPE), cupOption: E.values(E.CUP_OPTION), quantity: { type: "integer", minimum: 1 } },
  hardConstraints: { allergenIds: E.values(E.ALLERGEN), maxPriceKrw: { type: "number", minimum: 0 } },
});

w("hospital.vocabulary.json", {
  vocabularyVersion: V, environmentId: "hospital",
  facts: { visitType: E.values(E.VISIT_TYPE), appointmentStatus: E.values(E.APPOINTMENT_STATUS), departmentId: E.values(E.DEPARTMENT), guardianPresent: { type: "boolean" } },
  preferences: { supportModes: E.values(E.SUPPORT_MODE) },
  hardConstraints: { medicalInferenceAllowed: [false] },
  capabilities: { canUseSelfCheckIn: { type: "boolean" } },
});

w("public-office.vocabulary.json", {
  vocabularyVersion: V, environmentId: "public-office",
  facts: { serviceCategory: E.values(E.SERVICE_CATEGORY) },
  preferences: { stepByStep: { type: "boolean" }, simpleLanguage: { type: "boolean" } },
  hardConstraints: { legalEligibilityInferenceAllowed: [false] },
  capabilities: { availableAuthMethods: E.values(E.AUTH_METHOD) },
});

w("sandbox.vocabulary.json", {
  vocabularyVersion: V, environmentId: "sandbox",
  preferences: { size: ["SMALL", "LARGE", "NO_PREFERENCE", "UNKNOWN"] },
});
