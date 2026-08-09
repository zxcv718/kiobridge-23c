/**
 * 기기 저장본의 형식과 마이그레이션.
 *
 * 화면(App.tsx)이 아니라 여기 둔 이유는 두 가지다.
 *  - 저장 형식이 바뀔 때 기존 사용자의 설정이 사라지지 않는다는 것은 테스트로 지킬 값이다.
 *    guide.txt §5 의 «저장된 내용 확인 · 수정 · 삭제»는 저장본이 살아 있어야 성립한다.
 *  - localStorage 는 무엇이든 들어올 수 있는 입구다. 다른 탭·확장·구버전이 남긴 값이
 *    화면을 죽이면 안 되므로, 해석 실패는 전부 null 로 흡수한다.
 */

export const SAVED_VERSION = 4;

export type SaveScope = "ALL" | "LASTING";

/** 지난번에 확정한 주문 — «지난번처럼 준비할까요?»(화면목록 S05)의 근거. */
export interface LastOrder {
  candidateId: string;
  answers: Record<string, unknown>;
  savedAt: string;
}

export interface SavedSettings {
  v: number;
  answers: Record<string, unknown>;
  /** 화면 설정. UI 의 A11y 타입과 합치는 것은 화면 쪽 책임이다(기본값 병합). */
  a11y: Record<string, unknown>;
  scope: SaveScope;
  savedAt: string;
  lastOrder?: LastOrder;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 형태가 온전한 지난 주문만 살린다 — 반쯤 깨진 값으로 "지난번처럼"을 제안하지 않는다. */
function pickLastOrder(v: unknown): LastOrder | undefined {
  if (!isObj(v)) return undefined;
  if (typeof v.candidateId !== "string" || v.candidateId.length === 0) return undefined;
  if (!isObj(v.answers)) return undefined;
  return {
    candidateId: v.candidateId,
    answers: v.answers,
    savedAt: typeof v.savedAt === "string" ? v.savedAt : "",
  };
}

/**
 * 저장본을 현재 형식으로 올린다. 해석할 수 없으면 null(= 저장본 없음으로 취급).
 *
 * v3(버전 필드가 없던 형식)에는 지난 주문 개념이 없었으므로 lastOrder 는 비운다.
 * 없는 것을 있는 것처럼 채우지 않는다.
 */
export function migrateSaved(raw: unknown): SavedSettings | null {
  if (!isObj(raw)) return null;
  if (!isObj(raw.answers)) return null;

  return {
    v: SAVED_VERSION,
    answers: raw.answers,
    a11y: isObj(raw.a11y) ? raw.a11y : {},
    // 모르는 값이면 좁은 쪽이 아니라 기본값으로 되돌린다 — 저장 범위를 임의로 넓히지 않는다
    scope: raw.scope === "LASTING" ? "LASTING" : "ALL",
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
    ...(pickLastOrder(raw.lastOrder) ? { lastOrder: pickLastOrder(raw.lastOrder) } : {}),
  };
}
