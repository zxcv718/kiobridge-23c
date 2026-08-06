/**
 * Generates the core + domain JSON Schemas from the enum source of truth so the
 * schemas and TypeScript enums can never drift.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import * as E from "../packages/profile-contract/src/enums";
import { SUPPORTED_INPUT_CONTRACT_VERSIONS } from "../packages/profile-contract/src/version";

const ROOT = process.cwd();
const ID = "https://kiobridge.local/schemas";
const w = (dir: string, name: string, obj: unknown) => {
  writeFileSync(path.join(ROOT, "schemas", dir, name), JSON.stringify(obj, null, 2) + "\n");
  console.log("wrote", `${dir}/${name}`);
};
const enumOf = (e: Record<string, string>) => ({ enum: E.values(e) });

// --- core/field-metadata ----------------------------------------------------
w("core", "field-metadata.schema.json", {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${ID}/core/field-metadata.schema.json`,
  title: "FieldMetadata",
  description: "값의 출처·신뢰도·사용자 확인 상태. 원본 음성/대화문/개인정보는 넣지 않습니다.",
  type: "object", additionalProperties: false,
  required: ["source", "confidence", "confirmedByUser"],
  properties: {
    source: enumOf(E.FIELD_SOURCE),
    confidence: { type: "number", minimum: 0, maximum: 1 },
    confirmedByUser: { type: "boolean" },
    capturedAt: { type: "string", format: "date-time" },
    normalizerId: { type: "string" },
    originalValueHash: { type: "string", description: "해시만. 원본 값 금지." },
  },
});

// --- core/canonical-profile -------------------------------------------------
w("core", "canonical-profile.schema.json", {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${ID}/core/canonical-profile.schema.json`,
  title: "CanonicalProfile",
  description: "장기 지속되는 사용자 정보. 실제 개인정보 금지, profileId 는 가명 ID.",
  type: "object", additionalProperties: false,
  required: ["profileId", "dataClassification", "source", "accessibility", "interaction", "consent"],
  properties: {
    profileId: { type: "string", minLength: 1 },
    displayName: { type: "string", description: "선택 필드." },
    dataClassification: { const: "SYNTHETIC_PROFILE" },
    source: {
      type: "object", additionalProperties: false,
      required: ["collectionChannel", "providerId", "collectedAt"],
      properties: {
        collectionChannel: enumOf(E.COLLECTION_CHANNEL),
        providerId: { type: "string", minLength: 1 },
        collectedAt: { type: "string", format: "date-time" },
      },
    },
    accessibility: {
      type: "object", additionalProperties: false,
      required: ["largeText","simpleSteps","visualGuidance","hearingSupport","mobilitySupport","highContrast","staffAssistancePreferred"],
      properties: Object.fromEntries(["largeText","simpleSteps","visualGuidance","hearingSupport","mobilitySupport","highContrast","staffAssistancePreferred"].map((k) => [k, { type: "boolean" }])),
    },
    interaction: {
      type: "object", additionalProperties: false,
      required: ["preferredInput", "language", "confirmationRequired"],
      properties: {
        preferredInput: enumOf(E.PREFERRED_INPUT),
        language: { type: "string", pattern: E.BCP47_PATTERN, description: "BCP 47 (예: ko-KR)" },
        confirmationRequired: { type: "boolean" },
      },
    },
    consent: {
      type: "object", additionalProperties: false,
      required: ["personalization", "retentionPolicy"],
      properties: { personalization: { type: "boolean" }, retentionPolicy: enumOf(E.RETENTION_POLICY) },
    },
  },
});

// --- core/session-context-base ---------------------------------------------
w("core", "session-context-base.schema.json", {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${ID}/core/session-context-base.schema.json`,
  title: "SessionContextBase",
  description: "이번 키오스크 이용에만 적용되는 정보. 환경별 스키마가 각 섹션을 좁힙니다.",
  type: "object", additionalProperties: false,
  required: ["intent", "facts", "preferences", "hardConstraints", "capabilities"],
  properties: {
    intent: { type: "object", required: ["task"], properties: { task: enumOf(E.INTENT_TASK) } },
    facts: { type: "object", description: "확인된 객관적 사실" },
    preferences: { type: "object", description: "선호(위반해도 BLOCK 아님)" },
    hardConstraints: { type: "object", description: "위반 시 후보를 반드시 제외" },
    capabilities: { type: "object", description: "현재 사용 가능한 수단" },
    fieldMetadata: {
      type: "object",
      additionalProperties: { $ref: `${ID}/core/field-metadata.schema.json` },
      propertyNames: { pattern: "^/" },
    },
  },
});

// --- core/semantic-action / recommendation / user-decision / execution-plan --
w("core", "semantic-action.schema.json", {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${ID}/core/semantic-action.schema.json`,
  title: "SemanticAction",
  description: "의미 기반 Action. 좌표·UIA·컨트롤 ID 금지.",
  type: "object", additionalProperties: false,
  required: ["actionIndex", "action", "target", "expectedBeforeState", "expectedAfterState"],
  properties: {
    actionIndex: { type: "integer", minimum: 0 },
    action: { type: "string" },
    target: {
      type: "object", additionalProperties: false, required: ["kind", "id"],
      properties: { kind: { type: "string" }, id: { type: "string" }, groupId: { type: "string" } },
    },
    value: { type: ["string", "number", "boolean", "null"] },
    expectedBeforeState: { type: "string" },
    expectedAfterState: { type: "string" },
  },
});

w("core", "recommendation.schema.json", {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${ID}/core/recommendation.schema.json`,
  title: "Recommendation", type: "object", additionalProperties: false,
  required: ["recommendedCandidateId","alternativeCandidateIds","excludedCandidates","recommendationReasons","confidence","requiresReconfirmation"],
  properties: {
    recommendedCandidateId: { type: ["string", "null"] },
    alternativeCandidateIds: { type: "array", items: { type: "string" } },
    excludedCandidates: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["candidateId", "reasonCode"],
      properties: { candidateId: { type: "string" }, reasonCode: { type: "string" }, explanation: { type: "string" }, reasonText: { type: "string" } },
    } },
    scoreBreakdown: { type: "object" },
    recommendationReasons: { type: "array", items: { type: "string" } },
    unmetConditions: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    requiresReconfirmation: { type: "boolean" },
  },
});

w("core", "user-decision.schema.json", {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${ID}/core/user-decision.schema.json`,
  title: "UserDecision", type: "object", additionalProperties: false,
  required: ["approved", "decision"],
  properties: {
    approved: { type: "boolean" },
    decision: { enum: ["APPROVE", "REJECT", "MODIFY"] },
    confirmedAt: { type: "string", format: "date-time" },
    note: { type: "string" },
  },
});

w("core", "execution-plan.schema.json", {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${ID}/core/execution-plan.schema.json`,
  title: "ExecutionPlan", type: "object", additionalProperties: false,
  required: ["planId", "validationMode", "executionEnvironment", "actualDeviceCommandSent", "actions"],
  properties: {
    planId: { type: "string" },
    validationMode: { const: "SIMULATION_ONLY" },
    executionEnvironment: { const: "DIGITAL_TWIN" },
    actualDeviceCommandSent: { const: false },
    actions: { type: "array", items: { $ref: `${ID}/core/semantic-action.schema.json` } },
  },
});

// --- domain context schemas -------------------------------------------------
const ctx = (envId: string, task: string, sections: Record<string, unknown>) => ({
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${ID}/domains/${envId}.context.schema.json`,
  title: `${envId} SessionContext`,
  allOf: [{ $ref: `${ID}/core/session-context-base.schema.json` }],
  type: "object", additionalProperties: false,
  required: ["intent", "facts", "preferences", "hardConstraints", "capabilities"],
  properties: {
    intent: { type: "object", additionalProperties: false, required: ["task"], properties: { task: { const: task }, ...(sections.intentExtra as object ?? {}) } },
    facts: sections.facts,
    preferences: sections.preferences,
    hardConstraints: sections.hardConstraints,
    capabilities: sections.capabilities,
    fieldMetadata: { type: "object", additionalProperties: { $ref: `${ID}/core/field-metadata.schema.json` }, propertyNames: { pattern: "^/" } },
  },
});
const closed = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, properties: props });

w("domains", "chicken-store.context.schema.json", ctx("chicken-store", "ORDER_FOOD", {
  facts: closed({}),
  preferences: closed({ serviceType: enumOf(E.SERVICE_TYPE), spicyLevel: enumOf(E.SPICY_LEVEL), boneType: enumOf(E.BONE_TYPE), cupOption: enumOf(E.CUP_OPTION), quantity: { type: "integer", minimum: 1 } }),
  hardConstraints: closed({ allergenIds: { type: "array", items: enumOf(E.ALLERGEN) }, maxPriceKrw: { type: "number", minimum: 0 } }),
  capabilities: closed({}),
}));

w("domains", "hospital.context.schema.json", ctx("hospital", "CHECK_IN", {
  facts: closed({ visitType: enumOf(E.VISIT_TYPE), appointmentStatus: enumOf(E.APPOINTMENT_STATUS), departmentId: enumOf(E.DEPARTMENT), guardianPresent: { type: "boolean" } }),
  preferences: closed({ supportModes: { type: "array", items: enumOf(E.SUPPORT_MODE) } }),
  hardConstraints: closed({ medicalInferenceAllowed: { const: false } }),
  capabilities: closed({ canUseSelfCheckIn: { type: "boolean" } }),
}));

w("domains", "public-office.context.schema.json", ctx("public-office", "PUBLIC_SERVICE_GUIDANCE", {
  intentExtra: { requestedServiceId: { type: "string" } },
  facts: closed({ serviceCategory: enumOf(E.SERVICE_CATEGORY) }),
  preferences: closed({ stepByStep: { type: "boolean" }, simpleLanguage: { type: "boolean" } }),
  hardConstraints: closed({ legalEligibilityInferenceAllowed: { const: false } }),
  capabilities: closed({ availableAuthMethods: { type: "array", items: enumOf(E.AUTH_METHOD) } }),
}));

w("domains", "sandbox.context.schema.json", ctx("sandbox", "PRACTICE", {
  facts: { type: "object" },
  preferences: closed({ size: { enum: ["SMALL", "LARGE", "NO_PREFERENCE", "UNKNOWN"] } }),
  hardConstraints: { type: "object" },
  capabilities: { type: "object" },
}));

// --- registry ---------------------------------------------------------------
w("registry", "contract-registry.json", {
  coreContractVersion: "1.0.0",
  supportedInputContractVersions: [...SUPPORTED_INPUT_CONTRACT_VERSIONS],
  defaultInputContractVersion: "1.0.0",
  supportedSubmissionVersions: ["1.0.0"],
  frozenDuringHackathon: ["core"],
  schemas: {
    canonicalProfile: "core/canonical-profile.schema.json",
    sessionContextBase: "core/session-context-base.schema.json",
    fieldMetadata: "core/field-metadata.schema.json",
    semanticAction: "core/semantic-action.schema.json",
    recommendation: "core/recommendation.schema.json",
    userDecision: "core/user-decision.schema.json",
    executionPlan: "core/execution-plan.schema.json",
    participantSubmission: "core/participant-submission.schema.json",
    evidence: "core/evidence.schema.json",
    environmentPack: "core/environment-pack.schema.json",
  },
});

w("registry", "environment-contract-registry.json", {
  registryVersion: "1.0.0",
  environments: ["chicken-store", "hospital", "public-office", "sandbox"].map((id) => ({
    environmentId: id, inputContractVersion: "1.0.0",
    schemaRef: `domains/${id}.context.schema.json`,
    vocabularyRef: `vocabularies/${id}.vocabulary.json`,
    supportedProfileContractVersions: ["1.0.0"],
  })),
});

w("registry", "action-registry.json", {
  registryVersion: "1.0.0",
  description: "공식 Action 목록. extensions 로 새 Action 의 실행 의미를 추가할 수 없으며, 여기에 등록되어야 합니다.",
  targetKinds: ["candidate", "option", "review", "staff", "service_type", "visit_type", "appointment", "department", "support", "category", "auth_method"],
  actions: {
    "chicken-store": ["select_service", "select_menu", "select_option", "confirm_option", "open_cart_review", "verify_cart"],
    hospital: ["start", "select_visit_type", "check_appointment", "select_department", "select_flow", "select_support", "verify_checkin", "request_staff_help"],
    "public-office": ["start", "select_category", "select_service", "view_requirements", "select_auth_method", "verify_application", "request_staff_help"],
    sandbox: ["start", "select_item", "select_option", "open_review", "verify_result", "request_staff_help"],
  },
});
