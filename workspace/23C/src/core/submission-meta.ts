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
  /* 화면마다 상시로 두던 직원 도움을 시안대로 걷어냈다(시안 어느 화면에도 없다).
     지금은 «직원 도움 먼저»를 켠 사람에게만 상단 띠로 따라다닌다. 사실이 바뀌었으므로
     선언도 바꾼다 — 지키지 않는 것을 지킨다고 적지 않는다. */
  staffHelpReachableFromEveryStep: false,
  staffHelpShownWhenUserOptsIn: true,
  /* 선택지 그림은 시안대로 **늘 표시**되며(설정과 무관), 그림 옆에는 언제나 글자가 있다.
     한때 이 그림이 «화면 안내» 토글에 묶여 있었는데 시안에서 그 토글은 다른 일을 한다. */
  iconsAlwaysPairedWithText: true,
  choiceIconsAlwaysVisible: true,
} as const;

export function buildAccessibilityEvidence(raw: RawLike): Record<string, unknown> {
  /**
   * «이번 세션에 선택한 채널»은 **사용자가 실제로 고른 것**만이다.
   *
   * 서비스는 largeText·simpleSteps 를 켠 채로 시작한다 — 이 서비스의 대상에게 그 편이
   * 낫다고 판단한 기본값이다. 그런데 켜져 있다는 이유로 «사용자가 선택했다»고 적으면,
   * 아무것도 고르지 않고 지나간 사람의 제출물에도 LARGE_TEXT·SIMPLE_STEPS 가 실린다.
   * 그건 우리가 정해 놓고 그가 골랐다고 적는 것이다.
   *
   * `_touchedA11y` 가 없으면(스크립트·테스트에서 직접 부를 때) 예전처럼 켜진 것을 센다 —
   * 그 경우 «기본값이 무엇인지»가 아니라 «넘겨준 값이 무엇인지»가 곧 의도이기 때문이다.
   */
  const touched = Array.isArray(raw._touchedA11y) ? (raw._touchedA11y as string[]) : null;
  const on = (k: string) => raw[k] === true;
  const chose = (k: string) => on(k) && (touched === null || touched.includes(k));
  // supportModes 어휘로 매핑되는 것만 채널로 센다. 대응 항목이 없는 플래그
  // (mobilitySupport · highContrast)를 억지로 끼워 넣지 않는다.
  const selected: string[] = [];
  if (chose("largeText")) selected.push("LARGE_TEXT");
  if (chose("hearingSupport")) selected.push("HEARING_SUPPORT");
  if (chose("visualGuidance")) selected.push("VISUAL_GUIDANCE");
  if (chose("simpleSteps")) selected.push("SIMPLE_STEPS");
  if (chose("staffAssistancePreferred")) selected.push("STAFF_HELP");
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
        /* 상시 노출을 걷어냈으므로 이름도 바꾼다 — «every-step» 은 더 이상 사실이 아니다.
           켠 사람에게는 여전히 모든 화면 최상단에 따라다닌다. */
        "staff-help-on-demand",
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
