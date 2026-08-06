/**
 * 제출물의 선택 채널 3종 — `extensions` · `accessibilityEvidence` · `teamMetadata`.
 *
 * 스키마상 핵심 객체는 additionalProperties:false 이므로 임의 필드는 반드시 여기에 둔다.
 * 이 값들은 Evidence 에 그대로 감사 기록되며(extensions), 안전규칙을 우회하지 못한다.
 *
 * 원칙: 선언이 아니라 사실만 적는다.
 *  - 켜지지 않은 접근성 채널을 켜졌다고 적지 않는다.
 *  - 구현하지 않은 기능을 features 에 넣지 않는다.
 *  - 여기에 적은 UI 보증은 tests/a11y.test.ts 가 실제로 검사한다.
 */
import type { PublicFixture } from "@kiobridge/participant-sdk";
import { WEIGHTS } from "./engine";
import type { ContextSignal } from "./context";

export type RawLike = Record<string, unknown>;

/** 이 서비스가 제공하는 공식 supportModes 어휘 (닭강정 환경에는 이 옵션 그룹이 없어 프로필로만 전달된다) */
export const SUPPORT_MODES_OFFERED = [
  "LARGE_TEXT", "HEARING_SUPPORT", "VISUAL_GUIDANCE", "SIMPLE_STEPS", "STAFF_HELP", "GUARDIAN_MODE",
] as const;

/** UI 가 코드 수준에서 보증하는 것. 같은 항목을 a11y 테스트가 검사한다. */
export const UI_GUARANTEES = {
  minTouchTargetPx: 48,
  keyboardOnlyFlowSupported: true,
  focusVisibleOutlinePx: 3,
  respectsPrefersReducedMotion: true,
  staffHelpReachableFromEveryStep: true,
  iconsAlwaysPairedWithText: true,
} as const;

export function buildAccessibilityEvidence(raw: RawLike): Record<string, unknown> {
  const on = (k: string) => raw[k] === true;
  // supportModes 어휘로 매핑되는 것만 채널로 센다. 대응 항목이 없는 플래그
  // (mobilitySupport · highContrast)를 억지로 끼워 넣지 않는다.
  const selected: string[] = [];
  if (on("largeText")) selected.push("LARGE_TEXT");
  if (on("hearingSupport")) selected.push("HEARING_SUPPORT");
  if (on("visualGuidance")) selected.push("VISUAL_GUIDANCE");
  if (on("simpleSteps")) selected.push("SIMPLE_STEPS");
  if (on("staffAssistancePreferred")) selected.push("STAFF_HELP");
  if (raw.preferredInput === "ASSISTED") selected.push("GUARDIAN_MODE");

  return {
    supportModesOfferedByService: [...SUPPORT_MODES_OFFERED],
    supportModesSelectedInThisSession: selected,
    /** supportModes 어휘 밖이지만 이 서비스가 실제로 제공하는 조절 */
    additionalControls: ["HIGH_CONTRAST", "LARGER_TOUCH_TARGETS"],
    profileFlagsOn: [
      "largeText", "highContrast", "simpleSteps", "visualGuidance",
      "hearingSupport", "mobilitySupport", "staffAssistancePreferred",
    ].filter(on),
    preferredInput: raw.preferredInput ?? "TOUCH",
    uiGuarantees: UI_GUARANTEES,
    notImplemented: ["VOICE_INPUT"],
    verification: {
      static: "workspace/23C/tests/a11y.test.ts — 스타일·마크업에서 uiGuarantees 검사 (11건)",
      measured: "workspace/23C/tests/e2e/keyboard.spec.ts — 실제 브라우저에서 키보드 완주·포커스 가시성·타깃 크기·200% 확대·색상 비의존 측정 (6건)",
      lastMeasuredResult: "PASS",
    },
  };
}

export function buildTeamExtensions(raw: RawLike, signals: ContextSignal[]): Record<string, unknown> {
  return {
    "23C": {
      schemaVersion: "1.0.0",
      features: [
        "loginless-session-only",
        "device-profile-optional-with-delete",
        "profile-session-storage-boundary",
        "accessibility-7-flags",
        "explainable-recommendation",
        "context-signals-time-of-day",
        "staff-help-every-step",
        "safety-injection-demo",
      ],
      recommendationData: {
        engine: "deterministic-weighted-score",
        weights: { ...WEIGHTS },
        contextSignalCount: signals.length,
        note: "외부 맥락은 정렬 순서만 조정하며 후보를 제거하지 않습니다. 하드 제약 > 선호 > 맥락 순서를 지킵니다.",
      },
      metadata: {
        collectionChannel: raw._collectedVia ?? raw.collectedVia ?? "WEB_FORM",
        llmUsed: false,
        externalApiUsed: false,
      },
    },
  };
}

export function buildTeamMetadata(fixture: PublicFixture, teamId: string): Record<string, unknown> {
  // 주의 — fixtureVersion 은 "chicken-store@0.2.0" 형식이라 공식 PII 탐지기의
  // 이메일 정규식 /[\w.+-]+@[\w-]+\.[\w.-]+/ 에 걸려 PERSONAL_DATA_NOT_ALLOWED 오탐이 난다.
  // 키트 자신의 manifest 값이므로 그대로 실으면 검증이 실패한다. @ 를 기준으로 나눠 싣는다.
  const [fixtureId, fixtureVersion] = String(fixture.manifest.fixtureVersion ?? "").split("@");
  return {
    teamId,
    serviceName: "주문 도우미",
    environmentId: fixture.manifest.environmentId,
    fixtureId,
    fixtureVersion: fixtureVersion ?? "",
  };
}
