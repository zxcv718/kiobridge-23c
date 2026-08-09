/**
 * 팀 23C 데모 UI — 사용자 접점 전체 흐름.
 * 시작 → 접근성 설정 → 질문 마법사 → 추천(이유·제외·대안·거절·직원 도움) → 최종 확인 → 가상 실행 → 결과(+오류 주입).
 * 판단은 전부 core가, 실행·검증·Evidence는 전부 공식 서버가 한다.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Evidence, ParticipantSubmission, PublicFixture } from "@kiobridge/participant-sdk";
import {
  computeRecommendation, withManualSelection, buildUiSubmission, runOnSimulator, injectError,
  fetchFixture, candidateName, candidatePrice, downloadSubmission, summarizeOrderPlan,
  type RawUserInput, type UiRecommendation, type RunOutcome,
} from "./logic";
import { TIME_SLOT_KO, timeSlotOf } from "../../src/core/context";
import { buildExecutionPlanCore, explainSelections } from "../../src/core/plan";
import { canStopAsking, shouldSafetyStop, isUnresolved } from "../../src/core/ask";
import {
  migrateSaved, SAVED_VERSION,
  type SavedSettings as CoreSaved, type SaveScope, type LastOrder,
} from "../../src/core/saved";
import { decodePlanLink, encodePlanLink, type PlanLinkPayload } from "../../src/core/plan-link";

type Step =
  | "start" | "a11y" | "wizard" | "calculating" | "recommend"
  | "confirm" | "run" | "result" | "staff" | "edit" | "stopped";

/** 추천 계산 화면(S11)을 보여주는 시간. 진행 중임을 알리는 최소한이며, 결과를 늦추려는 것이 아니다. */
const CALC_MS = 600;

/** 움직임을 줄여 달라고 한 사용자에게는 지연을 주지 않는다 — CSS 뿐 아니라 흐름에도 적용한다. */
const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ───────────────────── S02 화면 맞춤 문답 ─────────────────────
 * 화면목록 S02 «실시간 변동되는 화면을 통해 최적 화면 맞춤».
 *
 * 토글 7개를 먼저 보여주면 "무엇을 켜야 나에게 맞는지"를 사용자가 알아야 한다.
 * 대신 실제 크기로 렌더한 문장을 보여주고 보이는지만 묻는다 — 판단 대상이
 * 설정 이름이 아니라 **자기 눈에 보이는 화면**이 된다.
 *
 * 산출 결과는 곧바로 화면에 반영되고, 아래 토글에서 언제든 바꿀 수 있다.
 * (자동으로 정해 놓고 못 바꾸게 하면 «자동으로 불러온 정보의 재확인» 원칙에 어긋난다) */
const PROBE_SIZES = ["1em", "1.4em", "1.9em"];
const PROBE_SAMPLE = "매운 순살 닭강정 6,000원";

/** 단계별 산출값 — 더 키워야 보인다는 것은 글씨 외의 도움도 필요하다는 신호로 본다. */
const PROBE_RESULT: Partial<A11y>[] = [
  { largeText: false },
  { largeText: true },
  { largeText: true, highContrast: true, visualGuidance: true },
];

/** 실행계획의 옵션 그룹 ↔ 마법사 질문 key — "왜 이 값이 됐는지" 문구를 가르는 데 쓴다. */
const GROUP_TO_KEY: Record<string, string> = {
  SERVICE_TYPE: "serviceType", SPICY_LEVEL: "spicyLevel", BONE_TYPE: "boneType",
  CUP: "cupOption", QUANTITY: "quantity",
};

/** 오류 주입 시연 — 공식 7종 전부(API_CONTRACT). 한국어 제목이 기본, 코드는 참조용 병기. */
const INJECTIONS: { code: string; label: string; desc: string }[] = [
  { code: "PAYMENT_ACTION_ATTEMPT", label: "결제를 시도하면?", desc: "주문 계획에 결제 누르기를 몰래 넣어 봅니다" },
  { code: "USER_NOT_APPROVED", label: "승인 없이 실행하면?", desc: "사용자 확인 없이 실행을 밀어붙여 봅니다" },
  { code: "MISSING_VERIFIER", label: "확인 절차를 건너뛰면?", desc: "장바구니 확인 없이 마치려고 해 봅니다" },
  { code: "CANDIDATE_UNAVAILABLE", label: "품절 메뉴를 고르면?", desc: "품절된 메뉴를 주문 계획에 넣어 봅니다" },
  { code: "STATE_MISMATCH", label: "화면 순서를 어기면?", desc: "예상과 다른 화면 상태로 진행해 봅니다" },
  { code: "FORBIDDEN_ACTION", label: "금지된 동작을 하면?", desc: "허용 목록에 없는 동작을 시도해 봅니다" },
  { code: "UNKNOWN_STATE", label: "모르는 화면을 만나면?", desc: "정의되지 않은 화면 상태를 참조해 봅니다" },
];

/** 실행계획에 들어가는 옵션 값의 한국어 이름 — 대체 안내에 쓴다 */
const OPTION_KO: Record<string, string> = {
  PAPER: "종이컵", REGULAR: "일반컵", NONE: "컵 없음",
  MILD: "순한맛", MEDIUM: "보통맛", HOT: "매운맛",
  BONE: "뼈", BONELESS: "순살",
  DINE_IN: "먹고 가기", TAKE_OUT: "포장",
  Q1: "1개", Q2: "2개", Q3: "3개",
};
const GROUP_KO: Record<string, string> = {
  CUP: "컵", SPICY_LEVEL: "맵기", BONE_TYPE: "형태", SERVICE_TYPE: "이용 방식", QUANTITY: "수량",
};

const STOP_KO: Record<string, string> = {
  NORMAL_BOUNDARY_STOP: "정상 경계 정지",
  SAFETY_STOP: "안전 정지",
};

/* ───────────────────────── 접근성 설정 ─────────────────────────
 * profile.accessibility 의 7개 boolean 을 전부 사용자에게 연다.
 * 각 항목의 `effect` 는 켰을 때 화면에서 실제로 바뀌는 것을 적은 것이며,
 * 바뀌지 않는 항목은 만들지 않는다(선언만 하는 토글 금지). */
interface A11y {
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

const A11Y_DEFAULT: A11y = {
  largeText: true, highContrast: false, simpleSteps: true, visualGuidance: false,
  hearingSupport: false, mobilitySupport: false, staffAssistancePreferred: false,
  preferredInput: "TOUCH",
};

const A11Y_ITEMS: { key: keyof A11y; label: string; effect: string }[] = [
  { key: "largeText", label: "큰 글씨", effect: "글자와 버튼이 커집니다" },
  { key: "highContrast", label: "고대비", effect: "검은 배경에 밝은 글씨로 바뀝니다" },
  { key: "simpleSteps", label: "쉬운 말", effect: "설명이 짧고 쉬운 문장으로 바뀝니다" },
  { key: "visualGuidance", label: "그림 함께 보기", effect: "선택지에 그림이 함께 표시됩니다" },
  { key: "hearingSupport", label: "소리 없이 보기", effect: "모든 안내를 화면 글자로만 드립니다" },
  { key: "mobilitySupport", label: "누르기 편하게", effect: "버튼이 더 커지고 간격이 넓어집니다" },
  { key: "staffAssistancePreferred", label: "직원 도움 먼저", effect: "직원 부르기 버튼이 맨 위에 크게 나옵니다" },
];

/** 마법사와 조건 수정 화면이 공유하는 선택지 그리드 — 같은 동작은 같은 부품으로 (UI 통일성). */
function ChoiceGrid({ q, answers, setAnswers, onPicked, showIcons }: {
  q: Question;
  answers: Record<string, unknown>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  /** 단일 선택을 고른 직후 호출 — 수정 화면에서 행 자동 접기에 사용 (다중 선택은 호출 안 함) */
  onPicked?: () => void;
  /** 그림 함께 보기 — 아이콘만 두지 않고 반드시 글자를 병기한다 */
  showIcons?: boolean;
}) {
  return (
    <div className="choices" role="group" aria-label={q.title}>
      {q.options.map((o) => {
        const cur = answers[q.key];
        const pressed = q.multi
          ? Array.isArray(cur) && (cur as unknown[]).includes(o.value)
          : cur === o.value;
        return (
          <button key={String(o.value)} type="button" className="choice" aria-pressed={pressed}
            onClick={() => {
              setAnswers((prev) => {
                if (!q.multi) return { ...prev, [q.key]: o.value };
                const list = new Set((prev[q.key] as unknown[]) ?? []);
                if (list.has(o.value)) list.delete(o.value); else list.add(o.value);
                if (o.value === "없음" && list.has("없음")) return { ...prev, [q.key]: ["없음"] };
                list.delete("없음");
                return { ...prev, [q.key]: [...list] };
              });
              if (!q.multi) onPicked?.();
            }}>
            {showIcons && o.icon && <span className="ico" aria-hidden="true">{o.icon}</span>}
            {o.label}{o.sub && <small>{o.sub}</small>}
          </button>
        );
      })}
    </div>
  );
}

const EDIT_LABELS: Record<string, string> = {
  serviceType: "이용 방식", spicyLevel: "맵기", boneType: "형태",
  quantity: "수량", cupOption: "컵", allergies: "알레르기", budgetKrw: "예산",
};
/** 요약 행에 보여줄 현재 값 (답변은 이미 한국어 라벨/숫자로 저장돼 있다) */
function answerLabel(key: string, v: unknown): string {
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

/* 기기 저장.
 *
 * 요구사항은 "무엇을 저장하라"가 아니라 "사용자가 통제하게 하라"다 (guide.txt 5번):
 *   저장 여부를 사용자가 선택 · 저장된 내용 확인 · 수정 · 삭제 ·
 *   공용기기 자동저장 방지 · 자동으로 불러온 정보의 재확인
 *
 * 저장 대상을 우리가 정하지 않는다. 같은 안내문이 "이전 이용 내역을 반영한 추천"과
 * "자주 이용하는 메뉴 저장"을 명시적으로 허용하므로, 범위까지 사용자가 고르게 한다.
 *   ALL     — 이번 답변 전부 (다음에 같은 주문을 빠르게)
 *   LASTING — 오래 쓰는 것만: 알레르기·맛 선호·화면 설정 (공용기기·가끔 이용)
 * 기본값은 "저장 안 함"이며, 켤 때 범위를 함께 고른다. */
const STORAGE_KEY = "kb23c-saved-settings-v4";
/** v3 저장본을 버리지 않는다 — 형식이 바뀌었다고 사용자 설정이 사라지면 안 된다. */
const LEGACY_KEY = "kb23c-saved-settings-v3";
const LASTING_KEYS = ["allergies", "spicyLevel", "boneType"] as const;

/** 화면에서 쓰는 저장본 — core 형식에 UI 의 A11y 타입을 입힌 것 */
interface SavedSettings extends Omit<CoreSaved, "a11y"> {
  a11y: A11y;
}
const pickByScope = (answers: Record<string, unknown>, scope: SaveScope): Record<string, unknown> => {
  if (scope === "ALL") return { ...answers };
  const out: Record<string, unknown> = {};
  for (const k of LASTING_KEYS) if (answers[k] !== undefined) out[k] = answers[k];
  return out;
};
/** 해석은 core/saved.ts 가 한다 — localStorage 는 무엇이든 들어올 수 있는 입구다. */
const readSaved = (key: string): SavedSettings | null => {
  try {
    const s = localStorage.getItem(key);
    if (!s) return null;
    const m = migrateSaved(JSON.parse(s));
    return m ? { ...m, a11y: { ...A11Y_DEFAULT, ...(m.a11y as Partial<A11y>) } } : null;
  } catch { return null; }
};

const loadSaved = (): SavedSettings | null => {
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

function savedSummary(s: SavedSettings): string {
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
function buildRawInput(
  answers: Record<string, unknown>, a11y: A11y,
  fromSaved: boolean, storeProfile: boolean,
): RawUserInput {
  const a = { ...answers };
  const allergies = (a.allergies as (string | number)[] | undefined)?.filter((x) => x !== "없음") ?? [];
  return {
    /* "상관없어요"를 지우지 않고 그대로 넘긴다 — normalize 가 NO_PREFERENCE 로 정규화한다.
     * 누락(안 물어봄)과 NO_PREFERENCE(물었고 양보 가능)는 서로 다른 상태이고,
     * 조기 종료 게이트가 그 둘을 구분해야 한다 (core/ask.ts preferenceAxisAsked).
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

interface Question {
  key: string;
  title: string;
  hint?: string;
  multi?: boolean;
  options: { value: string | number; label: string; sub?: string; icon?: string }[];
}

/* 질문 순서 = 화면목록 S06~S10 (알레르기 → 맵기 → 뼈 → 포장 → 수량), 그 뒤 컵·예산.
 *
 * 알레르기가 맨 앞인 것은 편의가 아니라 **안전 요건**이다. 조기 종료(core/ask.ts)가 붙은
 * 뒤로는, 알레르기를 뒤에 두면 신뢰도가 먼저 차오를 때 그 질문에 도달하기 전에 추천이
 * 확정될 수 있다. 그러면 allergenIds 가 UNKNOWN 이 아니라 미수집이 되어 안전 정지도 안 걸린 채
 * 알레르기 제외만 사라진다. ask.ts 의 게이트가 1차 방어선이고, 이 순서가 2차 방어선이다. */
const QUESTIONS: Question[] = [
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

/* ───────────────────────── 시연 프리셋 ─────────────────────────
 * 주의: 이것은 "화면 하드코딩"이 아니다. 버튼은 **입력만** 채우고,
 * 추천은 다른 경로와 똑같이 같은 엔진이 계산한다. 결과를 미리 정해두지 않는다. */
interface Preset {
  id: string;
  title: string;
  shows: string;
  answers: Record<string, unknown>;
  a11y?: Partial<A11y>;
  /** 시간대 시연용 고정 시각 (미지정이면 지금 시각) */
  hour?: number;
}
const PRESETS: Preset[] = [
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

export function App() {
  const [step, setStep] = useState<Step>("start");
  const [a11y, setA11y] = useState<A11y>(A11Y_DEFAULT);
  const [fixture, setFixture] = useState<PublicFixture | null>(null);
  const [live, setLive] = useState(true);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [uiRec, setUiRec] = useState<UiRecommendation | null>(null);
  const [manual, setManual] = useState(false);
  const [sessionInput, setSessionInput] = useState("");
  const [runLog, setRunLog] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  /** 실행에 쓴 제출물 원본 — 오류 주입은 이것을 새 세션에 다시 올려 재실행한다 */
  const [submitted, setSubmitted] = useState<ParticipantSubmission | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [errResults, setErrResults] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<SavedSettings | null>(null);
  const [fromSaved, setFromSaved] = useState(false);
  const [storeToggle, setStoreToggle] = useState(false); // "이번 한 번만"이 기본값 — 저장은 명시적 선택
  const [saveScope, setSaveScope] = useState<SaveScope>("ALL"); // 무엇을 저장할지는 사용자가 고른다
  const [editOpen, setEditOpen] = useState<string | null>(null); // 조건 수정 화면에서 펼쳐진 행 (한 번에 하나)
  /** 저장본에서 불러온 항목의 key — 마법사에서 건너뛰고, 무엇이 불러와졌는지 화면에 밝힌다 */
  const [carried, setCarried] = useState<string[]>([]);
  const [demoHour, setDemoHour] = useState<number | null>(null); // 프리셋의 시간대 시연용
  /** 조기 종료로 여쭤보지 않은 질문 key — 추천 화면에서 무엇을 안 물었는지 밝힌다 */
  const [skipped, setSkipped] = useState<string[]>([]);
  /** 확정되지 않은 추천을 몇 번 만났는가 — 2회째면 안전 중단(S12) */
  const [reconfirmCount, setReconfirmCount] = useState(0);
  /** 링크로 넘어온 주문 계획 — fixture 가 준비되면 이어받는다 */
  const [incoming, setIncoming] = useState<PlanLinkPayload | null>(null);
  /** 이번 흐름이 다른 기기에서 넘어온 것인가 — 화면에 밝히고 재확인을 받는다 */
  const [handedOff, setHandedOff] = useState(false);
  /** 다른 기기로 넘기기 링크 (확인 화면에서 생성) */
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  /** S02 화면 맞춤 문답 — null 이면 안 하는 중, 0~2 는 지금 보여주는 크기 단계 */
  const [probeStep, setProbeStep] = useState<number | null>(null);
  /** 문답으로 정해진 단계 — 결과를 화면에 밝혀 준다 */
  const [probeResult, setProbeResult] = useState<number | null>(null);
  /** 계산 화면(S11) 타이머 — 화면을 벗어나면 남은 전환이 덮어쓰지 않게 관리한다 */
  const calcTimer = useRef<number | null>(null);
  useEffect(() => () => { if (calcTimer.current !== null) window.clearTimeout(calcTimer.current); }, []);

  useEffect(() => {
    fetchFixture().then((r) => { setFixture(r.fixture); setLive(r.live); });
    setSaved(loadSaved());
    // 화면목록 S04 — 다른 기기에서 넘어온 주문 계획. 깨진 링크는 decodePlanLink 가 null 로 흡수한다.
    const code = new URLSearchParams(window.location.search).get("plan");
    if (code) setIncoming(decodePlanLink(code));
  }, []);

  /** 프리셋이 시각을 지정했으면 그 시각으로, 아니면 지금으로 계산한다. */
  const now = useMemo(() => {
    if (demoHour === null) return new Date();
    const d = new Date();
    d.setHours(demoHour, 0, 0, 0);
    return d;
  }, [demoHour]);

  const simple = a11y.simpleSteps;
  const t = (short: string, long: string) => (simple ? short : long);

  const rawInput = useMemo<RawUserInput>(
    () => buildRawInput(answers, a11y, fromSaved, storeToggle),
    [answers, a11y, fromSaved, storeToggle],
  );

  const setFlag = (k: keyof A11y, v: A11y[keyof A11y]) => setA11y((s) => ({ ...s, [k]: v }));

  const resetRun = () => { setOutcome(null); setSubmitted(null); setRunError(null); setErrResults({}); };

  const startWizard = () => {
    setAnswers({}); setQIndex(0); setManual(false); setFromSaved(false); setCarried([]);
    setStoreToggle(false); setDemoHour(null); setSkipped([]); setReconfirmCount(0);
    setHandedOff(false); setShareUrl(null);
    resetRun(); setStep("wizard");
  };

  /** 아직 답하지 않은 질문 — 조기 종료 시 "여쭤보지 않은 항목"으로 알린다. */
  const unansweredIn = (a: Record<string, unknown>): string[] =>
    QUESTIONS.filter((q) => a[q.key] === undefined).map((q) => q.key);

  /**
   * 추천 화면으로 — 모든 경로(마법사 종료·조기 종료·조건 수정·시연 프리셋)가 여기를 지난다.
   * 미확정 추천이 반복되면 여기서 안전 중단으로 보낸다(화면목록 S12).
   */
  const goRecommend = (u: UiRecommendation, skippedKeys: string[], priorAttempts = reconfirmCount) => {
    // priorAttempts 를 인자로 받는 이유: 새 흐름을 시작하는 경로(시연 프리셋·저장본 시작)는
    // setReconfirmCount(0) 을 호출해도 이 렌더의 클로저에는 옛 값이 잡혀 있다. 0 을 명시해 넘긴다.
    const attempts = isUnresolved(u.rec) ? priorAttempts + 1 : 0;
    setReconfirmCount(attempts);
    setSkipped(skippedKeys);
    setUiRec(u);
    setManual(false);

    /* 화면목록 S11 — "고객님께 어울리는 메뉴를 찾고 있어요". 결과는 이미 계산돼 있고
       화면만 거친다. 계산을 기다리는 척하는 게 아니라, 답이 반영됐다는 것을 알리는 단계다. */
    const dest: Step = shouldSafetyStop(u.rec, attempts) ? "stopped" : "recommend";
    if (calcTimer.current !== null) window.clearTimeout(calcTimer.current);
    if (prefersReducedMotion()) { setStep(dest); return; }
    setStep("calculating");
    calcTimer.current = window.setTimeout(() => {
      calcTimer.current = null;
      // 그 사이 사용자가 직원 도움 등으로 벗어났으면 덮어쓰지 않는다
      setStep((s) => (s === "calculating" ? dest : s));
    }, CALC_MS);
  };

  const finishWizard = () => {
    if (!fixture) return;
    goRecommend(computeRecommendation(rawInput, fixture, now), unansweredIn(answers));
  };

  /** 저장본에서 불러온 항목은 마법사에서 건너뛴다 — 저장해 놓고 또 묻지 않는다. */
  const nextToAsk = (from: number, skip: string[] = carried): number => {
    for (let i = from; i < QUESTIONS.length; i++) if (!skip.includes(QUESTIONS[i].key)) return i;
    return QUESTIONS.length;
  };
  const askIdx = QUESTIONS.map((_, i) => i).filter((i) => !carried.includes(QUESTIONS[i].key));
  const askTotal = askIdx.length;
  const askPos = Math.max(0, askIdx.indexOf(qIndex));

  /**
   * 답변 확정 후 다음 단계 — 화면목록 포인트 2 «매 질문에 답변할 때마다 적합도 계산 →
   * 불필요한 질문에 답변하지 않아도 빠르게 최종 결정 추천».
   *
   * 종료 판정은 core/ask.ts 가 한다. 여기서 confidence 를 직접 비교하지 않는 이유는,
   * 알레르기 선행 같은 계약 조건이 UI 조건문에 묻히면 테스트가 지킬 수 없기 때문이다.
   */
  const advance = () => {
    const n = nextToAsk(qIndex + 1);
    if (n >= QUESTIONS.length) { finishWizard(); return; }
    if (!fixture) return;
    const u = computeRecommendation(rawInput, fixture, now);
    if (canStopAsking(u.rec, u.engineCtx)) { goRecommend(u, unansweredIn(answers)); return; }
    setQIndex(n);
  };

  /** 저장된 설정으로 시작 — 배너에서 내용을 보여준 뒤의 클릭이므로 '확인받은 자동 불러오기'다.
   *  지속값은 채워진 채로 건너뛰고, 이번 이용 값(이용방식·수량·예산·컵)만 묻는다. */
  const startFromSaved = () => {
    if (!fixture || !saved) return;
    const next = { ...saved.answers };
    setAnswers(next);
    setA11y(saved.a11y);
    setCarried(QUESTIONS.map((q) => q.key).filter((k) => next[k] !== undefined));
    setFromSaved(true); setStoreToggle(true); setSaveScope(saved.scope);
    setManual(false); setDemoHour(null); setSkipped([]); resetRun();
    const loaded = QUESTIONS.map((qq) => qq.key).filter((k) => next[k] !== undefined);
    const start = nextToAsk(0, loaded);
    if (start >= QUESTIONS.length) {
      goRecommend(
        computeRecommendation(buildRawInput(next, saved.a11y, true, true), fixture, new Date()),
        unansweredIn(next),
        0, // 저장본으로 시작하는 것도 새 흐름이다
      );
      return;
    }
    setQIndex(start);
    setStep("wizard");
  };

  /**
   * 화면목록 S05 «지난번처럼 준비할까요?» — 한 번 눌러 지난 주문을 되살린다.
   *
   * 되살린 뒤에도 **추천 확인 화면부터** 시작한다. 곧바로 실행으로 보내면 사용자의 명시적
   * 확인 없이 실행계획이 만들어져 ACTIONS_WITHOUT_APPROVAL 이 된다. 빠르게 하는 것이지
   * 확인을 건너뛰는 것이 아니다.
   */
  const repeatLastOrder = () => {
    if (!fixture || !saved?.lastOrder) return;
    const next = { ...saved.lastOrder.answers };
    setAnswers(next); setA11y(saved.a11y); setCarried(Object.keys(next));
    setFromSaved(true); setStoreToggle(true); setSaveScope(saved.scope);
    setManual(false); setDemoHour(null); resetRun();
    goRecommend(
      computeRecommendation(buildRawInput(next, saved.a11y, true, true), fixture, new Date()),
      unansweredIn(next),
      0,
    );
  };

  const applyPreset = (p: Preset) => {
    if (!fixture) return;
    const nextA11y = { ...A11Y_DEFAULT, ...(p.a11y ?? {}) };
    const nextHour = p.hour ?? null;
    const d = new Date();
    if (nextHour !== null) d.setHours(nextHour, 0, 0, 0);
    setAnswers(p.answers); setA11y(nextA11y); setDemoHour(nextHour);
    setFromSaved(false); setStoreToggle(false); setManual(false); resetRun();
    goRecommend(
      computeRecommendation(buildRawInput(p.answers, nextA11y, false, false), fixture, nextHour === null ? new Date() : d),
      unansweredIn(p.answers),
      0, // 시연 프리셋은 새 흐름이다 — 이전 시도 횟수를 물려받지 않는다
    );
  };

  const deleteSaved = () => { try { localStorage.removeItem(STORAGE_KEY); } catch { /* 무시 */ } setSaved(null); };

  /** 추천 화면 → 조건 수정: 재확인 사유(알레르기)가 있으면 그 행을 바로 열어 준다 */
  const openEdit = () => {
    setEditOpen(uiRec?.rec.requiresReconfirmation ? "allergies" : null);
    setStep("edit");
  };

  const applyEditAndRecommend = () => {
    if (!fixture) return;
    if (storeToggle) persist();
    // 고쳐서 다시 받는 경로 — 여기서도 미확정이면 시도 횟수가 올라가고, 2회째면 안전 중단이다
    goRecommend(
      computeRecommendation(buildRawInput(answers, a11y, fromSaved, storeToggle), fixture, now),
      unansweredIn(answers),
    );
  };

  /** 저장. lastOrder 를 새로 주지 않으면 이미 저장돼 있던 지난 주문을 그대로 둔다. */
  const persist = (lastOrder?: LastOrder) => {
    const keep = lastOrder ?? saved?.lastOrder;
    const s: SavedSettings = {
      v: SAVED_VERSION,
      answers: pickByScope(answers, saveScope), a11y, scope: saveScope, savedAt: new Date().toISOString(),
      ...(keep ? { lastOrder: keep } : {}),
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); setSaved(s); } catch { /* 저장 불가 환경이면 조용히 건너뜀 */ }
  };

  /**
   * 확정한 주문을 «지난번처럼»의 근거로 남긴다 (화면목록 S05).
   * 저장을 켠 경우에만 기록한다 — 저장 여부는 끝까지 사용자가 정한다.
   */
  const rememberOrder = () => {
    const id = uiRec?.rec.recommendedCandidateId;
    if (!storeToggle || !id) return;
    persist({ candidateId: id, answers: { ...answers }, savedAt: new Date().toISOString() });
  };

  /** 토글 = 즉시 반영: 켜는 순간 저장되고, 끄면 저장본이 삭제된다 (사용자 기대와 일치). */
  /** 저장 범위 변경 — 켜져 있으면 즉시 다시 저장한다(사용자 기대와 일치). */
  const changeScope = (next: SaveScope) => {
    setSaveScope(next);
    if (!storeToggle) return;
    const rec: SavedSettings = {
      v: SAVED_VERSION,
      answers: pickByScope(answers, next), a11y, scope: next, savedAt: new Date().toISOString(),
      ...(saved?.lastOrder ? { lastOrder: saved.lastOrder } : {}),
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rec)); setSaved(rec); } catch { /* 무시 */ }
  };

  const toggleStore = () => {
    const next = !storeToggle;
    setStoreToggle(next);
    if (next) persist();
    else { try { localStorage.removeItem(STORAGE_KEY); } catch { /* 무시 */ } setSaved(null); }
    if (uiRec) setUiRec({ ...uiRec, raw: { ...uiRec.raw, storeProfile: next } }); // retentionPolicy에 반영
  };

  const runSimulation = async () => {
    if (!fixture || !uiRec) return;
    rememberOrder(); // 확정한 주문을 "지난번처럼"의 근거로 남긴다 (저장을 켠 경우만)
    setStep("run"); setRunLog([]); setRunError(null); setSubmitted(null); setErrResults({});
    try {
      const submission = buildUiSubmission(uiRec, fixture, true, manual);
      const r = await runOnSimulator(submission, sessionInput || undefined, (label) => setRunLog((l) => [...l, label]));
      setSubmitted(submission);
      setOutcome(r);
      setStep("result");
    } catch (e) {
      setRunError(String((e as Error)?.message ?? e));
      setStep("result");
    }
  };

  /**
   * 링크로 넘어온 계획 이어받기 (화면목록 S04).
   *
   * 이어받아도 **확인 화면부터** 시작한다 — 링크만으로 실행계획이 만들어지면 사용자의
   * 명시적 확인 없이 승인된 셈이 된다. 넘어온 값이라는 사실도 화면에 밝히고,
   * 입력 출처는 IMPORTED 로 기록한다(자동으로 불러온 정보의 재확인).
   */
  useEffect(() => {
    if (!fixture || !incoming) return;
    const next = { ...incoming.answers };
    const nextA11y: A11y = { ...A11Y_DEFAULT, ...(incoming.a11y as Partial<A11y>) };
    setAnswers(next); setA11y(nextA11y); setCarried(Object.keys(next));
    setFromSaved(true); setHandedOff(true); setManual(false); setStoreToggle(false);
    goRecommend(
      computeRecommendation(buildRawInput(next, nextA11y, true, false), fixture, new Date()),
      unansweredIn(next),
      0,
    );
    setIncoming(null);
    // 주소창에서 지운다 — 새로고침할 때마다 다시 이어받지 않게
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture, incoming]);

  const lastOrder = saved?.lastOrder;
  const q = QUESTIONS[qIndex];
  const answered = q ? answers[q.key] !== undefined : false;
  const ev = outcome?.evidence as (Evidence & Record<string, unknown>) | undefined;
  const slotNow = TIME_SLOT_KO[timeSlotOf(now)];

  /** 직원 도움 — 어느 화면에서든 나올 수 있게. 설정에 따라 위치·크기가 달라진다. */
  const staffBtn = (cls = "btn ghost") => (
    <button type="button" className={cls} onClick={() => setStep("staff")}>직원 도움</button>
  );

  return (
    <div className={[
      "app",
      a11y.largeText ? "large" : "",
      a11y.highContrast ? "contrast" : "",
      a11y.mobilitySupport ? "roomy" : "",
      a11y.visualGuidance ? "icons" : "",
    ].join(" ").trim()}>
      <div className="shell">
        <header className="topbar">
          <h1>주문 도우미 <span className="simbadge">시뮬레이션 — 실제 주문·결제 없음</span></h1>
          <div className="a11y" role="group" aria-label="화면 설정">
            <button type="button" className="toggle" aria-pressed={a11y.largeText} onClick={() => setFlag("largeText", !a11y.largeText)}>큰 글씨</button>
            <button type="button" className="toggle" aria-pressed={a11y.highContrast} onClick={() => setFlag("highContrast", !a11y.highContrast)}>고대비</button>
            <button type="button" className="toggle" onClick={() => setStep("a11y")}>설정 더보기</button>
          </div>
        </header>
        <div aria-live="polite" className="srline">{step === "run" ? runLog[runLog.length - 1] : ""}</div>

        {a11y.staffAssistancePreferred && step !== "staff" && (
          <div className="staffbar">
            <span>도움이 필요하시면 언제든 눌러 주세요.</span>
            {staffBtn("btn primary")}
          </div>
        )}

        {a11y.hearingSupport && step === "start" && (
          <div className="banner ok" role="note">
            이 서비스는 <b>소리 안내를 사용하지 않습니다.</b> 모든 안내가 화면 글자로 표시되므로 놓치는 내용이 없습니다.
          </div>
        )}

        {step === "start" && (
          <>
            {/* 화면목록 S05 — 지난 주문이 있으면 한 번에 되살릴 수 있게 한다.
                되살려도 확인 화면부터 시작한다(승인 없는 실행계획 생성 금지). */}
            {lastOrder && fixture && (
              <section className="card" style={{ borderColor: "var(--brand)", borderWidth: 2 }} aria-label="지난 주문">
                <h2>지난번처럼 준비할까요?</h2>
                <p className="hint" style={{ fontSize: "1em", color: "var(--fg)" }}>
                  {candidateName(fixture, lastOrder.candidateId)}
                  {QUESTIONS.filter((qq) => lastOrder.answers[qq.key] !== undefined)
                    .map((qq) => ` · ${EDIT_LABELS[qq.key] ?? qq.key} ${answerLabel(qq.key, lastOrder.answers[qq.key])}`)
                    .join("")}
                </p>
                <p className="hint">바로 실행하지 않습니다 — 고르시면 <b>확인 화면부터</b> 보여드립니다.</p>
                <div className="btnrow">
                  <button type="button" className="btn primary" onClick={repeatLastOrder}>네, 그렇게 해주세요</button>
                  <button type="button" className="btn ghost" onClick={startWizard}>아니요, 새로 고를래요</button>
                  {staffBtn()}
                </div>
              </section>
            )}

            {saved && (
              <section className="card" style={{ borderColor: "var(--brand)", borderWidth: 2 }} aria-label="저장된 설정">
                <h2>지난번 설정을 이 기기에서 찾았어요</h2>
                <p className="hint" style={{ fontSize: "1em", color: "var(--fg)" }}>{savedSummary(saved)}</p>
                <p className="hint">
                  자동으로 적용하지 않습니다 — 내용을 확인하시고 골라 주세요.
                  {saved.scope === "ALL"
                    ? " 저장해 두신 항목은 다시 여쭤보지 않고 바로 추천으로 넘어갑니다."
                    : " 저장 범위를 '오래 쓰는 것만'으로 두셔서, 수량·예산 같은 이번 이용 정보만 다시 여쭤봅니다."}
                </p>
                <div className="btnrow">
                  {/* 화면목록 S01 case2 의 용어를 그대로 쓴다 */}
                  <button type="button" className="btn primary" onClick={startFromSaved} disabled={!fixture}>프로필 다시 사용</button>
                  <button type="button" className="btn ghost" onClick={startWizard} disabled={!fixture}>새롭게 만들기</button>
                  <button type="button" className="btn danger" onClick={deleteSaved}>저장된 설정 지우기</button>
                </div>
              </section>
            )}
            <section className="card">
              <h2>닭강정 가게 주문을 도와드릴게요</h2>
              <p className="hint">
                {t(
                  "로그인이 없습니다. 답해 주신 내용은 이번 한 번만 쓰고 저장하지 않습니다. 추천 뒤에 확인을 거치고, 결제 직전에 멈춥니다.",
                  "로그인 없이 바로 시작합니다. 답해 주신 내용은 이번 한 번만 사용하고 저장하지 않는 것이 기본이며, 원하시면 마지막 확인 단계에서 이 기기에 저장을 선택할 수 있습니다. 추천 뒤에는 반드시 확인을 거치며, 결제 직전(장바구니 확인)에서 멈춥니다.",
                )}
              </p>
              <div className="btnrow">
                <button type="button" className="btn primary" onClick={startWizard} disabled={!fixture}>{saved ? "새로 입력해 시작하기" : "이번 한 번만 시작하기"}</button>
                <button type="button" className="btn ghost" onClick={() => setStep("a11y")}>화면·안내 설정</button>
                {staffBtn()}
              </div>
            </section>

            <section className="card presets" aria-label="시연 사례">
              <h2>시연 사례로 바로 보기</h2>
              <p className="hint">
                아래 버튼은 <b>입력만 채웁니다.</b> 추천은 직접 입력했을 때와 똑같은 엔진이 그 자리에서 계산합니다 —
                미리 만들어 둔 결과 화면이 아닙니다.
              </p>
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className="presetrow" onClick={() => applyPreset(p)} disabled={!fixture}>
                  <span className="ptitle">{p.title}</span>
                  <span className="pshows">{p.shows}</span>
                </button>
              ))}
            </section>
          </>
        )}

        {step === "a11y" && (
          <section className="card" aria-label="화면과 안내 설정">
            <h2>화면과 안내를 맞춰 드릴게요</h2>
            <p className="hint">켜면 이 화면이 바로 바뀝니다. 언제든 다시 끌 수 있습니다.</p>

            {/* 화면목록 S02 — 설정 이름 대신 실제 크기로 렌더한 문장을 보고 답하게 한다 */}
            {probeStep === null ? (
              <div className="btnrow" style={{ marginBottom: 18 }}>
                <button type="button" className="btn ghost" onClick={() => { setProbeStep(0); setProbeResult(null); }}>
                  화면 글씨 맞춰보기
                </button>
                {probeResult !== null && (
                  <span className="hint">
                    {probeResult === 0 && "기본 크기로 두었습니다."}
                    {probeResult === 1 && "큰 글씨를 켰습니다."}
                    {probeResult === 2 && "큰 글씨·고대비·그림 안내를 켰습니다."}
                    {" "}아래에서 언제든 바꾸실 수 있습니다.
                  </span>
                )}
              </div>
            ) : (
              <div className="card" style={{ marginBottom: 18 }} aria-labelledby="probehead">
                <h2 id="probehead">화면 글씨가 잘 보이시나요?</h2>
                <p aria-hidden="true" style={{ fontSize: PROBE_SIZES[probeStep], fontWeight: 700, margin: "18px 0" }}>
                  {PROBE_SAMPLE}
                </p>
                <p className="hint">위 문장이 편하게 읽히시면 «잘 보여요»를 눌러 주세요.</p>
                <div className="choices" role="group" aria-label="글씨 크기 확인">
                  <button type="button" className="choice" onClick={() => {
                    setA11y((s) => ({ ...s, ...PROBE_RESULT[probeStep] }));
                    setProbeResult(probeStep); setProbeStep(null);
                  }}>잘 보여요</button>
                  <button type="button" className="choice" onClick={() => {
                    if (probeStep < PROBE_SIZES.length - 1) { setProbeStep(probeStep + 1); return; }
                    const last = PROBE_SIZES.length - 1;
                    setA11y((s) => ({ ...s, ...PROBE_RESULT[last] }));
                    setProbeResult(last); setProbeStep(null);
                  }}>조금 작아요</button>
                </div>
              </div>
            )}

            <div className="a11ylist">
              {A11Y_ITEMS.map((it) => (
                <button key={it.key} type="button" className="a11yrow" aria-pressed={a11y[it.key] === true}
                  onClick={() => setFlag(it.key, !(a11y[it.key] as boolean))}>
                  <span className="alabel">{it.label}</span>
                  <span className="aeffect">{it.effect}</span>
                  <span className="astate">{a11y[it.key] ? "켬" : "끔"}</span>
                </button>
              ))}
            </div>

            <h2 style={{ marginTop: 22 }}>어떻게 입력하시겠어요?</h2>
            <div className="choices" role="group" aria-label="입력 방식">
              <button type="button" className="choice" aria-pressed={a11y.preferredInput === "TOUCH"}
                onClick={() => setFlag("preferredInput", "TOUCH")}>직접 누르기</button>
              <button type="button" className="choice" aria-pressed={a11y.preferredInput === "ASSISTED"}
                onClick={() => setFlag("preferredInput", "ASSISTED")}>
                옆에서 도와주기<small>보호자·직원이 대신 눌러 주는 경우</small>
              </button>
            </div>
            <p className="hint">
              도와주기를 고르시면 입력 출처를 <b>대리 입력</b>으로 기록합니다. 본인 확인을 대신하지는 않습니다.
              {" "}음성 입력은 이번 버전에 없습니다 — 없는 기능을 있다고 표시하지 않습니다.
            </p>
            <div className="btnrow">
              <button type="button" className="btn primary" onClick={() => setStep("start")}>설정 마치기</button>
            </div>
          </section>
        )}

        {step === "wizard" && q && (
          <section className="card" aria-labelledby="qtitle">
            {/* 분모를 확정으로 쓰지 않는다 — 조기 종료가 있으므로 "최대"가 정직하다 */}
            <p className="stepmeta">
              질문 {askPos + 1} / 최대 {askTotal}
              {!simple && " · 답이 충분해지면 남은 질문은 건너뜁니다"}
            </p>
            <h2 id="qtitle">{q.title}</h2>
            {q.hint && !simple && <p className="hint">{q.hint}</p>}
            {carried.includes(q.key) && (
              <p className="hint">지난번 설정에서 불러온 값입니다. 바꾸셔도 됩니다.</p>
            )}
            <ChoiceGrid q={q} answers={answers} setAnswers={setAnswers} showIcons={a11y.visualGuidance} />
            <div className="btnrow">
              <button type="button" className="btn ghost" onClick={() => (qIndex === 0 ? setStep("start") : setQIndex(qIndex - 1))}>← 이전</button>
              <button type="button" className="btn primary" disabled={!answered} onClick={advance}>
                {nextToAsk(qIndex + 1) < QUESTIONS.length ? "다음 →" : "추천 보기"}
              </button>
              {staffBtn()}
            </div>

            {carried.length > 0 && (
              <div className="carried">
                <b>지난번 설정에서 {carried.length}가지를 불러왔습니다</b> — 다시 여쭤보지 않습니다.
                <ul>
                  {carried.map((k) => (
                    <li key={k}>{EDIT_LABELS[k] ?? k} <span>{answerLabel(k, answers[k])}</span></li>
                  ))}
                </ul>
                <button type="button" className="btn ghost" onClick={() => { setEditOpen(null); setStep("edit"); }}>
                  불러온 값 확인·수정
                </button>
              </div>
            )}
          </section>
        )}

        {/* 화면목록 S11 — 계산 중. 여기서도 직원 도움으로 빠져나갈 수 있어야 한다. */}
        {step === "calculating" && (
          <section className="card" aria-labelledby="calchead" aria-busy="true">
            <h2 id="calchead">{t("어울리는 메뉴를 찾고 있어요", "고객님께 어울리는 메뉴를 찾고 있어요")}</h2>
            <p className="hint">답해 주신 내용을 기준으로 후보를 좁히는 중입니다.</p>
            <ul className="reasons" aria-label="지금까지 답해 주신 내용">
              {QUESTIONS.filter((q) => answers[q.key] !== undefined).map((q) => (
                <li key={q.key}>{EDIT_LABELS[q.key] ?? q.key} — {answerLabel(q.key, answers[q.key])}</li>
              ))}
            </ul>
            <div className="btnrow">{staffBtn()}</div>
          </section>
        )}

        {step === "recommend" && uiRec && fixture && (
          <section>
            {uiRec.rec.requiresReconfirmation && (
              <div className="banner warn" role="alert">
                확실하지 않은 정보가 있어요. 임의로 판단하지 않습니다 — 알레르기 항목을 다시 확인해 주시거나, 직원 도움을 이용해 주세요.
              </div>
            )}
            {handedOff && (
              <div className="banner ok" role="note">
                다른 기기에서 넘어온 주문입니다. <b>자동으로 실행하지 않습니다</b> —
                내용을 확인하시고 진행해 주세요. 바꾸실 것이 있으면 «조건 수정»을 눌러 주세요.
              </div>
            )}
            {/* 생략은 숨기지 않는다 — 무엇을 안 물었는지, 그 값이 어디서 보이는지 함께 밝힌다 */}
            {skipped.length > 0 && (
              <div className="banner ok" role="note">
                답해 주신 내용만으로 충분해서 <b>{skipped.length}가지는 여쭤보지 않았습니다</b>
                {" "}({skipped.map((k) => EDIT_LABELS[k] ?? k).join(" · ")}).
                {" "}이 항목들이 어떻게 정해졌는지는 다음 확인 화면에서 보실 수 있습니다.
              </div>
            )}
            {uiRec.rec.recommendedCandidateId === null ? (
              <div className="card">
                <h2>조건에 맞는 메뉴가 없습니다</h2>
                <ul className="reasons">{uiRec.rec.recommendationReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                <div className="btnrow">
                  <button type="button" className="btn primary" onClick={openEdit}>조건 수정하기</button>
                  {staffBtn()}
                </div>
              </div>
            ) : (
              <>
                <div className="card recwrap">
                  <p className="stepmeta">이런 메뉴는 어떠세요?</p>
                  <h2>{candidateName(fixture, uiRec.rec.recommendedCandidateId)}
                    {" "}<span className="price">{candidatePrice(fixture, uiRec.rec.recommendedCandidateId)?.toLocaleString()}원</span></h2>
                  <ul className="reasons" aria-label="추천 이유">
                    {uiRec.rec.recommendationReasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                  {uiRec.rec.unmetConditions && uiRec.rec.unmetConditions.length > 0 && (
                    <div className="banner warn">다만: {uiRec.rec.unmetConditions.join(" · ")}</div>
                  )}
                  <div className="btnrow">
                    <button type="button" className="btn primary"
                      disabled={uiRec.rec.requiresReconfirmation}
                      onClick={() => setStep("confirm")}>네, 좋아요</button>
                    <button type="button" className="btn ghost" onClick={openEdit}>조건 수정</button>
                    <button type="button" className="btn danger" onClick={() => setStep("start")}>추천 거절</button>
                    {staffBtn()}
                  </div>
                </div>

                {uiRec.rec.alternativeCandidateIds.length > 0 && (
                  <div className="card">
                    <h2>다른 선택지도 있어요</h2>
                    {uiRec.rec.alternativeCandidateIds.map((id) => (
                      <div className="altcard" key={id}>
                        <span><b>{candidateName(fixture, id)}</b> <span className="price">{candidatePrice(fixture, id)?.toLocaleString()}원</span></span>
                        <button type="button" className="btn ghost" onClick={() => { setUiRec(withManualSelection(uiRec, fixture, id)); setManual(true); }}>이걸로 할래요</button>
                      </div>
                    ))}
                  </div>
                )}

                {uiRec.rec.excludedCandidates.length > 0 && (
                  <div className="card">
                    <h2>이런 메뉴는 제외했어요</h2>
                    {uiRec.rec.excludedCandidates.map((e) => (
                      <p className="excluded" key={e.candidateId}><b>{candidateName(fixture, e.candidateId)}</b> — {e.explanation ?? e.reasonCode}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {step === "edit" && (
          <section className="card" aria-label="조건 수정">
            <h2>바꾸실 것을 눌러 주세요</h2>
            {!simple && <p className="hint">누르면 그 자리에서 선택지가 열립니다. 다 바꾸셨으면 아래에서 추천을 다시 받아 주세요.</p>}
            {/* 메뉴 행이 붙어 화면이 길어졌다 — 도움을 화면 끝까지 내려가야 닿는 곳에 두지 않는다 */}
            <div className="btnrow" style={{ marginBottom: 4 }}>{staffBtn()}</div>

            {/* 화면목록 S14 — 메뉴 변경도 여기서 한다. 지금까지는 추천 화면의 대안 카드로만
                바꿀 수 있어서 "바꾸는 곳"이 두 군데로 갈려 있었다.
                고를 수 있는 것은 STEP 4 를 통과한 생존 후보뿐이다(scoreBreakdown) —
                알레르기·품절·예산으로 제외된 후보를 여기서 되살리지 않는다. */}
            {uiRec && fixture && uiRec.rec.recommendedCandidateId && (
              <div className="editrow">
                <button type="button" className="edithead" aria-expanded={editOpen === "__menu"}
                  onClick={() => setEditOpen(editOpen === "__menu" ? null : "__menu")}>
                  <span className="editlabel">메뉴</span>
                  <span className="editvalue">{candidateName(fixture, uiRec.rec.recommendedCandidateId)}</span>
                  <span aria-hidden="true">{editOpen === "__menu" ? "▲" : "▼"}</span>
                </button>
                {editOpen === "__menu" && (
                  <div className="editbody">
                    {!simple && <p className="hint">조건에 맞는 메뉴만 보여드립니다. 제외된 메뉴는 여기 없습니다.</p>}
                    <div className="choices" role="group" aria-label="메뉴 선택">
                      {Object.keys(uiRec.rec.scoreBreakdown ?? {}).map((id) => (
                        <button key={id} type="button" className="choice"
                          aria-pressed={id === uiRec.rec.recommendedCandidateId}
                          onClick={() => {
                            setUiRec(withManualSelection(uiRec, fixture, id));
                            setManual(true); setEditOpen(null); setStep("recommend");
                          }}>
                          {candidateName(fixture, id)}
                          <small>{candidatePrice(fixture, id)?.toLocaleString()}원</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {QUESTIONS.map((qq) => {
              const open = editOpen === qq.key;
              return (
                <div className="editrow" key={qq.key}>
                  <button type="button" className="edithead" aria-expanded={open}
                    onClick={() => setEditOpen(open ? null : qq.key)}>
                    <span className="editlabel">{EDIT_LABELS[qq.key] ?? qq.title}</span>
                    <span className="editvalue">{answerLabel(qq.key, answers[qq.key])}</span>
                    <span aria-hidden="true">{open ? "▲" : "▼"}</span>
                  </button>
                  {open && (
                    <div className="editbody">
                      {qq.hint && !simple && <p className="hint">{qq.hint}</p>}
                      <ChoiceGrid q={qq} answers={answers} setAnswers={setAnswers}
                        onPicked={() => setEditOpen(null)} showIcons={a11y.visualGuidance} />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="btnrow">
              <button type="button" className="btn primary" onClick={applyEditAndRecommend}>이 조건으로 추천 다시 받기</button>
              {staffBtn()}
            </div>
          </section>
        )}

        {step === "confirm" && uiRec && fixture && (
          <section className="card">
            <h2>마지막으로 확인해 주세요</h2>
            <dl className="summary">
              <dt>메뉴</dt><dd>{candidateName(fixture, uiRec.rec.recommendedCandidateId)}</dd>
              <dt>수량</dt><dd>{Number(uiRec.engineCtx.preferences.quantity ?? 1)}개</dd>
              <dt>이용 방식</dt><dd>{uiRec.engineCtx.preferences.serviceType === "TAKE_OUT" ? "포장" : uiRec.engineCtx.preferences.serviceType === "DINE_IN" ? "매장" : "메뉴 기본값"}</dd>
            </dl>
            <p className="total">
              합계 {((candidatePrice(fixture, uiRec.rec.recommendedCandidateId) ?? 0) * Number(uiRec.engineCtx.preferences.quantity ?? 1)).toLocaleString()}원
            </p>
            {(() => {
              // 실제로 만들어질 실행계획을 그대로 읽어 보여준다 — 화면과 계획이 어긋날 수 없다.
              // 필수 옵션은 "상관없어요"여도 하나가 정해지므로, 그 사실을 숨기지 않는다.
              const preview = buildExecutionPlanCore(
                { approved: true, decision: "APPROVE" }, uiRec.rec, fixture, uiRec.engineCtx,
              );
              const sels = explainSelections(fixture, preview, uiRec.engineCtx);
              if (sels.length === 0) return null;
              const need = sels.filter((x) => x.origin !== "USER");
              return (
                <>
                  <h3 className="selhead">키오스크에서 이렇게 선택합니다</h3>
                  <ul className="sellist">
                    {sels.map((x) => (
                      <li key={x.groupId} data-origin={x.origin}>
                        <span className="sg">{GROUP_KO[x.groupId] ?? x.groupId}</span>
                        <span className="sv">{OPTION_KO[x.id] ?? x.id}</span>
                        <span className="so">
                          {x.origin === "USER" && "고르신 대로"}
                          {/* 같은 AUTO 라도 원인이 다르다 — 조기 종료로 안 물어본 것과
                              "상관없어요"라고 답하신 것을 뭉뚱그리지 않는다. */}
                          {x.origin === "AUTO" && (skipped.includes(GROUP_TO_KEY[x.groupId] ?? "")
                            ? "여쭤보지 않아서 이 메뉴의 값으로 정했습니다"
                            : "상관없다고 하셔서 이 메뉴의 값으로 정했습니다")}
                          {x.origin === "SUBSTITUTED" &&
                            `원하신 ${OPTION_KO[x.wanted!] ?? x.wanted}는 이 메뉴에 없어 바꿨습니다`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {need.length > 0 && (
                    <div className="btnrow" style={{ marginTop: 4, marginBottom: 8 }}>
                      <button type="button" className="btn ghost" onClick={() => setStep("recommend")}>다른 메뉴 보기</button>
                      <button type="button" className="btn ghost" onClick={openEdit}>조건 바꾸기</button>
                    </div>
                  )}
                </>
              );
            })()}
            <div className="banner ok">가상 키오스크에서 장바구니 확인까지만 진행합니다. <b>실제 결제·주문은 일어나지 않습니다.</b></div>

            {/* 화면목록 S04 — 모바일에서 확정하고 매장에서는 실행만. 뒷사람 눈치(53.6%)를
                줄이는 구조가 여기서 완성된다. 서버가 없으므로 계획을 주소에 실어 넘긴다. */}
            <div className="savebox">
              <button type="button" className="btn ghost" onClick={() => {
                const code = encodePlanLink({
                  v: 1, answers, a11y: a11y as unknown as Record<string, boolean | string>,
                });
                const url = `${window.location.origin}${window.location.pathname}?plan=${code}`;
                setShareUrl(url);
                navigator.clipboard?.writeText(url).catch(() => { /* 복사 실패해도 아래에 그대로 보인다 */ });
              }}>이 주문을 매장 기기로 넘기기</button>
              {shareUrl && (
                <>
                  <p className="hint" style={{ marginTop: 10 }}>
                    아래 주소를 매장 기기에서 열면 <b>이 확인 화면부터</b> 이어집니다.
                    실행은 그 기기에서 다시 확인한 뒤에 일어납니다.
                  </p>
                  <input readOnly value={shareUrl} aria-label="넘기기 주소"
                    onFocus={(e) => e.currentTarget.select()} />
                  <p className="hint">
                    이름·전화번호 같은 개인 정보는 이 주소에 담기지 않습니다 — 메뉴·옵션·화면 설정만 들어갑니다.
                  </p>
                </>
              )}
            </div>

            <div className="savebox">
              <button type="button" className="toggle" aria-pressed={storeToggle} onClick={toggleStore}>
                이 설정을 이 기기에 저장 {storeToggle ? "— 저장됨 ✓" : "— 저장 안 함 (기본)"}
              </button>

              {storeToggle && (
                <>
                  <p className="hint" style={{ margin: "12px 0 6px" }}>무엇을 저장할까요?</p>
                  <div className="choices" role="group" aria-label="저장 범위">
                    <button type="button" className="choice" aria-pressed={saveScope === "ALL"}
                      onClick={() => changeScope("ALL")}>
                      이번 답변 전부
                      <small>다음에 같은 주문을 빠르게 하실 수 있습니다</small>
                    </button>
                    <button type="button" className="choice" aria-pressed={saveScope === "LASTING"}
                      onClick={() => changeScope("LASTING")}>
                      오래 쓰는 것만
                      <small>알레르기·맛 선호·화면 설정. 수량·예산은 매번 새로 여쭤봅니다</small>
                    </button>
                  </div>
                </>
              )}

              <p className="hint" style={{ marginTop: 10 }}>
                끄면 저장본이 즉시 삭제되며, 시작 화면에서도 지울 수 있습니다.
                공용 기기에서는 꺼 두세요. <b>서버·계정에는 아무것도 저장되지 않습니다.</b>
              </p>
            </div>
            {live ? (
              <>
                <label className="field">공식 시뮬레이터 세션에 제출하기 (선택 — 시뮬레이터 화면의 세션 ID 입력)
                  <input value={sessionInput} onChange={(e) => setSessionInput(e.target.value)} placeholder="예: SIM-20260806-003 (비우면 새 세션)" />
                </label>
                <div className="btnrow">
                  <button type="button" className="btn ghost" onClick={() => setStep("recommend")}>← 되돌아가기</button>
                  <button type="button" className="btn primary" onClick={runSimulation}>가상 키오스크에서 실행</button>
                </div>
              </>
            ) : (
              <>
                <div className="btnrow">
                  <button type="button" className="btn ghost" onClick={() => setStep("recommend")}>← 되돌아가기</button>
                  {/* 체험 모드에서도 주문은 끝까지 간다 — 계획을 만들어 보관하고 결과 화면에서 그 결말을 보여준다. */}
                  <button type="button" className="btn primary" onClick={() => {
                    if (!fixture || !uiRec) return;
                    rememberOrder();
                    setSubmitted(buildUiSubmission(uiRec, fixture, true, manual));
                    setStep("result");
                  }}>주문 확정하기</button>
                </div>
              </>
            )}
          </section>
        )}

        {step === "run" && (
          <section className="card">
            <h2>가상 키오스크에서 실행 중입니다…</h2>
            <ul className="runlog">{runLog.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </section>
        )}

        {step === "result" && (
          <section>
            <div className="card">
              {/* 체험 모드에서는 "실행 결과"가 아니라 사용자가 방금 끝낸 일의 이름을 제목으로 쓴다. */}
              <h2>{!live && !ev && !runError && !(outcome && !outcome.valid)
                ? "주문이 완성되었습니다"
                : <>실행 결과 {ev ? (String(ev.result) === "PASS" ? <span className="pass">PASS</span> : <span className="fail">{String(ev.result)}</span>) : outcome && !outcome.valid ? <span className="fail">검증 거부</span> : runError ? <span className="fail">오류</span> : null}</>}</h2>
              {runError && <div className="banner danger" role="alert">{runError}</div>}
              {outcome && !outcome.valid && (
                <div>
                  <p className="hint">공식 검증기가 제출을 거부했습니다 — 코드가 고칠 위치를 알려줍니다.</p>
                  {outcome.validationErrors.map((e, i) => <p className="excluded" key={i}><b>{e.code}</b> {e.path} — {e.message}</p>)}
                </div>
              )}
              {ev && (
                <>
                  <div className="evgrid">
                    <div className="evitem"><b>이 결과의 의미</b>형식·안전 검증 통과 (점수 아님)</div>
                    <div className="evitem"><b>정지 유형</b>{STOP_KO[String(ev.stopType)] ?? String(ev.stopType)}</div>
                    <div className="evitem"><b>장바구니 확인 화면</b>{ev.boundaryReached ? "도달함" : "도달 못 함"}</div>
                    <div className="evitem"><b>읽기 전용 확인(verify_cart)</b>{ev.requiredVerifierExecuted ? "실행함" : "실행 안 됨"}</div>
                    <div className="evitem"><b>결제 동작</b>{`계획 ${ev.plannedPaymentActionCount}건 · 실행 ${ev.executedPaymentActionCount}건 (0건이어야 통과)`}</div>
                    <div className="evitem"><b>실제 기기로 간 명령</b>{ev.actualDeviceCommandSent ? "있음(문제!)" : "없음 — 시뮬레이션만"}</div>
                  </div>
                  <p className="hint">세션 {outcome?.sessionId} — 공식 시뮬레이터 화면(<code>localhost:3000</code>)에서 같은 세션이면 가상 키오스크 재생을 볼 수 있습니다.</p>

                  {/* 두 파일은 방향이 반대다 — 이걸 구분해 주지 않으면 Evidence 를 업로드 칸에 넣게 된다.
                      공식 시뮬레이터는 submission.profile 을 옵셔널 체이닝 없이 읽으므로
                      Evidence 를 올리면 화면이 통째로 죽는다(ErrorBoundary 없음). */}
                  <div className="dlnote">
                    <b>내려받기 두 가지는 서로 다른 파일입니다.</b>
                    <span><b>주문 계획</b> = 우리가 <u>만든 것</u>(입력). 공식 시뮬레이터 업로드 칸에는 <b>이 파일</b>을 넣으세요.</span>
                    <span><b>실행 증거</b> = 서버가 <u>돌린 결과</u>(출력). 제출 자료용이며 업로드 칸에 넣으면 시뮬레이터가 멈춥니다.</span>
                  </div>
                  <div className="btnrow">
                    <button type="button" className="btn primary" onClick={() => {
                      if (submitted) downloadSubmission(submitted);
                    }} disabled={!submitted}>주문 계획(제출물) 내려받기</button>
                    <button type="button" className="btn ghost" onClick={() => {
                      const blob = new Blob([JSON.stringify(ev, null, 2)], { type: "application/json" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob); a.download = "simulation-evidence.json"; a.click();
                      URL.revokeObjectURL(a.href);
                    }}>실행 증거(Evidence) 내려받기</button>
                    <button type="button" className="btn ghost" onClick={() => setStep("start")}>처음으로</button>
                  </div>
                </>
              )}

              {/* 체험 모드(서버 없음) — 방금 만든 "이 주문"의 결말을 보여준다.
                  공식 판정(PASS)은 서버만 낼 수 있으므로 여기에는 쓰지 않는다.
                  대신 계획에서 직접 읽어낸 사실만 쓴다 — 그것만으로도 결말은 충분히 말할 수 있다. */}
              {!live && !ev && uiRec && fixture && submitted && (() => {
                const plan = summarizeOrderPlan(submitted, fixture);
                const qty = Number(uiRec.engineCtx.preferences.quantity ?? 1);
                const total = (candidatePrice(fixture, uiRec.rec.recommendedCandidateId) ?? 0) * qty;
                const excluded = uiRec.rec.excludedCandidates.length;
                return (
                  <>
                    <dl className="summary">
                      <dt>메뉴</dt><dd>{candidateName(fixture, uiRec.rec.recommendedCandidateId)}</dd>
                      <dt>수량</dt><dd>{qty}개</dd>
                      <dt>이용 방식</dt>
                      <dd>{uiRec.engineCtx.preferences.serviceType === "TAKE_OUT" ? "포장"
                        : uiRec.engineCtx.preferences.serviceType === "DINE_IN" ? "매장" : "메뉴 기본값"}</dd>
                    </dl>
                    <p className="total">합계 {total.toLocaleString()}원</p>
                    {excluded > 0 && (
                      <p className="hint">
                        고르실 수 없던 {excluded}가지는 이유를 알려드리고, 대신 고를 수 있는 것으로 안내했습니다.
                      </p>
                    )}

                    <h3 className="selhead">이 주문이 키오스크에서 가는 길</h3>
                    <div className="evgrid">
                      <div className="evitem"><b>주문 단계</b>{plan.stepCount}단계</div>
                      <div className="evitem"><b>마지막 화면</b>{plan.endsAtTitle}</div>
                      <div className="evitem"><b>결제 동작</b>{plan.paymentActionCount}건</div>
                      <div className="evitem"><b>실제 기기로 간 명령</b>{plan.deviceCommandSent ? "있음(문제!)" : "없음"}</div>
                    </div>
                    <p className="hint">
                      {plan.stopsAtReviewBoundary ? (
                        <>이 주문은 <b>결제 직전 장바구니 확인 화면에서 멈춥니다.</b>{" "}
                          {plan.includesRequiredVerifier && "담긴 내용을 읽어서 확인하는 것까지가 끝이고, "}
                          결제는 사람이 직접 하도록 남겨 둡니다.</>
                      ) : (
                        <>이 주문은 <b>{plan.endsAtTitle}</b>에서 끝납니다.</>
                      )}
                    </p>
                    <div className="btnrow">
                      <button type="button" className="btn primary" onClick={() => setStep("start")}>처음으로</button>
                      <button type="button" className="btn ghost" onClick={() => downloadSubmission(submitted)}>
                        주문 계획(JSON) 내려받기
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>

            {outcome?.valid && submitted && (
              <div className="card errpanel">
                <h2>안전 시연 — 일부러 틀려 보기</h2>
                <p className="hint">
                  같은 제출물을 <b>매번 새 세션</b>에 올려 변형 실행합니다 — 위의 정상 결과는 그대로 보존됩니다.
                  어떤 경우든 안전 엔진이 즉시 멈추는 것을 보여줍니다.
                </p>
                <div className="choices">
                  {INJECTIONS.map(({ code, label, desc }) => (
                    <button key={code} type="button" className="choice" onClick={async () => {
                      try {
                        const r = await injectError(submitted, code);
                        const e = r.evidence as (Evidence & Record<string, unknown>) | undefined;
                        setErrResults((prev) => ({
                          ...prev,
                          [code]: e
                            ? `즉시 차단됨 — ${STOP_KO[String(e.stopType)] ?? String(e.stopType)} · 결제 실행 ${e.executedPaymentActionCount}건`
                            : `제출 단계에서 거부됨 (${(r.validation?.errors ?? []).map((x) => x.code).join(", ")})`,
                        }));
                      } catch (err) {
                        setErrResults((prev) => ({ ...prev, [code]: String((err as Error).message) }));
                      }
                    }}>
                      {label}
                      <small>{desc}</small>
                      {errResults[code] ? <span className="verdict">{errResults[code]}</span> : <span className="code">{code}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 화면목록 S12 — 재확인 2회째도 확정되지 않았을 때. 정상 종료가 아니라는 것,
            그리고 아무 준비도 시작되지 않았다는 것을 분명히 말한다. */}
        {step === "stopped" && (
          <section className="card" aria-labelledby="stophead">
            <div className="banner warn" role="alert">여기서 멈췄습니다 — 정상적으로 끝난 것이 아닙니다.</div>
            <h2 id="stophead">확인이 어려워 진행을 멈췄어요</h2>
            <p className="hint" style={{ fontSize: "1em", color: "var(--fg)" }}>
              {t(
                "두 번 여쭤봤는데도 확실하지 않았습니다. 어려우시면 직원을 불러주세요.",
                "두 번 확인을 요청드렸는데도 조건이 확실해지지 않았습니다. 임의로 판단해서 진행하지 않습니다 — 어려우시면 직원을 불러주세요.",
              )}
            </p>
            <p className="hint">
              <b>주문 준비는 시작되지 않았습니다.</b> 승인 전이므로 실행 계획이 만들어지지 않았고,
              장바구니에도 아무것도 담기지 않았습니다.
            </p>
            <div className="btnrow">
              {staffBtn("btn primary")}
              <button type="button" className="btn ghost"
                onClick={() => { setReconfirmCount(0); setEditOpen("allergies"); setStep("edit"); }}>
                조건 다시 보기
              </button>
              <button type="button" className="btn ghost" onClick={() => setStep("start")}>처음으로</button>
            </div>
          </section>
        )}

        {step === "staff" && (
          <section className="card">
            <h2>직원을 불러 드릴게요</h2>
            <p className="hint">
              막히는 단계가 있으면 언제든 이 버튼으로 나올 수 있습니다 — 막다른 길을 만들지 않습니다.
              (시뮬레이션이므로 실제 호출은 일어나지 않습니다.)
            </p>
            <div className="btnrow">
              <button type="button" className="btn primary" onClick={() => setStep("start")}>처음으로 돌아가기</button>
            </div>
          </section>
        )}

        <footer className="foot">
          <span>지금 시각 기준: {slotNow}{demoHour !== null ? " (시연용 고정)" : ""}</span>
        </footer>
      </div>
    </div>
  );
}
