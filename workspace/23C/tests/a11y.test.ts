/**
 * 접근성 보증 검사.
 *
 * 제출물의 `accessibilityEvidence.uiGuarantees` 는 자기 선언이다.
 * 참가팀 UX 템플릿이 경고한다 — "자기 선언만으로 UX PASS 가 되지는 않습니다."
 * 그래서 그 선언을 여기서 **소스로 검사한다.** 선언을 바꾸려면 코드가 먼저 바뀌어야 한다.
 */
import { describe, expect, it } from "vitest";
import { UI_GUARANTEES, SUPPORT_MODES_OFFERED, buildAccessibilityEvidence } from "../src/core/submission-meta";
import { allCss, allTsx, cssFiles, rules, uiSources } from "./ui-source";

/* 한 파일만 읽던 것을 ui/src 전체로 넓혔다.
 * 화면을 파일로 쪼개는 순간, 이름을 하드코딩한 검사는 «검사받지 않는 화면»을 만든다. */
const CSS = allCss();
const APP = allTsx();

/**
 * 직원 도움 버튼이 없어도 되는 화면과 그 이유.
 * 늘리려면 **이유를 적어야** 하고, 그 이유가 사라지면 검사가 먼저 알려준다.
 */
const STAFF_EXEMPT: Record<string, string> = {
  "StaffHelp.tsx": "직원 도움 화면 자체다",
  "Running.tsx": "1초 남짓 지나가는 진행 표시이며 조작 요소가 없다",
};

/** `min-height: 64px;` 같은 선언에서 픽셀값을 전부 뽑는다. */
function minHeights(selector: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\{([^}]*)\\}`, "g");
  for (const m of CSS.matchAll(re)) {
    for (const h of m[1].matchAll(/min-height:\s*(\d+)px/g)) out.push(Number(h[1]));
  }
  return out;
}

describe("검사망 자체를 먼저 확인한다", () => {
  it("ui/src 의 CSS 와 소스를 실제로 읽고 있다", () => {
    // glob 이 고장나 빈 문자열이 되면 아래 «…가 없다» 류 단정이 전부 공짜로 통과한다.
    // 그래서 읽은 양을 먼저 확인한다 — 검사가 무너진 것을 검사한다.
    expect(cssFiles().length, "ui/src 에서 .css 를 하나도 못 읽었습니다").toBeGreaterThan(0);
    expect(uiSources().length, "ui/src 에서 .tsx 를 하나도 못 읽었습니다").toBeGreaterThan(0);
    expect(CSS.length).toBeGreaterThan(1000);
    expect(APP.length).toBeGreaterThan(1000);
  });
});

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

  it("누를 수 있다고 선언한 것은 예외 없이 48px 이상이다", () => {
    /* 위 검사는 선택자 목록이 하드코딩이라 새 컴포넌트를 놓친다. 이건 반대로 간다 —
       `cursor: pointer` 를 쓴 규칙은 «여기 눌러도 됩니다»라고 말한 것이므로,
       그 말을 한 모든 자리가 타깃 기준을 지켜야 한다. 목록을 늘릴 필요가 없다. */
    const bad: string[] = [];
    for (const f of cssFiles()) {
      for (const r of rules(f.text, f.name)) {
        if (!/cursor:\s*pointer/.test(r.body)) continue;
        const h = /min-height:\s*(\d+)px/.exec(r.body);
        if (!h) { bad.push(`${f.name} ${r.selector} — min-height 선언 없음`); continue; }
        if (Number(h[1]) < UI_GUARANTEES.minTouchTargetPx) {
          bad.push(`${f.name} ${r.selector} — ${h[1]}px < ${UI_GUARANTEES.minTouchTargetPx}px`);
        }
      }
    }
    expect(bad, `누를 수 있는데 작은 것:\n  ${bad.join("\n  ")}`).toEqual([]);
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

  it("직원 도움이 모든 화면에서 닿는다 — 화면 목록을 손으로 적지 않는다", () => {
    expect(UI_GUARANTEES.staffHelpReachableFromEveryStep).toBe(true);
    expect(APP).toMatch(/const staffBtn = /); // 공통 버튼 팩토리

    /* 예전에는 화면 이름을 배열로 적어 두었다. 그러면 화면을 새로 만든 사람이 배열을
       고치지 않는 한 그 화면은 영원히 검사 밖이다 — 실제로 «설정» 화면이 그렇게 빠져
       있었다. 이제는 screens/ 를 통째로 훑고, 면제만 이유와 함께 적는다. */
    const screens = uiSources().filter((f) => f.name.startsWith("screens/"));
    expect(screens.length, "screens/ 에서 화면 파일을 찾지 못했습니다").toBeGreaterThan(5);
    for (const s of screens) {
      const base = s.name.slice("screens/".length);
      const reason = STAFF_EXEMPT[base];
      if (reason) {
        // 면제였던 화면이 나중에 조작 요소를 갖게 되면 면제 목록에서 빼야 한다
        expect(s.text, `${base} 는 면제(${reason})인데 직원 도움을 쓰고 있습니다 — 면제 목록에서 빼 주세요`)
          .not.toMatch(/staffBtn\(/);
        continue;
      }
      expect(/staffBtn\(/.test(s.text), `${base} 에 직원 도움 경로가 없습니다`).toBe(true);
    }
  });

  it("모든 Step 이 라우팅 표에 있고, 표에만 있는 화면도 없다", () => {
    // 타입(Record<Step, …>)이 이미 강제하지만, 누가 표의 타입을 느슨하게 바꾸면
    // 조용히 «어디에도 연결되지 않은 화면»이 생긴다. 문자열로 한 번 더 잠근다.
    const model = uiSources().find((f) => f.name === "model.ts");
    const app = uiSources().find((f) => f.name === "App.tsx");
    expect(model, "ui/src/model.ts 를 못 찾았습니다").toBeDefined();
    expect(app, "ui/src/App.tsx 를 못 찾았습니다").toBeDefined();

    const union = /export type Step\s*=\s*([\s\S]*?);/.exec(model!.text);
    expect(union, "model.ts 에서 Step 유니온을 못 찾았습니다").not.toBeNull();
    const steps = [...union![1].matchAll(/"([\w]+)"/g)].map((m) => m[1]).sort();

    const table = /const SCREENS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(app!.text);
    expect(table, "App.tsx 에서 SCREENS 라우팅 표를 못 찾았습니다").not.toBeNull();
    const routed = [...table![1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort();

    expect(steps.length).toBeGreaterThan(5);
    expect(routed, `라우팅 표와 Step 유니온이 어긋납니다`).toEqual(steps);
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

describe("공통 컴포넌트 규약 — 네 갈래로 나눠 만들어도 어긋나지 않게", () => {
  const parts = () => uiSources().filter((f) => f.name.startsWith("components/") && f.name.endsWith(".tsx"));

  it("components/ 의 부품이 전부 배럴(index.ts)에서 내보내진다", () => {
    // 등록되지 않은 부품은 다른 사람 눈에 안 보이고, 결국 같은 것이 두 번 만들어진다
    const barrel = uiSources().find((f) => f.name === "components/index.ts");
    expect(barrel, "components/index.ts 가 없습니다").toBeDefined();
    for (const f of parts()) {
      const name = f.name.slice("components/".length).replace(/\.tsx$/, "");
      expect(barrel!.text, `${name} 가 배럴에 없습니다`).toContain(`./${name}`);
    }
  });

  it("진행 표시는 색만으로 현재 위치를 말하지 않는다", () => {
    const step = parts().find((f) => f.name.endsWith("StepIndicator.tsx"));
    expect(step, "StepIndicator 를 못 찾았습니다").toBeDefined();
    // 완료 표식(✓)과 낭독기용 문장이 둘 다 있어야 한다 — 주황 점과 회색 점의 차이는
    // 색각 이상·저시력 사용자에게 신호가 되지 못한다
    expect(step!.text).toContain("✓");
    expect(step!.text).toMatch(/단계 중/);
    expect(step!.text).toMatch(/srline/);
  });

  it("버튼 부품은 글자 없이 만들 수 없다", () => {
    const cta = parts().find((f) => f.name.endsWith("Cta.tsx"));
    expect(cta, "Cta 를 못 찾았습니다").toBeDefined();
    // label 이 선택(`label?:`)이 되는 순간 아이콘만 있는 버튼을 만들 수 있게 된다
    expect(cta!.text).toMatch(/label:\s*React\.ReactNode;/);
    expect(cta!.text).not.toMatch(/label\?:/);
  });
});

/**
 * 아직 만들지 않은 화면의 명단.
 *
 * 자리만 뚫어 둔 화면이 조용히 남아 배포되는 것을 막는다. 명단과 코드가 어긋나면
 * 여기서 걸린다 — 자리를 새로 뚫고 명단에 안 적어도, 다 만들어 놓고 명단에서
 * 안 지워도 실패한다. **마지막에는 이 명단이 비어 있어야 한다.**
 */
const PLACEHOLDER_SCREENS = [
  "MenuConfirm.tsx",   // 레인 D — 메뉴 확인(신규)
  "QrConnect.tsx",     // 레인 B — S04a·S04b QR 연동
  "SaveChoice.tsx",    // 레인 A — S03 저장 방식
  "SessionStart.tsx",  // 레인 A — S05 세션 시작
];

describe("미완성 화면은 명단에 적힌 것뿐이다", () => {
  it("PLACEHOLDER 를 단 화면과 명단이 정확히 일치한다", () => {
    const marked = uiSources()
      .filter((f) => f.name.startsWith("screens/") && /export const PLACEHOLDER/.test(f.text))
      .map((f) => f.name.slice("screens/".length))
      .sort();
    expect(marked, "미완성 명단과 코드가 어긋납니다 (자리를 뚫었거나 다 만들었으면 명단을 고치세요)")
      .toEqual([...PLACEHOLDER_SCREENS].sort());
  });

  it("미완성 화면도 직원 도움과 빠져나갈 길은 갖는다", () => {
    // 자리만 뚫었더라도 막다른 길이어서는 안 된다
    for (const name of PLACEHOLDER_SCREENS) {
      const f = uiSources().find((x) => x.name === `screens/${name}`);
      expect(f, `${name} 이 없습니다`).toBeDefined();
      expect(f!.text, `${name} 에 직원 도움이 없습니다`).toMatch(/staffBtn\(/);
      expect(f!.text, `${name} 에 빠져나갈 길이 없습니다`).toMatch(/setStep\("start"\)/);
    }
  });
});
