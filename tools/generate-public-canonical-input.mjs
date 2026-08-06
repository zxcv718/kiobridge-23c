/**
 * Generates examples/public-canonical-input/<env>/ — CANONICAL profile +
 * SessionContext only.
 *
 * These replace the removed v4 environment profiles. For the three EVALUATED
 * environments they deliberately contain NO recommendation and NO
 * executionPlan: building those is the participant's job.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "examples", "public-canonical-input");

const profile = (id, channel, input, a11y = {}) => ({
  profileId: id,
  dataClassification: "SYNTHETIC_PROFILE",
  source: { collectionChannel: channel, providerId: "TEAM-EXAMPLE", collectedAt: "2026-08-01T05:30:00.000Z" },
  accessibility: {
    largeText: false, simpleSteps: false, visualGuidance: false,
    hearingSupport: false, mobilitySupport: false, highContrast: false,
    staffAssistancePreferred: false, ...a11y,
  },
  interaction: { preferredInput: input, language: "ko-KR", confirmationRequired: true },
  consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
});

const NOTE_OFFICIAL =
  "공식 평가 환경입니다. Canonical Profile 과 SessionContext 형식만 제공합니다. " +
  "recommendation 과 executionPlan 은 참가팀이 직접 개발해야 하므로 포함하지 않습니다.";
const NOTE_RECONFIRM =
  "이 예제는 그대로 제출하면 계약 검증에서 거부됩니다. UNKNOWN 정책 학습용입니다 " +
  "(docs/UNKNOWN_POLICY.md 참고).";
const NOTE_SANDBOX =
  "연습용 sandbox 환경입니다. 전체 연결 예제는 examples/sandbox-reference-client 를 보세요.";

const files = {
  "chicken-store": [
    ["takeout-hot-boneless.json", profile("EXAMPLE-PROFILE-CHK-A", "WEB_FORM", "TOUCH"), {
      intent: { task: "ORDER_FOOD" }, facts: {},
      preferences: { serviceType: "TAKE_OUT", spicyLevel: "HOT", boneType: "BONELESS", cupOption: "PAPER", quantity: 1 },
      hardConstraints: { allergenIds: [] }, capabilities: {},
      fieldMetadata: { "/preferences/serviceType": { source: "WEB_FORM", confidence: 1, confirmedByUser: true } },
    }],
    ["allergy-aware.json", profile("EXAMPLE-PROFILE-CHK-B", "VOICE", "VOICE", { largeText: true, simpleSteps: true }), {
      intent: { task: "ORDER_FOOD" }, facts: {},
      preferences: { serviceType: "TAKE_OUT", spicyLevel: "NO_PREFERENCE", boneType: "BONELESS", quantity: 2 },
      hardConstraints: { allergenIds: ["PEANUT"], maxPriceKrw: 10000 }, capabilities: {},
      fieldMetadata: {
        "/preferences/spicyLevel": { source: "VOICE", confidence: 0.72, confirmedByUser: true, normalizerId: "team-asr-v1" },
        "/hardConstraints/allergenIds": { source: "VOICE", confidence: 1, confirmedByUser: true },
      },
    }],
    // 의도적으로 "그대로 제출하면 거부되는" 예제입니다 (UNKNOWN 알레르기 + 낮은 confidence).
    // 참가팀은 이 상태에서 추론하지 말고 재확인하거나 안전한 대체경로를 택해야 합니다.
    ["unknown-allergen-needs-reconfirm.json", profile("EXAMPLE-PROFILE-CHK-C", "CHATBOT", "MULTIMODAL"), {
      intent: { task: "ORDER_FOOD" }, facts: {},
      preferences: { serviceType: "NO_PREFERENCE", spicyLevel: "UNKNOWN" },
      hardConstraints: { allergenIds: ["UNKNOWN"] }, capabilities: {},
      fieldMetadata: { "/hardConstraints/allergenIds": { source: "CHATBOT", confidence: 0.4, confirmedByUser: false } },
    }, "REQUIRES_RECONFIRMATION"],
  ],
  hospital: [
    ["revisit-with-appointment.json", profile("EXAMPLE-PROFILE-HOSP-A", "MOBILE_APP", "TOUCH", { hearingSupport: true }), {
      intent: { task: "CHECK_IN" },
      facts: { visitType: "REVISIT", appointmentStatus: "HAS_APPOINTMENT", departmentId: "INTERNAL_MEDICINE", guardianPresent: false },
      preferences: { supportModes: ["HEARING_SUPPORT"] },
      hardConstraints: { medicalInferenceAllowed: false }, capabilities: { canUseSelfCheckIn: true },
      fieldMetadata: { "/facts/appointmentStatus": { source: "MOBILE_APP", confidence: 1, confirmedByUser: true } },
    }],
    ["first-visit-department-unknown.json", profile("EXAMPLE-PROFILE-HOSP-B", "ASSISTED_INPUT", "ASSISTED", { largeText: true, staffAssistancePreferred: true }), {
      intent: { task: "CHECK_IN" },
      facts: { visitType: "FIRST_VISIT", appointmentStatus: "NO_APPOINTMENT", departmentId: "UNSPECIFIED", guardianPresent: true },
      preferences: { supportModes: ["LARGE_TEXT", "STAFF_HELP", "GUARDIAN_MODE"] },
      hardConstraints: { medicalInferenceAllowed: false }, capabilities: { canUseSelfCheckIn: false },
      fieldMetadata: {},
    }],
  ],
  "public-office": [
    ["resident-doc-mobile-auth.json", profile("EXAMPLE-PROFILE-GOV-A", "WEB_FORM", "TOUCH", { largeText: true, simpleSteps: true }), {
      intent: { task: "PUBLIC_SERVICE_GUIDANCE" },
      facts: { serviceCategory: "RESIDENT" },
      preferences: { stepByStep: true, simpleLanguage: true },
      hardConstraints: { legalEligibilityInferenceAllowed: false },
      capabilities: { availableAuthMethods: ["MOBILE_AUTH", "ID_CARD"] },
      fieldMetadata: {},
    }],
    ["no-auth-method.json", profile("EXAMPLE-PROFILE-GOV-B", "ASSISTED_INPUT", "ASSISTED", { staffAssistancePreferred: true }), {
      intent: { task: "PUBLIC_SERVICE_GUIDANCE" },
      facts: { serviceCategory: "UNKNOWN" },
      preferences: { stepByStep: true, simpleLanguage: true },
      hardConstraints: { legalEligibilityInferenceAllowed: false },
      capabilities: { availableAuthMethods: [] },
      fieldMetadata: {},
    }],
  ],
  sandbox: [
    ["practice-basic.json", profile("EXAMPLE-SANDBOX-001", "WEB_FORM", "TOUCH"), {
      intent: { task: "PRACTICE" }, facts: {},
      preferences: { size: "SMALL" }, hardConstraints: {}, capabilities: {}, fieldMetadata: {},
    }],
  ],
};

let count = 0;
for (const [env, entries] of Object.entries(files)) {
  const dir = path.join(OUT, env);
  mkdirSync(dir, { recursive: true });
  for (const [name, prof, sessionContext, expected] of entries) {
    const doc = {
      _note: expected === "REQUIRES_RECONFIRMATION" ? NOTE_RECONFIRM : env === "sandbox" ? NOTE_SANDBOX : NOTE_OFFICIAL,
      _expectedValidation: expected ?? "VALID",
      inputContractVersion: "1.0.0",
      environmentId: env,
      teamId: "TEAM-EXAMPLE",
      profile: prof,
      sessionContext,
    };
    writeFileSync(path.join(dir, name), JSON.stringify(doc, null, 2) + "\n");
    count += 1;
  }
}
console.log("공개 Canonical Input 예제 " + count + "개 생성 -> examples/public-canonical-input/");
