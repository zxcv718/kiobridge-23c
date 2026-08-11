/**
 * 디자인 토큰 검사.
 *
 * 두 가지를 지킨다.
 *  1. 쓰는 토큰은 반드시 정의돼 있다 — 오타 하나로 색이 조용히 사라지지 않게.
 *  2. 화면에 실제로 나오는 색쌍은 WCAG AA 를 넘는다 — 사람이 적은 표가 아니라
 *     CSS 에서 뽑아낸 쌍으로 검사하므로, 색을 바꾸면 검사도 같이 따라온다.
 *
 * 기본 팔레트와 고대비 팔레트를 **각각** 검사한다. 고대비 모드는 색을 통째로
 * 갈아끼우므로, 기본에서 통과한 것이 거기서도 통과한다는 보장이 없다.
 */
import { describe, expect, it } from "vitest";
import { contrastRatio, AA_TEXT, AA_NON_TEXT } from "../src/core/contrast";
import { allCss, cssFiles, colorPairs, paletteOf, varsIn } from "./ui-source";

const BASE = paletteOf(":root");
const CONTRAST = { ...BASE, ...paletteOf(".app.contrast") };

/**
 * **시안 값을 그대로 써서 생긴 본문 기준 미달 — 전부, 수치까지.**
 *
 * 기획이 «시안에 있는 것은 시안 그대로»를 요청했고 그 판단은 우리 것이 아니다. 다만
 * 미달이라는 사실은 숨기지 않는다. 한때 이 자리에 «#8c8c8c 하나만» 눈감아 주는 필터가
 * 있었는데, 그러면 예외를 하나 더 받아들일 때마다 필터를 슬쩍 넓히게 되고 무엇을
 * 봐줬는지 아무도 세지 않게 된다.
 *
 * 그래서 목록으로 둔다. 여기 적힌 쌍만, **여기 적힌 수치일 때만** 통과한다:
 *  · 새 미달이 다른 자리에서 생기면 아래 전수 검사가 잡는다.
 *  · 이 색들이 조용히 더 나빠지면 수치가 어긋나 여기서 잡힌다.
 *  · README 알려진 제한사항에 같은 숫자가 적혀 있어, 문서와 코드가 갈라질 수 없다.
 *
 * 고대비 팔레트에는 예외가 **하나도 없다** — 대비가 필요한 사용자에게 이 서비스가 주는
 * 답이 그쪽이므로, 거기서 미달이 나면 그건 남길 이유가 없는 결함이다.
 */
const 시안예외 = [
  { fg: "#8c8c8c", bg: "#ffffff", ratio: 3.36, where: "보조 글씨색 — 부제·설명 (150:185 · 150:213)" },
  { fg: "#ffffff", bg: "#ff5a1f", ratio: 3.12, where: "브랜드 주황 위 흰 글씨 — 주 버튼·진행 표시 원 (208:754 · 180:173)" },
  { fg: "#ff5a1f", bg: "#ffffff", ratio: 3.12, where: "흰 바탕 위 브랜드 주황 글씨 — 요약 행의 «수정» (185:214)" },
] as const;

const 시안이정한미달 = (p: { fg: string; bg: string }) =>
  시안예외.some((e) => e.fg === p.fg.toLowerCase() && e.bg === p.bg.toLowerCase());

/**
 * **큰 글씨 기준(3:1)으로 재는 자리 — 미달이 아니다.**
 *
 * WCAG 1.4.3 은 24px 이상, 또는 **18.66px 이상 Bold** 를 «큰 글씨»로 보고 3:1 을 요구한다.
 * 우리 전수 검사는 오랫동안 모든 글씨를 4.5 로 쟀다. 그래서 시안이 큰 글씨에만 쓰는
 * #fa520f(3.30:1)를 «쓸 수 없는 색»으로 판정했고, 실제로 한 번은 그 이유로 시안 색 대신
 * 다른 주황을 쓴 자리가 생겼다. 시안이 틀린 것이 아니라 **검사가 덜 정확했던 것이다.**
 *
 * 그렇다고 «큰 글씨니까 봐준다»를 목록으로 두면 목록이 곧 거짓말이 된다 — 나중에 그 규칙의
 * 글씨가 작아져도 목록은 그대로일 것이기 때문이다. 그래서 아래 검사는 **CSS 에서 크기와
 * 굵기를 실제로 읽어** 큰 글씨 조건을 만족하는지 먼저 확인하고, 그 다음에야 3:1 로 잰다.
 *
 * `minEm` 은 18.66px ÷ 18px = 1.037 이다. 좁은 화면에서 기준이 17px 로 줄어도
 * 1.22em × 17 = 20.7px 라 조건은 그대로 성립한다.
 */
const 큰글씨판정 = [
  {
    selector: ".stop-figma-label", fg: "#fa520f", bg: "#ffffff", ratio: 3.34,
    where: "안전 중단의 «ERROR» — 22px Bold (99:1340)",
  },
] as const;

const 큰글씨자리 = (p: { fg: string; bg: string }) =>
  큰글씨판정.some((e) => e.fg === p.fg.toLowerCase() && e.bg === p.bg.toLowerCase());

/** 선택자 하나의 선언 블록을 통째로 꺼낸다 — 크기·굵기를 눈이 아니라 검사가 읽게. */
function ruleBody(selector: string): string | null {
  const re = new RegExp(`(^|[,}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m");
  return re.exec(allCss())?.[2] ?? null;
}

describe("토큰 정의", () => {
  it("tokens.css 가 존재하고 --kb- 토큰을 정의한다", () => {
    const tokens = cssFiles().find((f) => f.name === "tokens.css");
    expect(tokens, "ui/src/tokens.css 가 없습니다").toBeDefined();
    const names = Object.keys(varsIn(tokens!.text)).filter((n) => n.startsWith("--kb-"));
    expect(names.length).toBeGreaterThan(20);
  });

  it("쓰이는 --kb- 토큰이 전부 정의돼 있다", () => {
    const defined = new Set(Object.keys(BASE));
    const used = new Set<string>();
    for (const m of allCss().matchAll(/var\(\s*(--kb-[\w-]+)/g)) used.add(m[1]);
    expect(used.size, "--kb- 토큰을 아무 데서도 쓰지 않고 있습니다").toBeGreaterThan(0);
    for (const name of used) {
      expect(defined.has(name), `${name} 를 쓰는데 정의가 없습니다`).toBe(true);
    }
  });

  /**
   * 시안 값을 그대로 써서 생긴 미달은 **목록과 수치가 정확해야** 한다.
   * 여기가 README 알려진 제한사항과 코드를 묶어 두는 자리다.
   */
  it("시안이 정한 미달은 목록에 적힌 색·수치와 정확히 같다", () => {
    expect(BASE["--kb-color-text-secondary"], "보조 글씨색이 시안 값에서 벗어났습니다").toBe("#8c8c8c");
    expect(BASE["--kb-color-accent-primary"], "브랜드 주황이 시안 값에서 벗어났습니다").toBe("#ff5a1f");
    for (const e of 시안예외) {
      const ratio = contrastRatio(e.fg, e.bg);
      expect(Math.round(ratio * 100) / 100, `${e.where} — README 에 적은 ${e.ratio}:1 과 달라졌습니다`)
        .toBe(e.ratio);
      expect(ratio, `${e.where} — 본문 기준을 넘었다면 예외 목록에서 빼야 합니다`).toBeLessThan(AA_TEXT);
    }
  });

  /** 밝은 바탕 위의 «주황 글씨»(포커스 테두리·수량 숫자) 자리 — 여기서는 기준을 지킨다 */
  it("밝은 바탕에 얹는 짙은 주황이 따로 있고, 흰 바탕에서 본문 기준을 넘는다", () => {
    const strong = BASE["--kb-color-accent-strong"];
    expect(strong, "--kb-color-accent-strong 가 없습니다").toBeDefined();
    expect(contrastRatio(strong, BASE["--kb-color-bg-canvas"])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("브랜드 주황은 UI 경계 기준(3:1)은 넘는다 — 버튼이 바탕에서 구분된다", () => {
    const primary = BASE["--kb-color-accent-primary"];
    expect(contrastRatio(primary, "#ffffff")).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("누를 수 있는 것의 경계는 바탕과 3:1 이상이다", () => {
    // WCAG 1.4.11 — 경계가 컨트롤을 알아보는 유일한 수단인 자리
    for (const bg of ["--kb-color-bg-surface", "--kb-color-bg-canvas"]) {
      expect(
        contrastRatio(BASE["--kb-color-border-control"], BASE[bg]),
        `border-control 이 ${bg} 위에서 3:1 미만입니다`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

describe("화면에 실제로 나오는 색쌍 — CSS 에서 뽑아 전수 검사", () => {
  for (const [modeName, palette] of [["기본", BASE], ["고대비", CONTRAST]] as const) {
    it(`${modeName} 팔레트의 글씨/바탕 쌍 — 시안이 정한 예외 말고는 4.5:1 이상이다`, () => {
      const pairs = colorPairs(palette);
      expect(pairs.length, "색쌍을 하나도 못 찾았습니다 — 파서가 고장났을 수 있습니다").toBeGreaterThan(5);
      const bad = pairs
        .map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
        .filter((p) => p.ratio < AA_TEXT);

      /* 통째로 눈감아 주지 않는다 — 위 `시안예외` 표에 **색쌍까지 정확히 적힌 것만** 뺀다.
         같은 색이라도 다른 바탕에 얹히면 그건 새 미달이므로 여기서 잡힌다.
         `큰글씨판정` 자리는 미달이 아니라 **다른 기준으로 재는 곳**이라 함께 뺀다
         (아래 «큰 글씨 기준으로 재는 자리는 …» 검사가 크기·굵기·3:1 을 따로 확인한다). */
      const 그밖에 = bad
        .filter((p) => !(modeName === "기본" && (시안이정한미달(p) || 큰글씨자리(p))))
        .map((p) => `${p.file} ${p.selector} — ${p.fg} on ${p.bg} = ${p.ratio.toFixed(2)}:1`);
      expect(그밖에, `대비 미달:\n  ${그밖에.join("\n  ")}`).toEqual([]);

      if (modeName === "고대비") {
        expect(bad, "고대비 모드에는 예외가 없어야 합니다").toEqual([]);
      }
    });
  }

  it("큰 글씨 기준으로 재는 자리는 실제로 큰 글씨다 — 그리고 3:1 을 넘는다", () => {
    for (const e of 큰글씨판정) {
      const body = ruleBody(e.selector);
      expect(body, `${e.selector} 규칙을 못 찾았습니다 — 자리가 사라졌으면 표에서도 빼야 합니다`)
        .not.toBeNull();

      /* ① 정말 큰 글씨인가. WCAG 1.4.3 — 18.66px 이상 Bold(700+) 또는 24px 이상.
         em 으로 적혀 있으므로 기준 글씨(18px)를 곱해 판정한다. */
      const em = /font-size:\s*([\d.]+)em/.exec(body!);
      const weight = /font-weight:\s*(\d+)/.exec(body!);
      expect(em, `${e.selector} 에 em 단위 font-size 가 없습니다 — 큰 글씨인지 잴 수 없습니다`).not.toBeNull();
      expect(weight, `${e.selector} 에 font-weight 선언이 없습니다`).not.toBeNull();

      const px = Number(em![1]) * 18;
      const bold = Number(weight![1]) >= 700;
      expect(bold && px >= 18.66 || px >= 24,
        `${e.where} — ${px.toFixed(1)}px / weight ${weight![1]} 는 큰 글씨가 아닙니다. ` +
        `본문 기준(4.5:1)으로 재야 하므로 ${e.fg} 를 쓸 수 없습니다`).toBe(true);

      /* ② 큰 글씨 기준을 넘는가. 그리고 README 에 적은 수치와 같은가. */
      const ratio = contrastRatio(e.fg, e.bg);
      expect(ratio, `${e.where} — 큰 글씨 기준(3:1)에도 미치지 못합니다`).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(Math.round(ratio * 100) / 100, `${e.where} — 적어 둔 ${e.ratio}:1 과 달라졌습니다`).toBe(e.ratio);

      /* ③ 본문 기준을 넘었다면 이 표에 있을 이유가 없다 — 예외는 늘 최소로 둔다. */
      expect(ratio, `${e.where} — 본문 기준을 넘으므로 이 표에서 빼도 됩니다`).toBeLessThan(AA_TEXT);
    }
  });

  it("포커스 테두리가 바탕과 3:1 이상이다 — 키보드 사용자가 어디 있는지 보여야 한다", () => {
    const decl = /:focus-visible\s*\{[^}]*outline:\s*\d+px\s+solid\s+([^;]+);/.exec(allCss());
    expect(decl, ":focus-visible 아웃라인 색 선언을 못 찾았습니다").not.toBeNull();
    for (const [modeName, palette] of [["기본", BASE], ["고대비", CONTRAST]] as const) {
      const outline = resolveOrThrow(decl![1], palette);
      const bg = resolveOrThrow("var(--bg)", palette);
      expect(
        contrastRatio(outline, bg),
        `${modeName} 모드에서 포커스 테두리가 바탕과 3:1 미만입니다`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

describe("모드 전환이 색을 빠뜨리지 않는다", () => {
  it("고대비 모드가 기본 팔레트의 의미색을 전부 다시 정의한다", () => {
    // 하나라도 빠지면 검은 배경에 밝은 배경용 색이 남아 읽을 수 없게 된다
    /* «색인 것»만 고른다. 예전에는 색이 아닌 변수를 이름으로 하나씩 빼 두었는데(--fs),
       그러면 크기 변수를 하나 더 만들 때마다 이 검사가 «고대비에서 --fs-base 를 다시
       정의하지 않았다»고 틀린 실패를 낸다. 실제로 그렇게 났다. 이름이 아니라 **값**을
       보면 목록을 손볼 일이 없다 — 색을 새로 만들면 저절로 검사 대상이 되고, 크기·간격을
       만들면 저절로 빠진다. */
    const base = paletteOf(":root");
    const 색인가 = (v: string) => /#[0-9a-f]{3,8}\b|--kb-color-|\brgba?\(|\bhsla?\(/i.test(v);
    const semantic = Object.keys(base).filter((n) => !n.startsWith("--kb-") && 색인가(base[n]));
    expect(semantic.length, "의미색을 하나도 못 찾았습니다 — 이 검사가 공짜로 통과하고 있습니다")
      .toBeGreaterThan(8);
    const overridden = new Set(Object.keys(paletteOf(".app.contrast")));
    const missing = semantic.filter((n) => !overridden.has(n));
    expect(missing, `고대비 모드에서 다시 정의하지 않은 색: ${missing.join(", ")}`).toEqual([]);
  });
});

/** 테스트 안에서만 쓰는 편의 — 못 풀면 그 자리에서 실패하게 한다. */
function resolveOrThrow(value: string, palette: Record<string, string>): string {
  // css.ts 의 resolveColor 와 같은 규칙이지만, 실패를 조용히 넘기지 않는다
  let v = value.trim();
  for (let i = 0; i < 8; i++) {
    if (/^#[0-9a-f]{3,6}$/i.test(v)) return v;
    const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(v);
    if (!m) break;
    v = (palette[m[1]] ?? m[2] ?? "").trim();
  }
  throw new Error(`색으로 풀리지 않습니다: ${value}`);
}
