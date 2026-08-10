/**
 * 대비비 계산기 — 접근성 주장의 근거.
 *
 * 이 제품은 «키오스크 앞에서 통제권이 가장 적은 사용자»를 대상으로 한다고 말한다.
 * 그러면 색 대비는 취향이 아니라 요건이다. 그런데 지금까지 우리에게는 그것을 재는
 * 자가 없었다 — 눈으로 봤을 뿐이다. 주황·빨강 계열은 눈에 밝아 보여도 휘도가 낮아
 * 눈대중이 가장 크게 빗나가는 색이고, 하필 우리 브랜드색이 그것이다.
 *
 * 기준: WCAG 2.1
 *   1.4.3 본문 4.5:1 · 큰 글씨(24px 이상, 또는 18.66px 이상 굵게) 3:1
 *   1.4.11 의미를 지닌 UI 경계 3:1
 */
import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance, parseHex, AA_TEXT, AA_LARGE_TEXT, AA_NON_TEXT } from "../src/core/contrast";

describe("색 파싱", () => {
  it("6자리·3자리·# 없는 표기를 모두 읽는다", () => {
    expect(parseHex("#ff5a1f")).toEqual({ r: 255, g: 90, b: 31 });
    expect(parseHex("ff5a1f")).toEqual({ r: 255, g: 90, b: 31 });
    expect(parseHex("#FFF")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("색이 아닌 문자열은 조용히 넘어가지 않고 던진다", () => {
    // localStorage 와 같은 이유다 — 무엇이든 들어올 수 있는 입구에서 조용한 실패는 위험하다
    expect(() => parseHex("var(--kb-color-text-primary)")).toThrow();
    expect(() => parseHex("#12345")).toThrow();
  });
});

describe("상대 휘도", () => {
  it("흰색은 1, 검은색은 0", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });

  it("초록이 같은 값의 빨강·파랑보다 훨씬 밝게 계산된다 (계수 0.7152)", () => {
    expect(relativeLuminance("#00ff00")).toBeGreaterThan(relativeLuminance("#ff0000"));
    expect(relativeLuminance("#ff0000")).toBeGreaterThan(relativeLuminance("#0000ff"));
  });
});

describe("대비비", () => {
  it("검정 대 흰색은 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });

  it("같은 색끼리는 1:1", () => {
    expect(contrastRatio("#ff5a1f", "#ff5a1f")).toBeCloseTo(1, 5);
  });

  it("순서를 바꿔도 같은 값이다", () => {
    expect(contrastRatio("#45454d", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#45454d"), 10);
  });

  it("WCAG 기준선 #767676 은 흰 배경에서 4.5 를 갓 넘는다", () => {
    // 널리 알려진 참조값(4.54:1) — 계산기가 맞는지 외부 기준으로 확인한다
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
  });
});

describe("Figma 토큰 판정 — 어느 쪽을 채택할지는 계산이 정한다", () => {
  it("color/text/secondary #8c8c8c 는 흰 배경에서 본문 기준 미달이다", () => {
    // 이 한 줄이 이 계산기를 만든 이유다. 눈으로는 «회색 보조 글씨»로 멀쩡해 보인다.
    expect(contrastRatio("#8c8c8c", "#ffffff")).toBeLessThan(AA_TEXT);
  });

  it("같은 파일의 --kb-color-text-secondary #45454d 는 통과한다 — 그래서 이쪽을 쓴다", () => {
    expect(contrastRatio("#45454d", "#ffffff")).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("브랜드 주황 #ff5a1f 위의 흰 글씨는 본문 기준 미달이다", () => {
    // 눈에는 선명하지만 휘도가 낮다. CTA 라벨이 18px Medium 이라 «큰 글씨» 예외도 못 받는다.
    expect(contrastRatio("#ffffff", "#ff5a1f")).toBeLessThan(AA_TEXT);
    expect(contrastRatio("#ffffff", "#ff5a1f")).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe("기준선 상수", () => {
  it("WCAG AA 수치를 그대로 담는다", () => {
    expect(AA_TEXT).toBe(4.5);
    expect(AA_LARGE_TEXT).toBe(3);
    expect(AA_NON_TEXT).toBe(3);
  });
});
