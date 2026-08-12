/**
 * 흐름 상태 — 화면들이 공유하는 «지금 어디까지 왔는가».
 *
 * 화면을 파일로 쪼개면 상태를 어떻게 나눠줄지가 문제가 된다. 화면마다 props 를
 * 손으로 나열하면 **화면을 하나 고칠 때마다 App.tsx 를 같이 고쳐야 하고**, 그러면
 * 네 갈래로 나눠 동시에 작업하려던 계획이 App.tsx 한 파일에서 다시 직렬화된다.
 * 그래서 상태와 조작을 한 덩어리로 만들어 context 로 내려보낸다.
 *
 * 타입을 손으로 적지 않는 것도 같은 이유다 — `Flow = ReturnType<typeof useFlowState>`
 * 이므로 여기서 값을 하나 늘리면 타입이 저절로 따라오고, 어긋날 수가 없다.
 *
 * 판단은 여전히 전부 core 가 한다. 이 파일은 core 를 부르고 결과를 담을 뿐이다.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Evidence, ParticipantSubmission, PublicFixture } from "@kiobridge/participant-sdk";
import {
  computeRecommendation, withManualSelection, buildUiSubmission, runOnSimulator,
  fetchFixture, readUrlStoreCode, type UiRecommendation, type RunOutcome,
} from "./logic";
import { shouldSafetyStop, isUnresolved } from "../../src/core/ask";
import { SAVED_VERSION } from "../../src/core/saved";
import {
  A11Y_DEFAULT, CALC_MS, QUESTIONS, STORAGE_KEY, buildRawInput, loadSaved, prefersReducedMotion,
  type A11y, type Preset, type SavedSettings, type Step,
} from "./model";

export function useFlowState() {
  /* 첫 화면 — 매장 QR 링크(?env=)로 열렸으면 홈, 아니면 연동 관문(기획 2026-08-12).
     관문은 4걸음 흐름 밖이다: QR 을 찍거나 코드를 넣으면 홈이 나온다. */
  const [step, setStep] = useState<Step>(() => (readUrlStoreCode() !== "" ? "start" : "connect"));
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
  const [editOpen, setEditOpen] = useState<string | null>(null); // 조건 수정 화면에서 펼쳐진 행 (한 번에 하나)
  /** 저장본에서 불러온 항목의 key — 마법사에서 건너뛰고, 무엇이 불러와졌는지 화면에 밝힌다 */
  const [carried, setCarried] = useState<string[]>([]);
  const [demoHour, setDemoHour] = useState<number | null>(null); // 프리셋의 시간대 시연용
  /** 확정되지 않은 추천을 몇 번 만났는가 — 2회째면 안전 중단(S12) */
  const [reconfirmCount, setReconfirmCount] = useState(0);
  /**
   * 알레르기 질문의 둘째 걸음(항목 목록)에 들어와 있는가 — 디자인 S06 기본/확장.
   *
   * 질문 자체는 하나다(QUESTIONS 7개는 그대로). 나뉘는 것은 묻는 방법뿐이라 질문
   * 번호가 아니라 별도 상태로 둔다 — qIndex 를 늘리면 «질문 7개 고정»이 8개가 되고,
   * 진행 표시·저장본 되살리기·조건 수정이 전부 어긋난다.
   */
  const [allergyOpen, setAllergyOpen] = useState(false);
  /**
   * 프로필 생성(S02)의 하위 단계 1~3. S03 의 «수정»이 어느 걸음으로 돌아갈지 정한다.
   *
   * 화면 안의 모듈 변수로 두었더니 StrictMode 에서 깨졌다 — 개발 모드는 컴포넌트를 두 번
   * 마운트하는데, 첫 마운트의 정리 코드가 값을 되돌려 두 번째 마운트가 늘 1단계를 읽었다.
   * 화면 밖에서 사는 값은 흐름 상태로 둔다.
   */
  const [profileStep, setProfileStep] = useState<1 | 2 | 3>(1);
  /**
   * 사용자가 **직접 만진** 화면 설정. 기본값으로 켜져 있는 것과 구분하기 위해서다 —
   * 제출물의 «이번 세션에 선택한 채널»은 고른 것만이어야 한다(core/submission-meta.ts).
   */
  const [touchedA11y, setTouchedA11y] = useState<string[]>([]);
  /** 계산 화면(S11) 타이머 — 화면을 벗어나면 남은 전환이 덮어쓰지 않게 관리한다 */
  const calcTimer = useRef<number | null>(null);
  useEffect(() => () => { if (calcTimer.current !== null) window.clearTimeout(calcTimer.current); }, []);

  useEffect(() => {
    fetchFixture().then((r) => { setFixture(r.fixture); setLive(r.live); });
    setSaved(loadSaved());
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

  const rawInput = useMemo(
    () => buildRawInput(answers, a11y, fromSaved, storeToggle, touchedA11y),
    [answers, a11y, fromSaved, storeToggle, touchedA11y],
  );

  const setFlag = (k: keyof A11y, v: A11y[keyof A11y]) => {
    setA11y((s) => ({ ...s, [k]: v }));
    setTouchedA11y((t) => (t.includes(k) ? t : [...t, k]));
  };

  const resetRun = () => { setOutcome(null); setSubmitted(null); setRunError(null); setErrResults({}); };

  /**
   * 질문을 처음부터 시작한다.
   *
   * **저장 의사(storeToggle)는 건드리지 않는다.** 여기 오기 직전 화면이 S03 «저장 방식»이고,
   * 사용자가 방금 답한 것을 그 다음 걸음이 지워 버리면 주문을 마쳐도 아무것도 남지 않는다.
   * 답변·진행 위치처럼 «이번 주문에 관한 것»만 비운다.
   */
  const startWizard = () => {
    setAnswers({}); setQIndex(0); setManual(false); setFromSaved(false); setCarried([]);
    setDemoHour(null); setReconfirmCount(0);
    resetRun(); setStep("wizard");
  };

  /**
   * 추천 화면으로 — 모든 경로(마법사 종료·조건 수정·저장본 시작·시연 프리셋)가 여기를 지난다.
   * 미확정 추천이 반복되면 여기서 안전 중단으로 보낸다(화면목록 S12).
   */
  const goRecommend = (
    u: UiRecommendation, priorAttempts = reconfirmCount, manualPick = false,
  ) => {
    // priorAttempts 를 인자로 받는 이유: 새 흐름을 시작하는 경로(시연 프리셋·저장본 시작)는
    // setReconfirmCount(0) 을 호출해도 이 렌더의 클로저에는 옛 값이 잡혀 있다. 0 을 명시해 넘긴다.
    const attempts = isUnresolved(u.rec) ? priorAttempts + 1 : 0;
    setReconfirmCount(attempts);
    setUiRec(u);
    setManual(manualPick);

    /* 화면목록 S11 — "고객님께 어울리는 메뉴를 찾고 있어요". 결과는 이미 계산돼 있고
       화면만 거친다. 계산을 기다리는 척하는 게 아니라, 답이 반영됐다는 것을 알리는 단계다. */
    const dest: Step = shouldSafetyStop(u.rec, attempts) ? "stopped" : "menuConfirm";
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
    goRecommend(computeRecommendation(rawInput, fixture, now));
  };

  /** 저장본에서 불러온 항목은 마법사에서 건너뛴다 — 저장해 놓고 또 묻지 않는다. */
  const nextToAsk = (from: number, skip: string[] = carried): number => {
    for (let i = from; i < QUESTIONS.length; i++) if (!skip.includes(QUESTIONS[i].key)) return i;
    return QUESTIONS.length;
  };
  const askIdx = QUESTIONS.map((_, i) => i).filter((i) => !carried.includes(QUESTIONS[i].key));
  const askTotal = askIdx.length;
  const askPos = Math.max(0, askIdx.indexOf(qIndex));

  /** 답변 확정 후 다음 질문으로. 질문은 7개 고정이므로 시스템이 먼저 끝내지 않는다. */
  const advance = () => {
    setAllergyOpen(false);   // 다음 질문으로 갈 때 알레르기는 늘 «있으신가요?»부터 다시
    const n = nextToAsk(qIndex + 1);
    if (n >= QUESTIONS.length) { finishWizard(); return; }
    setQIndex(n);
  };

  /** 저장된 설정으로 시작 — 배너에서 내용을 보여준 뒤의 클릭이므로 '확인받은 자동 불러오기'다. */
  const startFromSaved = () => {
    if (!fixture || !saved) return;
    const next = { ...saved.answers };
    setAnswers(next);
    setA11y(saved.a11y);
    setCarried(QUESTIONS.map((q) => q.key).filter((k) => next[k] !== undefined));
    setFromSaved(true); setStoreToggle(true);
    setManual(false); setDemoHour(null); resetRun();
    const loaded = QUESTIONS.map((qq) => qq.key).filter((k) => next[k] !== undefined);
    const start = nextToAsk(0, loaded);
    if (start >= QUESTIONS.length) {
      // 저장본에 7문항이 다 있어 더 여쭤볼 것이 없다 = 지난번 주문을 그대로 되살리는 경우다
      const u = computeRecommendation(buildRawInput(next, saved.a11y, true, true, touchedA11y), fixture, new Date());
      /* 지난번에 직접 고른 메뉴를 되살린다.
       * 답변만 재현하면 엔진이 다시 1위를 뽑으므로, 대안을 골랐던 경우 지난번과 달라진다.
       * 되살리는 대상은 scoreBreakdown 에 남은 **생존 후보뿐**이다 — 그 사이 품절되었거나
       * 알레르기를 새로 등록해 제외된 메뉴는 여기서 되살아나지 않는다. */
      const wanted = saved.lastCandidateId;
      const pinned = !!wanted
        && Object.keys(u.rec.scoreBreakdown ?? {}).includes(wanted)
        && u.rec.recommendedCandidateId !== wanted;
      goRecommend(
        pinned ? withManualSelection(u, fixture, wanted) : u,
        0, // 저장본으로 시작하는 것도 새 흐름이다
        pinned,
      );
      return;
    }
    setQIndex(start);
    setStep("wizard");
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
      0, // 시연 프리셋은 새 흐름이다 — 이전 시도 횟수를 물려받지 않는다
    );
  };

  /**
   * 저장본을 지운다.
   *
   * 지우기 직전에 되묻는다(홈의 «네, 지우고 새로 시작할게요»). 한때는 지운 **뒤**에도
   * «지웠습니다»를 한 줄 띄웠는데, 되묻기에서 이미 «되돌릴 수 없습니다»를 읽고 직접
   * 누른 사람에게 같은 말을 한 번 더 하는 셈이라 걷어냈다. 확인은 일이 일어나기 전에
   * 한 번이면 된다.
   */
  const deleteSaved = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* 무시 */ }
    setSaved(null);
  };

  /** 추천 화면 → 조건 수정: 재확인 사유(알레르기)가 있으면 그 행을 바로 열어 준다 */
  const openEdit = () => {
    setEditOpen(uiRec?.rec.requiresReconfirmation ? "allergies" : null);
    setStep("edit");
  };

  /**
   * 저장. 이번 답변 전부와 화면 설정, 그리고 확정된 메뉴를 함께 남긴다.
   * 부분 저장은 없다 — 무엇을 남길지 사용자에게 또 묻지 않기로 했다(core/saved.ts 참조).
   */
  const persist = () => {
    const id = uiRec?.rec.recommendedCandidateId ?? saved?.lastCandidateId;
    /* 아직 아무것도 답하지 않았으면 **지난번 답변을 지우지 않는다.**
     *
     * 저장은 두 번 일어난다 — S03 에서 «저장하기»를 고른 즉시(화면 설정), 그리고 주문이
     * 끝날 때(답변·확정 메뉴). 그런데 첫 번째 시점의 answers 는 비어 있어서, 그대로 쓰면
     * «저장하기»를 고른 순간 지난번 알레르기·맵기가 빈 값으로 덮였다. 저장을 **고른**
     * 사람이 데이터를 잃는 것이고, 거기서 그만두면 영영 사라진다.
     * 바로 아래 lastCandidateId 는 같은 이유로 이미 지켜지고 있었다 — 답변만 빠져 있었다. */
    const next = Object.keys(answers).length > 0 ? { ...answers } : { ...(saved?.answers ?? {}) };
    const s: SavedSettings = {
      v: SAVED_VERSION,
      answers: next, a11y, savedAt: new Date().toISOString(),
      ...(id ? { lastCandidateId: id } : {}),
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); setSaved(s); } catch { /* 저장 불가 환경이면 조용히 건너뜀 */ }
  };

  /**
   * 저장된 내용을 **고친다** — 무로그인 가이드 4번의 «조회·수정·삭제» 중 수정.
   *
   * 조회(홈 카드)와 삭제(«처음부터 새로 시작하기»)는 있었는데 수정만 없었다. 고치려면
   * 주문을 처음부터 다시 해야 했고, 그건 «수정할 수 있다»가 아니다.
   *
   * 되살리기(startFromSaved)와 다른 점: 추천으로 바로 가지 않고 수정 화면에서 멈춘다.
   * carried 를 비우는 이유는 여기서 **전부 보여줘야** 하기 때문이다 — 불러온 항목을
   * «다시 안 묻는 것»으로 표시하면 정작 고치러 온 화면에서 절반이 숨는다.
   */
  const editSaved = () => {
    if (!saved) return;
    setAnswers({ ...saved.answers });
    setA11y(saved.a11y);
    setFromSaved(true);
    setStoreToggle(true);   // 이미 저장해 둔 사람이다 — 고친 값도 남는 것이 기대에 맞는다
    setCarried([]); setManual(false); setDemoHour(null); setReconfirmCount(0);
    resetRun(); setUiRec(null); setEditOpen(null);
    setStep("edit");
  };

  const applyEditAndRecommend = () => {
    if (!fixture) return;
    if (storeToggle) persist();
    // 고쳐서 다시 받는 경로 — 여기서도 미확정이면 시도 횟수가 올라가고, 2회째면 안전 중단이다
    goRecommend(computeRecommendation(buildRawInput(answers, a11y, fromSaved, storeToggle, touchedA11y), fixture, now));
  };

  /**
   * 저장 «의사»를 정한다. 켜면 그 자리에서 남길 수 있는 만큼 남기고, 끄면 즉시 지운다.
   *
   * 묻는 자리가 주문 전(S03)으로 옮겨지면서 «묻는 시점»과 «남길 것이 갖춰지는 시점»이
   * 갈렸다. 프로필 단계에서는 아직 고른 메뉴가 없으므로, 그때 저장하면 답변과 화면
   * 설정만 남고 `lastCandidateId` 가 비어 «지난번과 똑같이 주문하기» 가 성립하지 않는다.
   * 그래서 의사만 여기서 받고, 주문이 확정되는 순간 finishOrder 가 다시 남긴다.
   */
  const setStoreIntent = (next: boolean) => {
    setStoreToggle(next);
    if (next) persist();
    else { try { localStorage.removeItem(STORAGE_KEY); } catch { /* 무시 */ } setSaved(null); }
    if (uiRec) setUiRec({ ...uiRec, raw: { ...uiRec.raw, storeProfile: next } }); // retentionPolicy에 반영
  };
  /** 토글 버튼용 — 지금 값의 반대로 뒤집는다. */
  const toggleStore = () => setStoreIntent(!storeToggle);

  /**
   * 주문이 확정됐다. 저장하기로 해 두었으면 **이 시점에** 다시 남긴다 —
   * 이제 확정된 메뉴가 있으므로 다음 방문에 그대로 되살릴 수 있다.
   */
  const finishOrder = () => { if (storeToggle) persist(); };

  /**
   * 서버가 없는 환경(외부 배포본)의 «주문 확정하기».
   * 실행 대신 계획을 만들어 보관하고 결과 화면으로 간다 — 지나는 자리는 실행 경로와 같다.
   */
  const confirmOffline = () => {
    if (!fixture || !uiRec) return;
    setSubmitted(buildUiSubmission(uiRec, fixture, true, manual));
    finishOrder();
    setStep("result");
  };

  const runSimulation = async () => {
    if (!fixture || !uiRec) return;
    setStep("run"); setRunLog([]); setRunError(null); setSubmitted(null); setErrResults({});
    try {
      const submission = buildUiSubmission(uiRec, fixture, true, manual);
      const r = await runOnSimulator(submission, sessionInput || undefined, (label) => setRunLog((l) => [...l, label]));
      setSubmitted(submission);
      setOutcome(r);
      finishOrder();
      setStep("result");
    } catch (e) {
      setRunError(String((e as Error)?.message ?? e));
      setStep("result");
    }
  };

  /* 저장본에 7문항이 다 들어 있으면 되살리는 순간 더 여쭤볼 것이 없다 = 지난번 주문 그대로다.
     저장해 둔 플래그가 아니라 **실제로 들어 있는 답변**을 보고 판단한다 — 옛 형식에서 옮겨온
     부분 저장본이라면 남은 질문을 다시 여쭤봐야 하고, 문구도 그에 맞아야 한다. */
  const savedCoversAll = !!saved && QUESTIONS.every((qq) => saved.answers[qq.key] !== undefined);
  const q = QUESTIONS[qIndex];
  /* 알레르기만 «값이 있는가»로 부족하다. 항목 목록에서 고른 것을 전부 해제하면 빈 배열이
     남는데, 그건 답이 아니라 «아직 안 골랐다»이다. 빈 채로 넘어가면 알레르기가 없는
     사람과 구별이 되지 않는다 — 제외해야 할 것을 못 제외하게 되는 쪽이다. */
  const answered = !q ? false
    : q.key === "allergies" ? Array.isArray(answers.allergies) && answers.allergies.length > 0
    : answers[q.key] !== undefined;
  const ev = outcome?.evidence as (Evidence & Record<string, unknown>) | undefined;

  /**
   * 직원 도움 — 어느 화면에서든 나올 수 있게. 설정에 따라 위치·크기가 달라진다.
   * 화면 파일마다 이 함수를 쓰는지를 tests/a11y.test.ts 가 검사한다(면제 목록에 적힌 곳만 예외).
   */
  const staffBtn = (cls = "btn ghost") => (
    <button type="button" className={cls} onClick={() => setStep("staff")}>직원 도움</button>
  );

  return {
    // 상태
    step, a11y, fixture, live, qIndex, answers, uiRec, manual, sessionInput, runLog,
    outcome, submitted, runError, errResults, saved, fromSaved, storeToggle, editOpen,
    carried, demoHour, reconfirmCount, profileStep, allergyOpen,
    // 파생값
    now, simple, rawInput, savedCoversAll, q, answered, ev, askTotal, askPos,
    // 조작
    setStep, setA11y, setFlag, setQIndex, setAnswers, setUiRec, setManual, setSessionInput,
    setSubmitted, setErrResults, setStoreToggle, setEditOpen, setReconfirmCount,
    setProfileStep, setAllergyOpen,
    t, staffBtn, nextToAsk, advance, startWizard, startFromSaved, applyPreset, deleteSaved, editSaved,
    openEdit, applyEditAndRecommend, toggleStore, setStoreIntent, finishOrder,
    confirmOffline, runSimulation, goRecommend,
  };
}

/** 손으로 적지 않는다 — 위에서 값을 하나 늘리면 타입이 저절로 따라온다. */
export type Flow = ReturnType<typeof useFlowState>;

const FlowContext = createContext<Flow | null>(null);

export const FlowProvider = ({ value, children }: { value: Flow; children: React.ReactNode }) => (
  <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
);

export function useFlow(): Flow {
  const f = useContext(FlowContext);
  if (!f) throw new Error("useFlow 는 FlowProvider 안에서만 쓸 수 있습니다");
  return f;
}
