/**
 * 주문 계획 URL 인계 코덱.
 *
 * 서버가 없는 체험 모드에서, 모바일로 확정한 주문 계획을 매장 키오스크로 넘기는 유일한 통로가
 * URL(또는 QR)이다. 그래서 여기서는 "추천 결과"를 통째로 인코딩하지 않고 "마법사 답변 +
 * 접근성 설정"만 인코딩한다 — 받는 쪽이 canonical.ts/engine.ts(ui/src/logic.ts 와 동일 경로)로
 * 같은 추천을 그대로 재현하게 하기 위해서다.
 *
 * 개인정보 원칙: 이름·전화번호·주소 같은 개인 식별 정보는 이 payload 에 애초에 필드가 없다.
 * encode/decode 양쪽 모두 화이트리스트만 통과시켜서, 호출자가 실수로 마법사 폼 상태를 통째로
 * 넘겨도(예: 접근성 폼에 임의 필드가 섞여 들어와도) 링크에는 절대 실리지 않는다.
 *
 * 인코딩: JSON → UTF-8 바이트(TextEncoder) → base64url(패딩 없음, `+``/` 대신 `-``_`).
 * Buffer 를 쓰지 않는 이유는 브라우저(키오스크 데모 UI)와 Node(테스트·CLI) 양쪽에서 이 파일이
 * 그대로 동작해야 하기 때문이다. btoa/atob 만으로는 한국어 같은 비 라틴 문자를 그대로 못 담아서
 * (Latin1 가정) base64 변환을 직접 구현한다.
 */
import { PREFERRED_INPUT } from "@kiobridge/profile-contract";

/** 링크로 넘길 최소 정보 — 이걸로 받는 쪽에서 같은 추천을 재현한다 */
export interface PlanLinkPayload {
  v: 1; // 스키마 버전
  answers: Record<string, unknown>; // 마법사 답변 (한국어 라벨/숫자 그대로)
  a11y: Record<string, boolean | string>; // 접근성 플래그 + preferredInput
}

const SCHEMA_VERSION = 1 as const;

// 화이트리스트 — canonical.ts buildChickenContext 가 실제로 읽는 7문항 키와 맞춘다.
// 여기 없는 키(이름·전화번호 등)는 encode/decode 어느 쪽에서도 절대 통과하지 않는다.
// 새 질문을 추가하면 canonical.ts 와 여기를 함께 바꿔야 한다.
const ANSWER_KEYS = [
  "serviceType", "spicyLevel", "boneType", "cupOption", "quantity", "allergies", "budgetKrw",
] as const;

// 접근성 불리언 플래그 7개 — canonical.ts buildProfile 의 accessibility 섹션과 동일.
const A11Y_BOOL_KEYS = [
  "largeText", "simpleSteps", "visualGuidance", "hearingSupport",
  "mobilitySupport", "highContrast", "staffAssistancePreferred",
] as const;

const PREFERRED_INPUT_VALUES: string[] = Object.values(PREFERRED_INPUT);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 알려진 답변 키만 남긴다. 값 자체는 검증하지 않는다 — 정규화는 canonical.ts 의 책임이다. */
function pickAnswers(answers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ANSWER_KEYS) {
    if (answers[key] !== undefined) out[key] = answers[key];
  }
  return out;
}

/** 접근성 플래그도 같은 원칙 — 타입까지 검증해 임의 문자열/값 주입을 막는다. */
function pickA11y(a11y: Record<string, unknown>): Record<string, boolean | string> {
  const out: Record<string, boolean | string> = {};
  for (const key of A11Y_BOOL_KEYS) {
    if (typeof a11y[key] === "boolean") out[key] = a11y[key] as boolean;
  }
  if (typeof a11y.preferredInput === "string" && PREFERRED_INPUT_VALUES.includes(a11y.preferredInput)) {
    out.preferredInput = a11y.preferredInput;
  }
  return out;
}

/* ───────────────────────── base64url (Buffer 없이) ─────────────────────────
 * TextEncoder/TextDecoder 는 브라우저·Node 18+ 양쪽의 표준 전역이라 별도 폴리필이 없다. */

const B64URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_REVERSE: Record<string, number> = Object.fromEntries(
  [...B64URL_CHARS].map((ch, i) => [ch, i]),
);

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const hasB2 = i + 2 < bytes.length;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += B64URL_CHARS[(triplet >> 18) & 0x3f];
    out += B64URL_CHARS[(triplet >> 12) & 0x3f];
    out += hasB1 ? B64URL_CHARS[(triplet >> 6) & 0x3f] : "";
    out += hasB2 ? B64URL_CHARS[triplet & 0x3f] : "";
  }
  return out;
}

/** 문자 집합·길이가 base64url 로 불가능하면 예외를 던진다 — 호출부가 잡아서 null 로 바꾼다. */
function base64UrlToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9\-_]*$/.test(s)) throw new Error("invalid base64url charset");
  if (s.length % 4 === 1) throw new Error("invalid base64url length");

  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const c0 = B64URL_REVERSE[s[i]];
    const c1 = i + 1 < s.length ? B64URL_REVERSE[s[i + 1]] : undefined;
    const c2 = i + 2 < s.length ? B64URL_REVERSE[s[i + 2]] : undefined;
    const c3 = i + 3 < s.length ? B64URL_REVERSE[s[i + 3]] : undefined;
    if (c0 === undefined || c1 === undefined) throw new Error("invalid base64url chunk");
    const triplet = (c0 << 18) | (c1 << 12) | ((c2 ?? 0) << 6) | (c3 ?? 0);
    out.push((triplet >> 16) & 0xff);
    if (c2 !== undefined) out.push((triplet >> 8) & 0xff);
    if (c3 !== undefined) out.push(triplet & 0xff);
  }
  return new Uint8Array(out);
}

function encodeUtf8Base64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

/** UTF-8 로 디코딩할 수 없는 바이트열이면 예외를 던진다(fatal: true) — 깨진 링크를 조용히 깨진 문자열로 살리지 않는다. */
function decodeUtf8Base64Url(s: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(base64UrlToBytes(s));
}

/* ───────────────────────── 공개 API ───────────────────────── */

export function encodePlanLink(p: PlanLinkPayload): string {
  const payload: PlanLinkPayload = {
    v: SCHEMA_VERSION,
    answers: pickAnswers(p.answers ?? {}),
    a11y: pickA11y(p.a11y ?? {}),
  };
  return encodeUtf8Base64Url(JSON.stringify(payload));
}

/**
 * 형식이 조금이라도 어긋나면 throw 없이 null. 사용자가 손상되었거나 오래된(구버전) 링크를
 * 열어도 화면이 죽으면 안 되므로, 실패 경로는 전부 여기서 흡수한다.
 */
export function decodePlanLink(s: string): PlanLinkPayload | null {
  if (typeof s !== "string" || s.length === 0) return null;

  let json: string;
  try {
    json = decodeUtf8Base64Url(s);
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) return null; // 배열·문자열·숫자·null 최상위는 전부 거부
  if (parsed.v !== SCHEMA_VERSION) return null; // 스키마 버전 불일치 — 미래/과거 버전을 임의 해석하지 않는다
  if (!isPlainObject(parsed.answers) || !isPlainObject(parsed.a11y)) return null;

  return {
    v: SCHEMA_VERSION,
    answers: pickAnswers(parsed.answers),
    a11y: pickA11y(parsed.a11y),
  };
}
