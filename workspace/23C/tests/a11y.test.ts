/**
 * 접근성 보증 검사.
 *
 * 제출물의 `accessibilityEvidence.uiGuarantees` 는 자기 선언이다.
 * 참가팀 UX 템플릿이 경고한다 — "자기 선언만으로 UX PASS 가 되지는 않습니다."
 * 그래서 그 선언을 여기서 **소스로 검사한다.** 선언을 바꾸려면 코드가 먼저 바뀌어야 한다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { UI_GUARANTEES, SUPPORT_MODES_OFFERED, buildAccessibilityEvidence } from "../src/core/submission-meta";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");
const CSS = read("../ui/src/styles.css");
const APP = read("../ui/src/App.tsx");

/** `min-height: 64px;` 같은 선언에서 픽셀값을 전부 뽑는다. */
function minHeights(selector: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\{([^}]*)\\}`, "g");
  for (const m of CSS.matchAll(re)) {
    for (const h of m[1].matchAll(/min-height:\s*(\d+)px/g)) out.push(Number(h[1]));
  }
  return out;
}

describe("접근성 — 선언한 보증이 실제로 코드에 있는가", () => {
  it("모든 조작 요소가 최소 터치 타깃(48px) 이상이다", () => {
    for (const sel of [".toggle", ".choice", ".btn", ".a11yrow", ".edithead", ".presetrow"]) {
      const hs = minHeights(sel);
      expect(hs.length, `${sel} 에 min-height 선언이 없습니다`).toBeGreaterThan(0);
      for (const h of hs) {
        expect(h, `${sel} 의 min-height ${h}px 가 기준(${UI_GUARANTEES.minTouchTargetPx}px) 미만입니다`)
          .toBeGreaterThanOrEqual(UI_GUARANTEES.minTouchTargetPx);
      }
    }
  });

  it("키보드 포커스가 선언한 굵기로 보인다", () => {
    const m = CSS.match(/:focus-visible\s*\{[^}]*outline:\s*(\d+)px/);
    expect(m, ":focus-visible 아웃라인 선언이 없습니다").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(UI_GUARANTEES.focusVisibleOutlinePx);
  });

  it("prefers-reduced-motion 을 존중한다", () => {
    expect(UI_GUARANTEES.respectsPrefersReducedMotion).toBe(true);
    expect(CSS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("네이티브 button/input 만 쓴다 — div 를 눌러 쓰는 가짜 버튼이 없다", () => {
    expect(APP).not.toMatch(/<div[^>]*onClick=/);
    expect(APP).not.toMatch(/role="button"/);
  });

  it("아이콘은 항상 글자와 함께 나온다 (아이콘 단독 금지)", () => {
    expect(UI_GUARANTEES.iconsAlwaysPairedWithText).toBe(true);
    // 아이콘 span 바로 뒤에 라벨이 이어진다
    expect(APP).toMatch(/aria-hidden="true">\{o\.icon\}<\/span>\}\s*\n?\s*\{o\.label\}/);
  });

  it("직원 도움이 모든 주요 단계에서 닿는다", () => {
    expect(UI_GUARANTEES.staffHelpReachableFromEveryStep).toBe(true);
    // 공통 버튼 팩토리가 있고, 주요 화면에서 쓰인다
    expect(APP).toMatch(/const staffBtn = /);
    // 같은 step 문자열이 조건부 배너 등에서도 쓰이므로, 등장 지점마다 살펴
    // 그중 하나라도 뒤따르는 렌더 블록에 직원 도움이 있으면 통과로 본다.
    // 새 화면을 만들면 여기 배열에 반드시 추가한다 — 목록이 하드코딩이라 자동으로 늘지 않는다.
    // 특히 "stopped"(안전 중단)는 직원 도움이 그 화면의 존재 이유다.
    for (const step of ["start", "wizard", "recommend", "edit", "stopped"]) {
      const parts = APP.split(`step === "${step}"`).slice(1);
      const reachable = parts.some((seg) => /staffBtn\(/.test(seg.slice(0, 3000)));
      expect(reachable, `${step} 화면에 직원 도움 경로가 없습니다`).toBe(true);
    }
  });

  it("음성 입력을 구현하지 않았으므로 선택지로 노출하지 않는다", () => {
    expect(APP).not.toMatch(/"VOICE"/);
    expect(buildAccessibilityEvidence({}).notImplemented).toContain("VOICE_INPUT");
  });
});

describe("접근성 증거 — 켠 것만 보고한다", () => {
  it("아무것도 켜지 않으면 선택 채널이 비어 있다", () => {
    const e = buildAccessibilityEvidence({});
    expect(e.supportModesSelectedInThisSession).toEqual([]);
    expect(e.profileFlagsOn).toEqual([]);
  });

  it("켠 플래그만 공식 supportModes 어휘로 보고한다", () => {
    const e = buildAccessibilityEvidence({ largeText: true, hearingSupport: true, highContrast: true });
    expect(e.supportModesSelectedInThisSession).toEqual(["LARGE_TEXT", "HEARING_SUPPORT"]);
    // highContrast 는 supportModes 어휘에 없으므로 억지로 끼워 넣지 않는다
    expect(e.supportModesSelectedInThisSession).not.toContain("HIGH_CONTRAST");
    expect(e.profileFlagsOn).toContain("highContrast");
  });

  it("대리 입력은 GUARDIAN_MODE 로 기록된다", () => {
    const e = buildAccessibilityEvidence({ preferredInput: "ASSISTED" });
    expect(e.supportModesSelectedInThisSession).toContain("GUARDIAN_MODE");
  });

  it("제공 채널 선언이 공식 어휘 6종을 벗어나지 않는다", () => {
    const official = new Set(SUPPORT_MODES_OFFERED);
    for (const m of buildAccessibilityEvidence({}).supportModesOfferedByService as string[]) {
      expect(official.has(m as (typeof SUPPORT_MODES_OFFERED)[number])).toBe(true);
    }
  });
});
