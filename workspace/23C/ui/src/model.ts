/**
 * 화면들이 공유하는 타입·상수·순수 함수.
 *
 * 화면을 파일로 쪼개면서 App.tsx 에 있던 «데이터»를 여기로 옮겼다. 화면이
 * App.tsx 를 import 하면 순환이 생기기 때문이고, 더 중요하게는 질문 목록·
 * 접근성 항목 같은 것이 어느 한 화면의 소유물이 아니기 때문이다.
 *
 * 여기에 있는 것은 전부 React 를 모른다 — 렌더링은 screens/ 와 components/ 가 한다.
 */
import type { RawUserInput } from "./logic";
import { migrateSaved, type SavedSettings as CoreSaved } from "../../src/core/saved";

/**
 * 흐름의 화면 하나하나. App.tsx 의 라우팅 표가 이 유니온을 그대로 덮는다
 * (`Record<Step, …>`) — 새 화면을 만들면 표에 넣지 않고는 타입이 통과하지 않는다.
 */
export type Step =
  | "start" | "profile" | "wizard" | "calculating" | "recommend"
  | "confirm" | "run" | "result" | "staff" | "edit" | "stopped";

/** 추천 계산 화면(S11)을 보여주는 시간. 진행 중임을 알리는 최소한이며, 결과를 늦추려는 것이 아니다. */
export const CALC_MS = 600;

/** 움직임을 줄여 달라고 한 사용자에게는 지연을 주지 않는다 — CSS 뿐 아니라 흐름에도 적용한다. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ───────────────────────── 접근성 설정 ─────────────────────────
 * profile.accessibility 의 7개 boolean 을 전부 사용자에게 연다.
 * 각 항목의 `effect` 는 켰을 때 화면에서 실제로 바뀌는 것을 적은 것이며,
 * 바뀌지 않는 항목은 만들지 않는다(선언만 하는 토글 금지). */
export interface A11y {
  largeText: boolean;
  highContrast: boolean;
  simpleSteps: boolean;
  visualGuidance: boolean;
  hearingSupport: boolean;
  mobilitySupport: boolean;
  staffAssistancePreferred: boolean;
  /** 공식 enum PREFERRED_INPUT 중 실제로 지원하는 것만 노출한다(VOICE 미구현이므로 제외). */
  preferredInput: "TOUCH" | "ASSISTED";
}

export const A11Y_DEFAULT: A11y = {
  largeText: true, highContrast: false, simpleSteps: true, visualGuidance: false,
  hearingSupport: false, mobilitySupport: false, staffAssistancePreferred: false,
  preferredInput: "TOUCH",
};

export const A11Y_ITEMS: { key: keyof A11y; label: string; effect: string }[] = [
  { key: "largeText", label: "큰 글씨", effect: "글자와 버튼이 커집니다" },
  { key: "highContrast", label: "고대비", effect: "검은 배경에 밝은 글씨로 바뀝니다" },
  { key: "simpleSteps", label: "쉬운 말", effect: "설명이 짧고 쉬운 문장으로 바뀝니다" },
  { key: "visualGuidance", label: "그림 함께 보기", effect: "선택지에 그림이 함께 표시됩니다" },
  { key: "hearingSupport", label: "소리 없이 보기", effect: "모든 안내를 화면 글자로만 드립니다" },
  { key: "mobilitySupport", label: "누르기 편하게", effect: "버튼이 더 커지고 간격이 넓어집니다" },
  { key: "staffAssistancePreferred", label: "직원 도움 먼저", effect: "직원 부르기 버튼이 맨 위에 크게 나옵니다" },
];

/* ───────────────────── S02 화면 맞춤 문답 ─────────────────────
 * 화면목록 S02 «실시간 변동되는 화면을 통해 최적 화면 맞춤».
 *
 * 토글 7개를 먼저 보여주면 "무엇을 켜야 나에게 맞는지"를 사용자가 알아야 한다.
 * 대신 실제 크기로 렌더한 문장을 보여주고 보이는지만 묻는다 — 판단 대상이
 * 설정 이름이 아니라 **자기 눈에 보이는 화면**이 된다.
 *
 * 산출 결과는 곧바로 화면에 반영되고, 아래 토글에서 언제든 바꿀 수 있다.
 * (자동으로 정해 놓고 못 바꾸게 하면 «자동으로 불러온 정보의 재확인» 원칙에 어긋난다) */
export const PROBE_SIZES = ["1em", "1.4em", "1.9em"];
export const PROBE_SAMPLE = "매운 순살 닭강정 6,000원";

/** 단계별 산출값 — 더 키워야 보인다는 것은 글씨 외의 도움도 필요하다는 신호로 본다. */
export const PROBE_RESULT: Partial<A11y>[] = [
  { largeText: false },
  { largeText: true },
  { largeText: true, highContrast: true, visualGuidance: true },
];

/** 오류 주입 시연 — 공식 7종 전부(API_CONTRACT). 한국어 제목이 기본, 코드는 참조용 병기. */
export const INJECTIONS: { code: string; label: string; desc: string }[] = [
  { code: "PAYMENT_ACTION_ATTEMPT", label: "결제를 시도하면?", desc: "주문 계획에 결제 누르기를 몰래 넣어 봅니다" },
  { code: "USER_NOT_APPROVED", label: "승인 없이 실행하면?", desc: "사용자 확인 없이 실행을 밀어붙여 봅니다" },
  { code: "MISSING_VERIFIER", label: "확인 절차를 건너뛰면?", desc: "장바구니 확인 없이 마치려고 해 봅니다" },
  { code: "CANDIDATE_UNAVAILABLE", label: "품절 메뉴를 고르면?", desc: "품절된 메뉴를 주문 계획에 넣어 봅니다" },
  { code: "STATE_MISMATCH", label: "화면 순서를 어기면?", desc: "예상과 다른 화면 상태로 진행해 봅니다" },
  { code: "FORBIDDEN_ACTION", label: "금지된 동작을 하면?", desc: "허용 목록에 없는 동작을 시도해 봅니다" },
  { code: "UNKNOWN_STATE", label: "모르는 화면을 만나면?", desc: "정의되지 않은 화면 상태를 참조해 봅니다" },
];

/** 실행계획에 들어가는 옵션 값의 한국어 이름 — 대체 안내에 쓴다 */
export const OPTION_KO: Record<string, string> = {
  PAPER: "종이컵", REGULAR: "일반컵", NONE: "컵 없음",
  MILD: "순한맛", MEDIUM: "보통맛", HOT: "매운맛",
  BONE: "뼈", BONELESS: "순살",
  DINE_IN: "먹고 가기", TAKE_OUT: "포장",
  Q1: "1개", Q2: "2개", Q3: "3개",
};
export const GROUP_KO: Record<string, string> = {
  CUP: "컵", SPICY_LEVEL: "맵기", BONE_TYPE: "형태", SERVICE_TYPE: "이용 방식", QUANTITY: "수량",
};

export const STOP_KO: Record<string, string> = {
  NORMAL_BOUNDARY_STOP: "정상 경계 정지",
  SAFETY_STOP: "안전 정지",
};

export interface Question {
  key: string;
  title: string;
  hint?: string;
  multi?: boolean;
  options: { value: string | number; label: string; sub?: string; icon?: string }[];
}

/* 질문 순서 = 화면목록 S06~S10 (알레르기 → 맵기 → 뼈 → 포장 → 수량), 그 뒤 컵·예산.
 *
 * 알레르기가 맨 앞인 것은 편의가 아니라 **안전 요건**이다. 알레르기를 뒤에 두면
 * 그 질문에 닿기 전에 흐름이 끊길 여지가 생기고, 그때 allergenIds 는 UNKNOWN 이
 * 아니라 미수집이라 안전 정지도 안 걸린 채 알레르기 제외만 조용히 사라진다.
 * core/ask.ts 의 allergensAnswered 가 1차 방어선이고, 이 순서가 2차 방어선이다. */
export const QUESTIONS: Question[] = [
  { key: "allergies", title: "피해야 하는 알레르기가 있으세요?", hint: "해당하는 것을 모두 눌러 주세요. 알레르기가 있는 메뉴는 점수를 깎는 게 아니라 아예 빼고 추천합니다.", multi: true, options: [
    { value: "없음", label: "없어요", icon: "✅" }, { value: "땅콩", label: "땅콩", icon: "🥜" }, { value: "콩", label: "콩(대두)", icon: "🫘" }, { value: "우유", label: "우유", icon: "🥛" },
    { value: "계란", label: "계란", icon: "🥚" }, { value: "밀", label: "밀", icon: "🌾" }, { value: "새우", label: "새우", icon: "🦐" }, { value: "모름", label: "잘 모르겠어요", icon: "❓" } ] },
  { key: "spicyLevel", title: "맵기는 어느 정도가 좋으세요?", options: [
    { value: "순한맛", label: "순한맛", icon: "🥛" }, { value: "보통", label: "보통맛", icon: "🌶️" }, { value: "매운맛", label: "매운맛", icon: "🔥" }, { value: "상관없음", label: "상관없어요", icon: "🤷" } ] },
  { key: "boneType", title: "뼈와 순살 중 어떤 것이 편하세요?", options: [
    { value: "순살", label: "순살", icon: "🍗" }, { value: "뼈", label: "뼈", icon: "🦴" }, { value: "상관없음", label: "상관없어요", icon: "🤷" } ] },
  { key: "serviceType", title: "어떻게 이용하시겠어요?", options: [
    { value: "포장", label: "포장하기", icon: "🥡" }, { value: "매장", label: "먹고 가기", icon: "🍽️" }, { value: "상관없음", label: "상관없어요", icon: "🤷" } ] },
  { key: "quantity", title: "몇 개 주문하시겠어요?", options: [
    { value: 1, label: "1개", icon: "1️⃣" }, { value: 2, label: "2개", icon: "2️⃣" }, { value: 3, label: "3개", icon: "3️⃣" } ] },
  { key: "cupOption", title: "컵이 필요하세요?", hint: "메뉴에 따라 선택할 수 있는 컵이 다릅니다.", options: [
    { value: "종이컵", label: "종이컵", icon: "🥤" }, { value: "일반컵", label: "일반컵", icon: "🥛" },
    { value: "없음", label: "필요 없어요", icon: "🚫" }, { value: "상관없음", label: "상관없어요", icon: "🤷" } ] },
  { key: "budgetKrw", title: "예산 상한이 있으세요?", options: [
    { value: "없음", label: "없어요" }, { value: 6000, label: "6,000원" }, { value: 7000, label: "7,000원" }, { value: 10000, label: "10,000원" } ] },
];

export const EDIT_LABELS: Record<string, string> = {
  serviceType: "이용 방식", spicyLevel: "맵기", boneType: "형태",
  quantity: "수량", cupOption: "컵", allergies: "알레르기", budgetKrw: "예산",
};

/** 요약 행에 보여줄 현재 값 (답변은 이미 한국어 라벨/숫자로 저장돼 있다) */
export function answerLabel(key: string, v: unknown): string {
  if (v === undefined) return "아직 선택 안 함";
  if (key === "allergies") {
    const a = (v as string[]) ?? [];
    return a.length === 0 || a[0] === "없음" ? "없음" : a.join("·");
  }
  if (key === "quantity") return `${v}개`;
  if (key === "budgetKrw") return v === "없음" ? "없음" : `${Number(v).toLocaleString()}원`;
  if (v === "매장") return "먹고 가기";
  return String(v);
}

/* ───────────────────────── 시연 프리셋 ─────────────────────────
 * 주의: 이것은 "화면 하드코딩"이 아니다. 버튼은 **입력만** 채우고,
 * 추천은 다른 경로와 똑같이 같은 엔진이 계산한다. 결과를 미리 정해두지 않는다. */
export interface Preset {
  id: string;
  title: string;
  shows: string;
  answers: Record<string, unknown>;
  a11y?: Partial<A11y>;
  /** 시간대 시연용 고정 시각 (미지정이면 지금 시각) */
  hour?: number;
}
export const PRESETS: Preset[] = [
  {
    id: "p-normal", title: "박순자 · 견과류 알레르기 · 포장", shows: "정상 추천",
    answers: { serviceType: "포장", spicyLevel: "매운맛", boneType: "순살", quantity: 1, cupOption: "종이컵", allergies: ["땅콩"], budgetKrw: 7000 },
    a11y: { largeText: true, simpleSteps: true },
  },
  {
    id: "p-context", title: "같은 사람 · 이용 방식 미정 · 점심 붐빔", shows: "상황에 따라 순서가 달라짐",
    answers: { serviceType: "상관없음", spicyLevel: "매운맛", boneType: "순살", quantity: 1, cupOption: "상관없음", allergies: ["땅콩"], budgetKrw: 7000 },
    a11y: { largeText: true, simpleSteps: true }, hour: 12,
  },
  {
    id: "p-a11y", title: "김영호 · 저시력 · 그림과 큰 글씨", shows: "다른 접근성 요구",
    answers: { serviceType: "매장", spicyLevel: "순한맛", boneType: "순살", quantity: 2, cupOption: "일반컵", allergies: ["없음"], budgetKrw: "없음" },
    a11y: { largeText: true, highContrast: true, visualGuidance: true, mobilitySupport: true },
  },
  {
    id: "p-unknown", title: "알레르기를 모르는 경우", shows: "안전 중단 — 승인 차단",
    answers: { serviceType: "포장", spicyLevel: "상관없음", boneType: "상관없음", quantity: 1, cupOption: "상관없음", allergies: ["모름"], budgetKrw: "없음" },
    a11y: { largeText: true, staffAssistancePreferred: true },
  },
  {
    id: "p-empty", title: "예산 5,000원 · 매운맛 · 순살", shows: "조건에 맞는 메뉴 없음",
    answers: { serviceType: "포장", spicyLevel: "매운맛", boneType: "순살", quantity: 1, cupOption: "상관없음", allergies: ["없음"], budgetKrw: 5000 },
  },
];

/* 기기 저장.
 *
 * 요구사항은 "무엇을 저장하라"가 아니라 "사용자가 통제하게 하라"다 (guide.txt 5번):
 *   저장 여부를 사용자가 선택 · 저장된 내용 확인 · 수정 · 삭제 ·
 *   공용기기 자동저장 방지 · 자동으로 불러온 정보의 재확인
 *
 * 그래서 묻는 것은 **켤지 말지 하나뿐**이다. 저장 범위를 나누지 않는 이유는
 * core/saved.ts 에 적었다 — 공용기기의 답은 부분 저장이 아니라 저장 끄기다. */
export const STORAGE_KEY = "kb23c-saved-settings-v4";
/** v3 저장본을 버리지 않는다 — 형식이 바뀌었다고 사용자 설정이 사라지면 안 된다. */
export const LEGACY_KEY = "kb23c-saved-settings-v3";

/** 화면에서 쓰는 저장본 — core 형식에 UI 의 A11y 타입을 입힌 것 */
export interface SavedSettings extends Omit<CoreSaved, "a11y"> {
  a11y: A11y;
}

/** 해석은 core/saved.ts 가 한다 — localStorage 는 무엇이든 들어올 수 있는 입구다. */
export const readSaved = (key: string): SavedSettings | null => {
  try {
    const s = localStorage.getItem(key);
    if (!s) return null;
    const m = migrateSaved(JSON.parse(s));
    return m ? { ...m, a11y: { ...A11Y_DEFAULT, ...(m.a11y as Partial<A11y>) } } : null;
  } catch { return null; }
};

export const loadSaved = (): SavedSettings | null => {
  const cur = readSaved(STORAGE_KEY);
  if (cur) return cur;
  const old = readSaved(LEGACY_KEY); // 구버전 저장본을 새 키로 옮기고 계속 쓴다
  if (!old) return null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* 저장 불가 환경이면 이번 세션만 메모리로 쓴다 */ }
  return old;
};

export function savedSummary(s: SavedSettings): string {
  const a = s.answers;
  const parts: string[] = [];
  for (const q of QUESTIONS) {
    if (a[q.key] === undefined) continue;
    parts.push(`${EDIT_LABELS[q.key] ?? q.key} ${answerLabel(q.key, a[q.key])}`);
  }
  const on = A11Y_ITEMS.filter((i) => s.a11y[i.key] === true).map((i) => i.label);
  if (on.length) parts.push(on.join("·"));
  return parts.join(" · ");
}

/** 마법사 답변 + 접근성 설정 → RawUserInput (코어 계약 입력). */
export function buildRawInput(
  answers: Record<string, unknown>, a11y: A11y,
  fromSaved: boolean, storeProfile: boolean,
): RawUserInput {
  const a = { ...answers };
  const allergies = (a.allergies as (string | number)[] | undefined)?.filter((x) => x !== "없음") ?? [];
  return {
    /* "상관없어요"를 지우지 않고 그대로 넘긴다 — normalize 가 NO_PREFERENCE 로 정규화한다.
     * 누락(안 물어봄)과 NO_PREFERENCE(물었고 양보 가능)는 서로 다른 상태다.
     * 엔진·실행계획의 definite() 는 둘 다 "선호 없음"으로 보므로 추천 결과는 달라지지 않는다. */
    serviceType: a.serviceType,
    spicyLevel: a.spicyLevel,
    boneType: a.boneType,
    cupOption: a.cupOption,
    quantity: a.quantity,
    allergies: (a.allergies as unknown[] | undefined) === undefined ? undefined : allergies,
    budgetKrw: a.budgetKrw === "없음" ? undefined : a.budgetKrw,
    largeText: a11y.largeText,
    highContrast: a11y.highContrast,
    simpleSteps: a11y.simpleSteps,
    visualGuidance: a11y.visualGuidance,
    hearingSupport: a11y.hearingSupport,
    mobilitySupport: a11y.mobilitySupport,
    staffAssistancePreferred: a11y.staffAssistancePreferred,
    preferredInput: a11y.preferredInput,
    language: "ko-KR",
    storeProfile,
    // 대리 입력이면 출처를 정직하게 남긴다 (공식 enum)
    _collectedVia: fromSaved ? "IMPORTED" : a11y.preferredInput === "ASSISTED" ? "ASSISTED_INPUT" : "WEB_FORM",
    _confirmedByUser: true, // 저장본도 배너에서 사용자가 확인한 뒤에만 이 경로에 들어온다
  };
}
