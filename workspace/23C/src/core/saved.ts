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
 *
 * v4 까지는 이것이 저장본의 최종 형식이었다. 지금은 **옛 통합 저장본을 읽는 입구**로만
 * 남아 있다 — 읽는 즉시 splitSaved 가 프로필·세션으로 쪼갠다(QA 1차, 2026-08-13).
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

/* ───────── 프로필·세션 분리 (QA 1차 — 2026-08-13) ─────────
 *
 * «프로필 저장 완료(S04)»는 프로필을, «안내·저장 유도(S15)»는 세션을 저장한다.
 * 한 덩어리로 두면 세션을 지울 때 프로필까지 같이 사라진다 — 실제로 그랬다.
 * 그래서 저장본을 둘로 나눈다:
 *   프로필 = 화면 설정(a11y). S04 에서 저장/삭제된다.
 *   세션   = 답변 6문항 + 확정 메뉴. S15 에서 저장/삭제된다.
 */

export const PROFILE_VERSION = 1;
export const SESSION_VERSION = 1;

export interface SavedProfile {
  v: number;
  /** 화면 설정. UI 의 A11y 타입과 합치는 것은 화면 쪽 책임이다(기본값 병합). */
  a11y: Record<string, unknown>;
  savedAt: string;
}

export interface SavedSession {
  v: number;
  /** 저장된 답변. 저장을 켜면 그 시점의 답변을 전부 담는다(부분 저장 없음). */
  answers: Record<string, unknown>;
  savedAt: string;
  /** 지난번에 확정된 메뉴 — 되살릴지 여부는 화면이 판단한다(생존 후보인지 확인). */
  lastCandidateId?: string;
}

export function migrateProfile(raw: unknown): SavedProfile | null {
  if (!isObj(raw)) return null;
  if (!isObj(raw.a11y)) return null;
  return {
    v: PROFILE_VERSION,
    a11y: raw.a11y,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
  };
}

export function migrateSession(raw: unknown): SavedSession | null {
  if (!isObj(raw)) return null;
  if (!isObj(raw.answers)) return null;
  return {
    v: SESSION_VERSION,
    answers: raw.answers,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
    ...(pickCandidateId(raw) ? { lastCandidateId: pickCandidateId(raw) } : {}),
  };
}

/**
 * 옛 통합 저장본(v3/v4)을 프로필·세션 둘로 쪼갠다.
 *
 * 프로필은 항상 만든다 — 옛 저장본에는 a11y 가 늘 있었다(없으면 migrateSaved 가 {} 로 채운다).
 * 세션은 답변이 실제로 들어 있을 때만 만든다 — S03 에서 «저장하기»만 고르고 주문을 안 마친
 * 저장본은 답변이 비어 있는데, 그것으로 «지난번 주문» 기록을 지어내면 안 된다.
 */
export function splitSaved(m: SavedSettings): { profile: SavedProfile; session: SavedSession | null } {
  return {
    profile: { v: PROFILE_VERSION, a11y: m.a11y, savedAt: m.savedAt },
    session: Object.keys(m.answers).length > 0
      ? {
        v: SESSION_VERSION, answers: m.answers, savedAt: m.savedAt,
        ...(m.lastCandidateId ? { lastCandidateId: m.lastCandidateId } : {}),
      }
      : null,
  };
}
