/**
 * STEP 2·3 코어 — RawUserInput → Canonical Profile / SessionContext.
 * 순수 모듈(브라우저·Node 공용): CLI(participant.ts)와 데모 UI가 같은 코드를 쓴다.
 */
import type { AnySessionContext, UserProfile } from "@kiobridge/participant-sdk";
import { nowIso8601Utc, PREFERRED_INPUT } from "@kiobridge/profile-contract";
import {
  toServiceType, toSpicyLevel, toBoneType, toCupOption, toAllergens, toQuantity, toBudgetKrw, asBool,
} from "./normalize";
import type { EngineContext } from "./engine";
import { CONTEXT_NAMESPACE, type ContextSignal } from "./context";

export type RawUserInput = Record<string, unknown>;

const PREFERRED_INPUTS: string[] = Object.values(PREFERRED_INPUT);

/** STEP 2 — 오래 유지되는 정보만 Profile로. 이번 세션 값은 넣지 않는다. */
/** 기기 저장본을 불러온 경우 출처를 정직하게 IMPORTED로 기록한다 (공식 enum). */
const channelOf = (raw: RawUserInput): "WEB_FORM" | "IMPORTED" =>
  raw._collectedVia === "IMPORTED" ? "IMPORTED" : "WEB_FORM";

export function buildProfile(raw: RawUserInput): UserProfile {
  const preferredInput = PREFERRED_INPUTS.includes(String(raw.preferredInput))
    ? (String(raw.preferredInput) as UserProfile["interaction"]["preferredInput"])
    : "TOUCH";
  return {
    profileId: "23C-PROFILE-001", // 가명 식별자 — 실제 ID 금지
    dataClassification: "SYNTHETIC_PROFILE",
    source: {
      collectionChannel: channelOf(raw),
      providerId: "23C",
      collectedAt: nowIso8601Utc(),
    },
    accessibility: {
      largeText: asBool(raw.largeText),
      simpleSteps: asBool(raw.simpleSteps),
      visualGuidance: asBool(raw.visualGuidance),
      hearingSupport: asBool(raw.hearingSupport),
      mobilitySupport: asBool(raw.mobilitySupport),
      highContrast: asBool(raw.highContrast),
      staffAssistancePreferred: asBool(raw.staffAssistancePreferred),
    },
    interaction: {
      preferredInput,
      language: typeof raw.language === "string" && raw.language.includes("-") ? raw.language : "ko-KR",
      confirmationRequired: true, // 승인 없는 실행은 이 서비스에 없다
    },
    consent: {
      personalization: true,
      // "이번 한 번만"이 기본값 — 저장을 원할 때만 UNTIL_USER_DELETES
      retentionPolicy: asBool(raw.storeProfile) ? "UNTIL_USER_DELETES" : "SESSION_ONLY",
    },
  };
}

/** STEP 3 — 닭강정 세션 맥락. 섹션 구분이 곧 의미론: 선호(양보 가능) vs 하드 제약(양보 불가). */
export function buildChickenContext(
  raw: RawUserInput,
  /** 외부 맥락. Core 계약을 바꾸지 않고 팀 namespace 아래 extensions 로만 들어간다. */
  contextSignals?: ContextSignal[],
): { ctx: AnySessionContext; engineCtx: EngineContext } {
  const meta = {
    source: channelOf(raw), // 기기 저장본이면 IMPORTED — 재확인(confirmedByUser) 후에만 사용된다
    confidence: typeof raw._confidence === "number" ? raw._confidence : 1,
    confirmedByUser: raw._confirmedByUser !== false,
  };

  const serviceType = toServiceType(raw.serviceType ?? raw["이용"]);
  const spicyLevel = toSpicyLevel(raw.spicyLevel ?? raw["맵기"]);
  const boneType = toBoneType(raw.boneType ?? raw["형태"]);
  const cupOption = toCupOption(raw.cupOption ?? raw["컵"]);
  const quantity = toQuantity(raw.quantity ?? raw["수량"]);
  const allergenIds = toAllergens(raw.allergies ?? raw["알레르기"]);
  const maxPriceKrw = toBudgetKrw(raw.budgetKrw ?? raw["예산"]);

  const preferences: Record<string, unknown> = {};
  const hardConstraints: Record<string, unknown> = {};
  const fieldMetadata: Record<string, typeof meta> = {};

  const set = (section: Record<string, unknown>, sectionName: string, key: string, value: unknown) => {
    if (value === undefined) return; // 수집하지 않은 값은 보내지 않는다 (누락 ≠ UNKNOWN)
    section[key] = value;
    fieldMetadata[`/${sectionName}/${key}`] = meta;
  };

  set(preferences, "preferences", "serviceType", serviceType);
  set(preferences, "preferences", "spicyLevel", spicyLevel);
  set(preferences, "preferences", "boneType", boneType);
  set(preferences, "preferences", "cupOption", cupOption);
  set(preferences, "preferences", "quantity", quantity);
  set(hardConstraints, "hardConstraints", "allergenIds", allergenIds);
  set(hardConstraints, "hardConstraints", "maxPriceKrw", maxPriceKrw);

  const signals = contextSignals ?? [];
  const ctx = {
    intent: { task: "ORDER_FOOD" },
    facts: {},
    preferences,
    hardConstraints,
    capabilities: {},
    fieldMetadata,
    // 신호가 없으면 키 자체를 만들지 않는다 — 빈 배열은 "수집했는데 없음"으로 오독된다.
    ...(signals.length > 0 ? { extensions: { [CONTEXT_NAMESPACE]: signals } } : {}),
  } as AnySessionContext;

  return {
    ctx,
    engineCtx: { preferences, hardConstraints, fieldMetadata, contextSignals: signals } as EngineContext,
  };
}
