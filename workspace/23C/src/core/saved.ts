/**
 * 기기 저장본의 형식과 마이그레이션.
 *
 * 화면(App.tsx)이 아니라 여기 둔 이유는 두 가지다.
 *  - 저장 형식이 바뀔 때 기존 사용자의 설정이 사라지지 않는다는 것은 테스트로 지킬 값이다.
 *    guide.txt §5 의 «저장된 내용 확인 · 수정 · 삭제»는 저장본이 살아 있어야 성립한다.
 *  - localStorage 는 무엇이든 들어올 수 있는 입구다. 다른 탭·확장·구버전이 남긴 값이
 *    화면을 죽이면 안 되므로, 해석 실패는 전부 null 로 흡수한다.
 *
 * 저장 "범위"(전부 / 오래 쓰는 것만)는 없앴다. 그 선택은 공용기기 걱정에서 나온 것인데,
 * 공용기기의 답은 부분 저장이 아니라 **저장을 끄는 것**이고 그 길은 이미 있다.
 * guide.txt §5 도 «공용기기에서 자동 저장 방지»라고 쓰지 부분 저장을 요구하지 않는다.
 * 남겨두면 사용자에게 판단만 하나 더 얹고(페인포인트 2위가 «옵션 적용의 어려움 46.3%»),
 * 화면에서도 "전부 쓸까 설정만 쓸까"를 저장할 때 한 번 시작할 때 또 묻게 된다.
 */

export const SAVED_VERSION = 4;

export interface SavedSettings {
  v: number;
  /** 저장된 답변. 저장을 켜면 그 시점의 답변을 전부 담는다(부분 저장 없음). */
  answers: Record<string, unknown>;
  /** 화면 설정. UI 의 A11y 타입과 합치는 것은 화면 쪽 책임이다(기본값 병합). */
  a11y: Record<string, unknown>;
  savedAt: string;
  /**
   * 지난번에 확정된 메뉴. 답변만 재현하면 엔진이 다시 1위를 뽑으므로, 대안을 직접
   * 고른 경우 되살릴 근거가 필요하다. 되살릴지 여부는 화면이 판단한다(생존 후보인지 확인).
   */
  lastCandidateId?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 문자열인 후보 ID 만 받는다. 옛 형식(lastOrder.candidateId)도 함께 읽는다. */
function pickCandidateId(raw: Record<string, unknown>): string | undefined {
  const direct = raw.lastCandidateId;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const legacy = isObj(raw.lastOrder) ? raw.lastOrder.candidateId : undefined;
  return typeof legacy === "string" && legacy.length > 0 ? legacy : undefined;
}

/**
 * 저장본을 현재 형식으로 올린다. 해석할 수 없으면 null(= 저장본 없음으로 취급).
 *
 * 옛 저장본의 scope 는 읽지 않고 버린다. 다만 그때 부분 저장(LASTING)이었다면 answers 에
 * 일부 항목만 들어 있는데, 그것은 그대로 둔다 — 없는 답을 지어내지 않는다.
 * 화면은 answers 에 실제로 무엇이 들어 있는지를 보고 되살리기 문구를 정한다.
 */
export function migrateSaved(raw: unknown): SavedSettings | null {
  if (!isObj(raw)) return null;
  if (!isObj(raw.answers)) return null;

  return {
    v: SAVED_VERSION,
    answers: raw.answers,
    a11y: isObj(raw.a11y) ? raw.a11y : {},
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
    ...(pickCandidateId(raw) ? { lastCandidateId: pickCandidateId(raw) } : {}),
  };
}
