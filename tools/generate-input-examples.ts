/**
 * Generates examples/canonical-input/*.json — four DIFFERENT collection channels
 * that all normalize to the SAME Canonical Input. Profile + SessionContext only:
 * no recommendation and no execution plan (those must not be published for the
 * evaluated environments).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { validateCanonicalInput } from "../packages/profile-contract/src/validator";

const ROOT = process.cwd();
const w = (name: string, obj: unknown) => {
  const r = validateCanonicalInput(obj);
  if (!r.valid) throw new Error(`${name} invalid: ${JSON.stringify(r.errors)}`);
  writeFileSync(path.join(ROOT, "examples", "canonical-input", name), JSON.stringify(obj, null, 2) + "\n");
  console.log("wrote", name, "valid=", r.valid);
};

/** Same user, same intent — collected four ways, normalized identically. */
const sessionContext = {
  intent: { task: "ORDER_FOOD" },
  facts: {},
  preferences: { serviceType: "TAKE_OUT", spicyLevel: "HOT", boneType: "BONELESS", quantity: 1 },
  hardConstraints: { allergenIds: ["PEANUT"], maxPriceKrw: 10000 },
  capabilities: {},
  fieldMetadata: {},
};

const make = (channel: string, preferredInput: string, fieldMetadata: Record<string, unknown>, teamId = "TEAM-001") => ({
  inputContractVersion: "1.0.0",
  environmentId: "chicken-store",
  teamId,
  profile: {
    profileId: `${teamId}-PROFILE-001`,
    displayName: "합성 사용자 1",
    dataClassification: "SYNTHETIC_PROFILE",
    source: { collectionChannel: channel, providerId: teamId, collectedAt: "2026-08-01T05:30:00.000Z" },
    accessibility: { largeText: true, simpleSteps: true, visualGuidance: false, hearingSupport: false, mobilitySupport: false, highContrast: false, staffAssistancePreferred: false },
    interaction: { preferredInput, language: "ko-KR", confirmationRequired: true },
    consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
  },
  sessionContext: { ...sessionContext, fieldMetadata },
});

const meta = (source: string, confidence: number, confirmed: boolean) => ({
  "/preferences/serviceType": { source, confidence, confirmedByUser: confirmed, capturedAt: "2026-08-01T05:30:00.000Z" },
  "/preferences/spicyLevel": { source, confidence, confirmedByUser: confirmed, capturedAt: "2026-08-01T05:30:05.000Z" },
  "/hardConstraints/allergenIds": { source, confidence: 1, confirmedByUser: true, capturedAt: "2026-08-01T05:30:10.000Z" },
});

// 웹 폼: 사용자가 직접 골랐으므로 confidence 1, 확인됨.
w("web-form-input.json", make("WEB_FORM", "TOUCH", meta("WEB_FORM", 1, true)));

// 모바일 앱: 저장된 프로필을 불러온 뒤 사용자가 확인.
w("mobile-app-input.json", make("MOBILE_APP", "TOUCH", meta("MOBILE_APP", 1, true)));

// 음성: 인식 신뢰도가 1 미만 → 사용자 재확인을 받아 confirmedByUser=true 로 제출.
w("voice-input.json", make("VOICE", "VOICE", {
  ...meta("VOICE", 0.91, true),
  "/preferences/boneType": { source: "VOICE", confidence: 0.78, confirmedByUser: true, normalizerId: "team001-asr-v2", capturedAt: "2026-08-01T05:30:07.000Z" },
}));

// 보호자 입력: 대리 입력이므로 출처를 ASSISTED_INPUT 으로 기록.
w("assisted-input.json", make("ASSISTED_INPUT", "ASSISTED", meta("ASSISTED_INPUT", 0.95, true)));
