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

/**
 * 희망 금액이 계약에 실리는 자리.
 *
 * 팀 ID("23C")가 숫자로 시작해 확장 namespace 규칙(`/^[A-Z][A-Z0-9_]*\.…/`)을 통과하지
 * 못하므로 TEAM_ 접두사를 붙인다 — 상황신호(CONTEXT_NAMESPACE)와 같은 사정이다.
 */
export const BUDGET_NAMESPACE = "TEAM_23C.budget";

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
    /* 동의 — docs/LOGINLESS_QR_PROFILE_GUIDE.md 7번의 표를 그대로 따른다.
     *
     *   이번만 사용  → SESSION_ONLY        · personalization: false
     *   기기에 저장  → UNTIL_USER_DELETES  · personalization: true
     *
     * personalization 을 늘 true 로 두었던 자리다. 스키마는 boolean 이라고만 하므로
     * 계약 위반은 아니었지만, 키트가 표로 못 박아 둔 매핑과 달랐다.
     *
     * 여기서 말하는 «개인화»는 **프로필을 남겨 다음에도 쓰는 것**이다. 이번 답변으로
     * 이번 추천을 맞추는 일은 저장 여부와 무관하게 늘 하며, 그것까지 «동의 안 함»이라고
     * 적는 뜻이 아니다. 두 값이 늘 같이 움직이는 이유이기도 하다 — 남기지 않기로 한
     * 사람에게 남겨서 하는 개인화는 성립하지 않는다. */
    consent: {
      personalization: asBool(raw.storeProfile),
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
  const budgetKrw = toBudgetKrw(raw.budgetKrw ?? raw["예산"]);

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
  /* 예산은 **hardConstraints 로 가지 않는다.**
   *
   * 그 자리(maxPriceKrw)는 환경 규칙 CHICKEN_PRICE_LIMIT 이 severity: BLOCK 으로 보는
   * 곳이다 — 값이 있으면 초과 후보를 반드시 빼야 하고, 빼지 않으면 계약을 어긴 계획이
   * 만들어진다(tests/rules.test.ts 가 «BLOCK 을 감점으로 다루면 안 된다» 로 못 박아 둔
   * 그 줄이다). 그런데 화면이 이제 묻는 것은 상한이 아니라 «얼마쯤 생각하시나요»이고,
   * 초과는 제외 사유가 아니다. 뜻이 다른 값을 그 자리에 두면 규칙이 우리 대신 «상한»
   * 으로 읽는다.
   *
   * preferences 에도 못 넣는다 — 계약이 그 섹션을 닫아 두었다(chicken-store 는
   * serviceType·spicyLevel·boneType·cupOption·quantity 다섯뿐, validator 의 checkClosed).
   *
   * 남는 자리가 extensions 이고, 계약이 그 자리를 마련한 이유가 정확히 이것이다 —
   * «Core 계약이 모델링하지 않는 것을 팀 namespace 아래 둔다». 상황신호와 같은 길이다. */

  const extensions: Record<string, unknown> = {};
  if (budgetKrw !== undefined) {
    /* 이름을 targetKrw 로 둔다 — maxKrw 였다면 읽는 사람이 다시 상한으로 읽는다.
       증거 JSON 에 그대로 남는 값이라, 그 이름이 곧 우리가 무엇을 약속했는지가 된다. */
    extensions[BUDGET_NAMESPACE] = { targetKrw: budgetKrw };
    fieldMetadata[`/extensions/${BUDGET_NAMESPACE}/targetKrw`] = meta;
  }

  const signals = contextSignals ?? [];
  const ctx = {
    intent: { task: "ORDER_FOOD" },
    facts: {},
    preferences,
    hardConstraints,
    capabilities: {},
    fieldMetadata,
    /* 확장은 있을 때만 키를 만든다 — 빈 배열·빈 객체는 "수집했는데 없음"으로 오독된다.
       상황신호와 예산이 같은 자리를 나눠 쓴다(각자 팀 namespace). */
    ...(signals.length > 0 || Object.keys(extensions).length > 0
      ? { extensions: { ...extensions, ...(signals.length > 0 ? { [CONTEXT_NAMESPACE]: signals } : {}) } }
      : {}),
  } as AnySessionContext;

  return {
    ctx,
    engineCtx: { preferences, hardConstraints, budgetKrw, fieldMetadata, contextSignals: signals } as EngineContext,
  };
}
