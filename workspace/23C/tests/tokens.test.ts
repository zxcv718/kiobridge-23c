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

  it("대비 미달로 버린 값이 되돌아오지 않는다", () => {
    // #8c8c8c(3.36:1) 는 Figma 에 있지만 채택하지 않았다. 누가 다시 가져오면 여기서 걸린다.
    expect(allCss()).not.toMatch(/#8c8c8c/i);
  });

  it("보조 글씨색은 Figma 의 두 값 중 통과하는 쪽이다", () => {
    expect(BASE["--kb-color-text-secondary"]).toBe("#45454d");
    expect(contrastRatio("#45454d", "#ffffff")).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("흰 글씨를 얹는 강조색이 따로 있고, 그 위에서 본문 기준을 넘는다", () => {
    const strong = BASE["--kb-color-accent-strong"];
    expect(strong, "--kb-color-accent-strong 가 없습니다").toBeDefined();
    expect(contrastRatio(BASE["--kb-color-text-inverse"], strong)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("브랜드 주황은 글자를 얹지 않는 자리용이며 UI 경계 기준(3:1)은 넘는다", () => {
    const primary = BASE["--kb-color-accent-primary"];
    expect(primary).toBe("#ff5a1f");
    expect(contrastRatio(primary, "#ffffff")).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(primary, "#ffffff")).toBeLessThan(AA_TEXT); // 그래서 strong 이 필요하다
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
    it(`${modeName} 팔레트의 모든 글씨/바탕 쌍이 4.5:1 이상이다`, () => {
      const pairs = colorPairs(palette);
      expect(pairs.length, "색쌍을 하나도 못 찾았습니다 — 파서가 고장났을 수 있습니다").toBeGreaterThan(5);
      const bad = pairs
        .map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
        .filter((p) => p.ratio < AA_TEXT)
        .map((p) => `${p.file} ${p.selector} — ${p.fg} on ${p.bg} = ${p.ratio.toFixed(2)}:1`);
      expect(bad, `대비 미달:\n  ${bad.join("\n  ")}`).toEqual([]);
    });
  }

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
