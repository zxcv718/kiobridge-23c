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
import {
  migrateProfile, migrateSaved, migrateSession, splitSaved,
  type SavedProfile as CoreProfile, type SavedSession,
} from "../../src/core/saved";

/**
 * 흐름의 화면 하나하나. App.tsx 의 라우팅 표가 이 유니온을 그대로 덮는다
 * (`Record<Step, …>`) — 새 화면을 만들면 표에 넣지 않고는 타입이 통과하지 않는다.
 */
export type Step =
  | "connect"                                          // QR 연동 — 흐름의 1걸음 (매장 QR 링크로 열리면 건너뛴다)
  | "start" | "profile" | "saveChoice" | "sessionStart"
  | "wizard" | "calculating" | "menuConfirm" | "menuSelect"
  | "confirm" | "run" | "savePrompt" | "result" | "staff" | "edit" | "stopped";

/**
 * 흐름 다섯 걸음의 이름 (Figma StepIndicator 181:177 의 문법).
 * QR 연동·홈·프로필·저장방식·세션시작 다섯 화면이 같은 표를 봐야 해서 여기 둔다.
 *
 * **QR 연동이 1걸음으로 돌아왔다(기획 확정 2026-08-12, 시안 S01-B).** 한때 흐름 밖
 * 관문으로 뺐지만, 확정 시안의 진행 표시가 «QR 연동»을 첫 걸음으로 그린다. 매장 QR
 * 링크(?env=)로 열리면 1걸음을 마친 것으로 보고 홈(2걸음)부터 시작하며, 그 확인은
 * 홈의 매장 배너가 한다.
 */
export const FLOW_STEPS = ["QR 연동", "홈", "프로필 생성", "저장 방식", "세션 시작"];

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
  /* 글씨 크기의 기본은 «기본 크기»다(기획 2026-08-12) — 프로필 1/3 라디오의 시안이
     기본 크기를 선택된 채로 그린다. 큰 글씨는 고르는 사람의 것이지 기본값이 아니다. */
  largeText: false, highContrast: false, simpleSteps: true, visualGuidance: false,
  hearingSupport: false, mobilitySupport: false, staffAssistancePreferred: false,
  preferredInput: "TOUCH",
};

export const A11Y_ITEMS: { key: keyof A11y; label: string; effect: string }[] = [
  { key: "largeText", label: "큰 글씨", effect: "글자와 버튼이 커집니다" },
  { key: "highContrast", label: "고대비", effect: "검은 배경에 밝은 글씨로 바뀝니다" },
  { key: "simpleSteps", label: "쉬운 말", effect: "설명이 짧고 쉬운 문장으로 바뀝니다" },
  { key: "visualGuidance", label: "화면 안내", effect: "다음에 누를 버튼을 테두리와 화살표로 강조합니다" },
  { key: "hearingSupport", label: "소리 없이 보기", effect: "모든 안내를 화면 글자로만 드립니다" },
  { key: "mobilitySupport", label: "누르기 편하게", effect: "버튼이 더 커지고 간격이 넓어집니다" },
  { key: "staffAssistancePreferred", label: "직원 도움 먼저", effect: "직원 부르기 버튼이 맨 위에 크게 나옵니다" },
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

/* 질문 순서 = 화면목록 S06~S10 (알레르기 → 맵기 → 뼈 → 포장 → 수량), 그 뒤 예산.
 *
 * **질문은 6개다.** 컵은 7번째였다가 뺐다 — 안 물어도 사용자가 잃는 것이 없는 유일한
 * 축이었기 때문이다(액션 자체가 안 만들어져 «우리가 대신 정하는» 값이 없다).
 * 경위는 core/ask.ts 머리주석에 적어 두었다. 배점도 같이 옮겼다(core/engine.ts WEIGHTS).
 *
 * 알레르기가 맨 앞인 것은 편의가 아니라 **안전 요건**이다. 알레르기를 뒤에 두면
 * 그 질문에 닿기 전에 흐름이 끊길 여지가 생기고, 그때 allergenIds 는 UNKNOWN 이
 * 아니라 미수집이라 안전 정지도 안 걸린 채 알레르기 제외만 조용히 사라진다.
 * core/ask.ts 의 allergensAnswered 가 1차 방어선이고, 이 순서가 2차 방어선이다. */
export const QUESTIONS: Question[] = [
  /* 그림 규칙 — 두 가지를 지킨다.
   *
   * ① **정도가 아니라 종류에만 그림을 붙인다.** 맵기(순한→보통→매운)는 글자가 이미
   *    순서로 말한다. 거기에 고추 그림을 얹으면 «보통맛»에 매운 신호가 붙어 훑어보는
   *    사람에게 순서가 흐트러진다. 실제로 그렇게 보였다.
   * ② **한 질문 안에서는 한 가지 언어만 쓴다.** 어떤 선택지만 Figma 도안이고 나머지가
   *    이모지면, 그 하나가 «더 강한 것»이 아니라 «다른 종류»처럼 보인다.
   *
   * 「상관없어요」에는 그림을 두지 않는다 — 고르는 «것»이 아니라 고르지 않겠다는 답이다. */
  { key: "allergies", title: "피해야 하는 알레르기가 있으세요?", hint: "해당하는 것을 모두 눌러 주세요. 알레르기가 있는 메뉴는 점수를 깎는 게 아니라 아예 빼고 추천합니다.", multi: true, options: [
    /* 라벨은 시안 99:1246 표기 그대로 「대두」다. 저장·엔진이 쓰는 value 는 «콩» 그대로 둔다 —
       화면 글자만 시안에 맞추는 것이지 데이터를 바꾸는 것이 아니다(옛 저장본이 깨진다). */
    { value: "없음", label: "없어요", icon: "✅" }, { value: "땅콩", label: "땅콩", icon: "🥜" }, { value: "콩", label: "대두", icon: "🫘" }, { value: "우유", label: "우유", icon: "🥛" },
    { value: "계란", label: "계란", icon: "🥚" }, { value: "밀", label: "밀", icon: "🌾" }, { value: "새우", label: "새우", icon: "🦐" }, { value: "모름", label: "잘 모르겠어요", icon: "❓" } ] },
  /* ↑ 위 목록은 **저장된 답을 되살리고 조건을 수정하는 화면**이 쓴다. 질문 화면은 이것을
     그대로 그리지 않고 아래 두 걸음으로 나눠 묻는다(디자인 S06 기본 99:1228 / 확장 99:1246).
     한 벌로 두는 이유: 답이 담기는 자리(answers.allergies)는 하나뿐이고, 질문 개수도
     6개 그대로여야 한다. 나뉘는 것은 «묻는 방법»이지 «답의 모양»이 아니다. */
  // 정도(degree)라 그림을 두지 않는다 — 순한→보통→매운은 글자가 이미 순서로 말한다
  /* 시안 99:1264 의 제목 그대로다 — 「맵기」 28px + 「는 어떻게 해드릴까요?」 22px. */
  /* 순서는 시안(S07) 그대로 — 「상관없어요」가 **맨 위**다(2026-08-12 전면 대조).
     예산도 같은 자리(첫째)에 두므로, «고르지 않겠다»는 답의 자리가 두 질문에서 같다. */
  { key: "spicyLevel", title: "맵기는 어떻게 해드릴까요?", options: [
    { value: "상관없음", label: "상관없어요" }, { value: "순한맛", label: "순한맛" }, { value: "보통", label: "보통맛" }, { value: "매운맛", label: "매운맛" } ] },
  /* 제목과 순서 모두 시안 그대로다(99:1270 · 99:1281).
     타일 두 장은 좌우 위치가 곧 그 선택지의 자리라, 순서가 뒤집히면 시안을 본 사람이
     기억한 자리와 어긋난다. 둘 다 반대로 두고 있었고 제목도 우리가 지어 쓴 문장이었다. */
  /* 「상관없어요」를 두지 않는다 — 시안에 없는 우리 선택지였고, 타일 두 장 옆에 붙으면
     시안이 만든 «둘 중 하나»가 셋 중 하나로 흐려진다. 맵기와 예산에는 남긴다: 맵기는
     정도(degree)라 «어느 쪽도 아님»이 실제 답이 되고, 예산의 「없어요」는 양보가 아니라
     «상한이 없다»는 사실이다. 뼈냐 순살이냐는 그 둘 중 어느 쪽도 아니다. */
  { key: "boneType", title: "뼈 있는 것과 없는 것 중 어떤 걸 드시나요?", options: [
    { value: "뼈", label: "뼈" }, { value: "순살", label: "순살" } ] },
  { key: "serviceType", title: "드시고 가나요, 포장하나요?", options: [
    { value: "매장", label: "먹고 가기" }, { value: "포장", label: "포장하기" } ] },
  /* 수량은 선택지가 아니라 «− 1 +» 증감으로 묻는다 (디자인 S10 99:1292). 계약이
     `integer, minimum 1` 이라 상한이 없는데 버튼 셋으로 두면 화면이 계약을 좁힌다.
     아래 options 는 남겨 둔다 — 「1개」 같은 라벨과 시연 프리셋이 참조한다. */
  { key: "quantity", title: "얼마나 드실 건가요?", options: [
    { value: 1, label: "1개" }, { value: 2, label: "2개" }, { value: 3, label: "3개" } ] },
  /* **상한이 아니라 희망 금액을 묻는다.** 넘는다고 빼지 않고, 말한 금액에 가장 가까운
   * 것을 위로 올린다(core/engine.ts budgetKrw). 조건이 조금 안 맞아도 «없습니다»라고
   * 답하는 대신 가장 가까운 것을 권하는 것이 이 질문이 바뀐 이유다.
   *
   * 그래서 5,000원의 뜻도 바뀌었다. 한때 이 선택지는 «조건에 맞는 메뉴가 없습니다»에
   * 닿는 유일한 길이었다(이 가게 최저가가 5,500원이라 그 아래는 아무것도 안 남았다).
   * 이제는 최저가인 5,500원짜리를 맨 위로 올리는 답이다 — 싼 것을 찾는 사람의 답으로
   * 여전히 뜻이 있어 남긴다.
   *
   * «후보 0개» 상태 자체는 없어지지 않았다. 계약이 그 상태를 모델링하고
   * (recommendation.schema.json 의 recommendedCandidateId 는 ["string", "null"]),
   * hardConstraints.maxPriceKrw 가 들어오면 엔진은 여전히 BLOCK 규칙대로 뺀다.
   * 화면이 그 값을 만들지 않게 됐을 뿐이다(core/canonical.ts). */
  /* 첫 선택지의 라벨은 「상관없어요」다. 질문이 「예산 상한이 있으세요?」였을 때는
     「없어요」가 «상한이 없다»로 읽혔지만, 「예산은 얼마인가요?」에 「없어요」로 답하면
     «금액이 없다»가 된다 — 돈이 없다는 뜻으로 읽힐 수 있는 자리에 그 말을 두지 않는다.
     맵기와 같은 말을 쓰는 것이 뜻에도 맞는다: 고르지 않겠다는 답이다.

     **값(value)은 "없음" 그대로 둔다.** 옛 저장본이 그 값을 들고 있고, buildRawInput 이
     그것을 보고 예산을 안 보낸다. 화면 글자만 바꾸는 것이지 데이터를 바꾸는 것이 아니다. */
  /* 선택지는 셋이다(기획 2026-08-12) — 상관없어요 · 5,000원 · 10,000원. 6,000·7,000을
     뺀 것은 «가장 가까운 것을 권하는» 질문에 촘촘한 눈금이 필요 없기 때문이다 —
     싼 쪽·비싼 쪽·상관없음이면 순서가 정해진다. 옛 저장본의 6000/7000 값은 그대로
     동작한다(엔진은 아무 숫자나 받는다) — 화면의 눈금만 줄었다. */
  { key: "budgetKrw", title: "예산은 얼마인가요?", options: [
    { value: "없음", label: "상관없어요" }, { value: 5000, label: "5,000원" }, { value: 10000, label: "10,000원" } ] },
];

/* ───────── 알레르기를 두 걸음으로 묻는다 (디자인 S06) ─────────
 *
 * 시안은 **있는지부터** 묻고(99:1228 «없어요/있어요» 타일 두 장), «있어요»를 누른 사람에게만
 * 항목 목록을 펼친다(99:1246 «보유하신 알레르기를 모두 선택해 주세요» 6종).
 *
 * 한 화면에 「없어요 + 6종 + 잘 모르겠어요」를 늘어놓았던 것을 되돌린 것이다. 그때는
 * 「알레르기가 없다」는 사람도 여덟 개를 훑어 그중 «없어요»를 찾아야 했다. 대부분의
 * 사람이 그쪽인데, 가장 흔한 답에 가장 많은 읽을거리를 물린 셈이다.
 *
 * **「잘 모르겠어요」는 둘째 걸음(항목 목록)의 끝에 둔다**(QA 1차 TC-CM-01 · PO 확정
 * 2026-08-13). 시안 99:1246 에는 없는 우리 선택지지만, 있는지 없는지 모르는 사람이
 * «있어요/없어요» 중 하나를 지어내게 두면 사실이 아닌 것을 사실로 다루게 된다 —
 * 안전 판정(UNKNOWN → 재확인 → 안전 중단 S12)의 입구가 이 선택지다. 첫 걸음의 타일
 * 두 장 구도는 시안 99:1228 그대로 지키고, 목록에만 더한다(allergyListOptions).
 */
/**
 * 수량 상한의 **마지막 안전판** — fixture 자료가 없을 때만 쓴다.
 *
 * 진짜 상한은 매장 자료다(사용자 확정 2026-08-13): candidates.json 의
 * supportedOptions.QUANTITY(«Qn»)를 logic.candidateMaxQty(담긴 메뉴)·fixtureMaxQty
 * (메뉴 확정 전)가 읽고, 스테퍼 세 곳(S10·S13·S14)이 그 값으로 «+»를 잠근다.
 * 계약의 수량에는 상한이 없지만(`integer ≥ 1`), 키오스크가 누를 수 없는 수량을
 * 화면이 만들면 계획이 대체를 하게 된다 — 그 뿌리를 여기서 자른다.
 * 어느 쪽이든 위끝에서는 왜 더 못 누르는지 말하고 직원 도움으로 잇는다.
 */
export const QUANTITY_MAX = 10;

export const ALLERGY_GATE = [
  { value: "없음", label: "없어요" },
  { value: "있음", label: "있어요" },
] as const;

/**
 * 「모름」은 **둘째 걸음(항목 목록)에서 고른다**(QA 1차 TC-CM-01 · PO 확정 2026-08-13).
 * 한때 화면에서 고를 수 없었다 — 그 사이 안전 중단(S12)에 닿는 길 자체가 없었다.
 * 시안(99:1228)의 첫 걸음은 타일 두 장 그대로 두고, 목록에만 「잘 모르겠어요」로 붙는다.
 *
 * 값은 그대로 "모름"이다 — 엔진은 SENTINEL.UNKNOWN 을 하드 제약 미확인으로 다루고
 * (engine.ts `hardConstraintUnknown`), 조합 검증 12,960 에도 「모름」이 들어 있다.
 * 다른 항목과 **함께 고를 수 있다** — 아는 알레르기는 그대로 제외하고, 모름이 남아
 * 있는 한 재확인·안전 중단 경로가 그대로 걸린다(tests/ask.test.ts 동시 선택 절).
 */
export const ALLERGY_UNKNOWN_VALUE = "모름";

/** 둘째 걸음의 성분 6종 — 시안 99:1246 그대로. 「없음」은 여기 없다(첫 걸음의 답이다). */
export const ALLERGY_ITEMS = ["땅콩", "콩", "우유", "계란", "밀", "새우"] as const;

/**
 * 둘째 걸음(목록)에 실제로 그리는 선택지 — 6종 + 「잘 모르겠어요」(TC-CM-01).
 * 라벨·이모지는 QUESTIONS 의 것을 그대로 쓴다 — 같은 것을 두 곳에 적으면 언젠가 갈라진다.
 */
export const allergyListOptions = (): Question["options"] => {
  const listValues: readonly string[] = [...ALLERGY_ITEMS, ALLERGY_UNKNOWN_VALUE];
  return QUESTIONS.find((q) => q.key === "allergies")!
    .options.filter((o) => listValues.includes(String(o.value)));
};

export const EDIT_LABELS: Record<string, string> = {
  serviceType: "이용 방식", spicyLevel: "맵기", boneType: "형태",
  quantity: "수량", allergies: "알레르기", budgetKrw: "예산",
};

/** 질문 선택지에서 값에 해당하는 화면 라벨을 찾는다 — 없으면 값 그대로. */
const optionLabel = (key: string, v: unknown): string =>
  QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.value === v)?.label ?? String(v);

/** 요약 행에 보여줄 현재 값 — 사용자가 고른 **선택지의 라벨**과 같은 말로 보여준다. */
export function answerLabel(key: string, v: unknown): string {
  if (v === undefined) return "아직 선택 안 함";
  if (key === "allergies") {
    const a = (v as string[]) ?? [];
    /* 항목도 화면 라벨로 옮긴다 — 저장값은 «콩»이지만 화면 글자는 「대두」다(위 options
       주석 참조). 구분자는 시안 99:1830 그대로 쉼표다(«대두, 새우»). */
    return a.length === 0 || a[0] === "없음" ? "없음" : a.map((x) => optionLabel(key, x)).join(", ");
  }
  if (key === "quantity") return `${v}개`;
  // 고른 선택지의 라벨과 같은 말로 보여준다 — 요약이 «없음»이면 고른 적 없는 말이 뜬다
  if (key === "budgetKrw") return v === "없음" ? "상관없어요" : `${Number(v).toLocaleString()}원`;
  // 시안 99:1830 은 «보통맛»이라 쓴다 — 값(보통)이 아니라 사용자가 누른 라벨이다
  if (key === "spicyLevel") return optionLabel(key, v);
  /* 이용 방식은 시안이 «먹고 가기»·«포장»이라 쓴다 — «포장하기»(버튼 라벨)가 아니라
     여기만 값 그대로가 시안과 같다. */
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
    answers: { serviceType: "포장", spicyLevel: "매운맛", boneType: "순살", quantity: 1, allergies: ["땅콩"], budgetKrw: 7000 },
    a11y: { largeText: true, simpleSteps: true },
  },
  {
    id: "p-context", title: "같은 사람 · 이용 방식 미정 · 점심 붐빔", shows: "상황에 따라 순서가 달라짐",
    answers: { serviceType: "상관없음", spicyLevel: "매운맛", boneType: "순살", quantity: 1, allergies: ["땅콩"], budgetKrw: 7000 },
    a11y: { largeText: true, simpleSteps: true }, hour: 12,
  },
  {
    id: "p-a11y", title: "김영호 · 저시력 · 그림과 큰 글씨", shows: "다른 접근성 요구",
    answers: { serviceType: "매장", spicyLevel: "순한맛", boneType: "순살", quantity: 2, allergies: ["없음"], budgetKrw: "없음" },
    a11y: { largeText: true, highContrast: true, visualGuidance: true, mobilitySupport: true },
  },
  {
    id: "p-unknown", title: "알레르기를 모르는 경우", shows: "안전 중단 — 승인 차단",
    answers: { serviceType: "포장", spicyLevel: "상관없음", boneType: "상관없음", quantity: 1, allergies: ["모름"], budgetKrw: "없음" },
    a11y: { largeText: true, staffAssistancePreferred: true },
  },
  {
    id: "p-budget", title: "예산 5,000원 · 매운맛 · 순살", shows: "희망 금액에 가장 가까운 메뉴",
    answers: { serviceType: "포장", spicyLevel: "매운맛", boneType: "순살", quantity: 1, allergies: ["없음"], budgetKrw: 5000 },
  },
];

/* 기기 저장.
 *
 * 요구사항은 "무엇을 저장하라"가 아니라 "사용자가 통제하게 하라"다 (guide.txt 5번):
 *   저장 여부를 사용자가 선택 · 저장된 내용 확인 · 수정 · 삭제 ·
 *   공용기기 자동저장 방지 · 자동으로 불러온 정보의 재확인
 *
 * 저장소는 **둘**이다(QA 1차 2026-08-13). 프로필(화면 설정)은 S04 «프로필 저장 완료»가,
 * 세션(답변·확정 메뉴)은 S15 «안내·저장 유도»가 각각 주인이다 — 한 덩어리로 두면
 * 세션을 지울 때 프로필까지 같이 사라진다(실제로 그랬고, 그것이 이 분리의 이유다).
 * 저장 범위를 더 잘게 나누지 않는 이유는 core/saved.ts 에 적었다 —
 * 공용기기의 답은 부분 저장이 아니라 저장 끄기다. */
export const PROFILE_KEY = "kb23c-profile-v1";
export const SESSION_KEY = "kb23c-session-v1";
/** 옛 통합 저장본 — 새 키가 비어 있으면 한 번 읽어 둘로 쪼개 옮기고 지운다. */
const COMBINED_V4_KEY = "kb23c-saved-settings-v4";
const COMBINED_V3_KEY = "kb23c-saved-settings-v3";

/** 화면에서 쓰는 프로필 저장본 — core 형식에 UI 의 A11y 타입을 입힌 것 */
export interface SavedProfile extends Omit<CoreProfile, "a11y"> {
  a11y: A11y;
}
/** 세션 저장본은 core 형식 그대로다 — UI 타입을 입힐 것이 없다. */
export type { SavedSession };

const readRaw = (key: string): unknown => {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
};

/** 해석은 core/saved.ts 가 한다 — localStorage 는 무엇이든 들어올 수 있는 입구다. */
export const loadStores = (): { profile: SavedProfile | null; session: SavedSession | null } => {
  let p = migrateProfile(readRaw(PROFILE_KEY));
  let s = migrateSession(readRaw(SESSION_KEY));
  if (!p && !s) {
    // 새 키가 둘 다 비었으면 옛 통합 저장본(v4 → v3 순)을 찾아 쪼개 옮긴다 —
    // 형식이 바뀌었다고 사용자 설정이 사라지면 안 된다.
    const legacy = migrateSaved(readRaw(COMBINED_V4_KEY)) ?? migrateSaved(readRaw(COMBINED_V3_KEY));
    if (legacy) {
      const split = splitSaved(legacy);
      p = split.profile;
      s = split.session;
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(split.profile));
        if (split.session) localStorage.setItem(SESSION_KEY, JSON.stringify(split.session));
        localStorage.removeItem(COMBINED_V4_KEY);
        localStorage.removeItem(COMBINED_V3_KEY);
      } catch { /* 저장 불가 환경이면 이번 세션만 메모리로 쓴다 */ }
    }
  }
  return {
    profile: p ? { ...p, a11y: { ...A11Y_DEFAULT, ...(p.a11y as Partial<A11y>) } } : null,
    session: s,
  };
};

/** 마법사 답변 + 접근성 설정 → RawUserInput (코어 계약 입력). */
export function buildRawInput(
  answers: Record<string, unknown>, a11y: A11y,
  fromSaved: boolean, storeProfile: boolean,
  /** 사용자가 직접 만진 화면 설정 — 기본값으로 켜진 것과 구분한다 */
  touchedA11y: string[] = [],
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
    /* cupOption 은 화면이 만들지 않는다 — 컵 질문을 뺐다. 코어(canonical.ts)는 여전히
       이 필드를 읽을 수 있고 CLI raw input 으로 들어오면 실행계획이 존중한다. */
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
    /* 켜져 있다는 것과 사용자가 골랐다는 것은 다르다. 제출물의 «이번 세션에 선택한
       채널»은 후자만 센다 — 기본값을 사용자의 선택으로 적지 않는다. */
    _touchedA11y: touchedA11y,
  };
}
