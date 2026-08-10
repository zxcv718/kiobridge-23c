/**
 * CSS 를 읽어 «실제로 화면에 나오는 색쌍»을 뽑아내는 도구 (테스트 전용).
 *
 * 대비 검사를 사람이 적은 표로 하면 표와 CSS 가 어긋난다 — 색을 바꾼 사람이
 * 표를 같이 고칠 이유가 없기 때문이다. 그래서 표를 쓰지 않고 **CSS 에서 직접**
 * `color` 와 `background` 를 함께 선언한 규칙을 찾아 그 쌍을 검사한다.
 * 새 색을 넣으면 검사도 저절로 늘어난다.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CSS_DIR = fileURLToPath(new URL("../ui/src/", import.meta.url));

/**
 * 주석을 지운다. 지우지 않으면 두 가지가 깨진다 —
 * 규칙 파서가 주석을 선택자로 삼키고, 값 검사가 «설명문에 적힌 색»을 실제 값으로 오인한다.
 * (실제로 tokens.css 는 왜 #8c8c8c 를 버렸는지를 주석에 적어 두었다.)
 */
export const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** ui/src 아래 모든 .css — 파일이 늘어도 검사 밖에 남지 않는다 (하드코딩 금지). */
export function cssFiles(): { name: string; text: string }[] {
  return readdirSync(CSS_DIR)
    .filter((f) => f.endsWith(".css"))
    .sort()
    .map((name) => ({ name, text: stripComments(readFileSync(CSS_DIR + name, "utf-8")) }));
}

export const allCss = (): string => cssFiles().map((f) => f.text).join("\n");

export interface Rule {
  /** 선택자 (여러 개면 원문 그대로) */
  selector: string;
  /** 선언 본문 */
  body: string;
  file: string;
}

/** 최상위 규칙만 훑는다 — @media 안쪽은 여는 중괄호 깊이로 걸러진다. */
export function rules(text: string, file = ""): Rule[] {
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of text.matchAll(re)) {
    // `@import "…";` 처럼 세미콜론으로 끝나는 at-문은 다음 선택자 앞에 그대로 붙어 잡힌다.
    // 마지막 세미콜론 뒤만 선택자다 — 이걸 안 자르면 그 블록이 통째로 검사에서 빠진다.
    const selector = m[1].split(";").pop()!.trim().replace(/\s+/g, " ");
    if (!selector || selector.startsWith("@")) continue; // @media 헤더 자체
    out.push({ selector, body: m[2], file });
  }
  return out;
}

/** `--이름: 값;` 을 모은다. */
export function varsIn(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** 특정 선택자의 블록들에서 커스텀 프로퍼티를 모은다. */
export function paletteOf(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of cssFiles()) {
    for (const r of rules(f.text, f.name)) {
      if (r.selector === selector) Object.assign(out, varsIn(r.body));
    }
  }
  return out;
}

/**
 * `var(--a)` · `var(--a, #fff)` 를 실제 색까지 따라간다.
 * 색으로 끝나지 않으면 null — 검사에서 제외하기 위한 신호다(그라데이션·transparent 등).
 */
export function resolveColor(
  value: string, palette: Record<string, string>, depth = 0,
): string | null {
  const v = value.trim();
  if (depth > 8) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v.length === 9 ? null : v; // 8자리(알파)는 합성이 필요해 제외
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(v);
  if (m) {
    const hit = palette[m[1]];
    if (hit !== undefined) return resolveColor(hit, palette, depth + 1);
    return m[2] ? resolveColor(m[2], palette, depth + 1) : null;
  }
  return null;
}

export interface ColorPair {
  selector: string;
  file: string;
  fg: string;
  bg: string;
}

/**
 * `color` 와 `background`(또는 `background-color`)를 **같은 규칙에서** 선언한 곳을 찾는다.
 *
 * 같은 규칙 안에 둘 다 있다는 것은 «이 글씨가 이 바탕 위에 놓인다»를 저자가
 * 명시한 것이므로, 상속을 추적하지 않고도 확실한 쌍이다.
 */
export function colorPairs(palette: Record<string, string>): ColorPair[] {
  const out: ColorPair[] = [];
  for (const f of cssFiles()) {
    for (const r of rules(f.text, f.name)) {
      const fgDecl = /(?:^|;)\s*color\s*:\s*([^;]+)/.exec(r.body)?.[1];
      const bgDecl = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/.exec(r.body)?.[1];
      if (!fgDecl || !bgDecl) continue;
      const fg = resolveColor(fgDecl, palette);
      const bg = resolveColor(bgDecl.split(/\s+/)[0], palette); // `#fff url(...)` 형태 방어
      if (!fg || !bg) continue;
      out.push({ selector: r.selector, file: f.name, fg, bg });
    }
  }
  return out;
}
