/**
 * WCAG 2.1 색 대비 계산 — 접근성 주장을 재는 자.
 *
 * 왜 순수 함수로 빼는가: 대비는 «디자인 취향»이 아니라 판정 가능한 수치다.
 * 수치라면 테스트가 지킬 수 있고, 지킬 수 있으면 나중에 누가 토큰을 바꿔도
 * 조용히 무너지지 않는다. `tests/a11y.test.ts` 가 이 함수로 토큰을 전수 검사한다.
 *
 * 출처: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** 본문 글씨 (1.4.3) */
export const AA_TEXT = 4.5;
/** 큰 글씨 — 24px 이상, 또는 18.66px 이상이면서 굵게 (1.4.3) */
export const AA_LARGE_TEXT = 3;
/** 의미를 지닌 UI 경계·상태 표시 (1.4.11) */
export const AA_NON_TEXT = 3;

const HEX6 = /^#?([0-9a-f]{6})$/i;
const HEX3 = /^#?([0-9a-f]{3})$/i;

/**
 * `#rrggbb` · `#rgb` · `rrggbb` 를 읽는다.
 *
 * 색이 아닌 값(예: `var(--kb-…)`)은 던진다. 조용히 검정으로 떨어뜨리면
 * 「대비 21:1 통과」라는 거짓 합격이 나오는데, 그게 정확히 이 파일이 막으려는 일이다.
 */
export function parseHex(hex: string): Rgb {
  const s = hex.trim();
  const m6 = HEX6.exec(s);
  if (m6) {
    const n = parseInt(m6[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m3 = HEX3.exec(s);
  if (m3) {
    const [a, b, c] = m3[1];
    return parseHex(`#${a}${a}${b}${b}${c}${c}`);
  }
  throw new Error(`색으로 읽을 수 없습니다: ${hex}`);
}

/** sRGB 감마 보정 — 화면 값(0~1)을 물리적 밝기로 되돌린다. */
const linearize = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * 상대 휘도 0(검정) ~ 1(흰색).
 *
 * 계수가 초록에 0.7152 로 쏠려 있다 — 사람 눈이 초록에 가장 민감하기 때문이다.
 * 그래서 주황·빨강은 «밝아 보여도» 휘도가 낮고, 눈대중이 여기서 가장 크게 빗나간다.
 */
export function relativeLuminance(color: string | Rgb): number {
  const { r, g, b } = typeof color === "string" ? parseHex(color) : color;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** 두 색의 대비비 1:1 ~ 21:1. 순서는 상관없다. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** 소수 둘째 자리까지 — 테스트 실패 메시지에 쓴다 ("3.12 < 4.5" 가 "미달"보다 낫다). */
export const ratioText = (a: string | Rgb, b: string | Rgb): string =>
  `${contrastRatio(a, b).toFixed(2)}:1`;
