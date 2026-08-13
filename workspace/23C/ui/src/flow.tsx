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
  computeRecommendation, withManualSelection, recommendKeeping, buildUiSubmission, runOnSimulator,
  fetchFixture, readUrlStoreCode, readStoredStoreCode, type UiRecommendation, type RunOutcome,
} from "./logic";
import { MAX_RECONFIRM_ATTEMPTS, shouldSafetyStop, isUnresolved } from "../../src/core/ask";
import { PROFILE_VERSION, SESSION_VERSION } from "../../src/core/saved";
import {
  A11Y_DEFAULT, CALC_MS, PROFILE_KEY, QUESTIONS, SESSION_KEY, buildRawInput, loadStores,
  prefersReducedMotion,
  type A11y, type Preset, type SavedProfile, type SavedSession, type Step,
} from "./model";

export function useFlowState() {
  /* 첫 화면 — 매장 QR 링크(?env=)로 열렸거나 이 기기가 연동을 마친 적 있으면 홈,
     아니면 연동 관문(기획 2026-08-12 · QA 1차 TC-XC-04). 관문은 4걸음 흐름 밖이다:
     QR 을 찍거나 코드를 넣으면 홈이 나오고, 그 성공이 기기에 남아(QrConnect →
     logic.rememberStoreCode) 강제 종료 후 다시 열어도 관문을 다시 세우지 않는다. */
  const [step, setStep] = useState<Step>(() =>
    (readUrlStoreCode() !== "" || readStoredStoreCode() !== "" ? "start" : "connect"));
  const [a11y, setA11y] = useState<A11y>(A11Y_DEFAULT);
  const [fixture, setFixture] = useState<PublicFixture | null>(null);
  const [live, setLive] = useState(true);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [uiRec, setUiRec] = useState<UiRecommendation | null>(null);
  const [manual, setManual] = useState(false);
  const [runLog, setRunLog] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  /** 실행에 쓴 제출물 원본 — 오류 주입은 이것을 새 세션에 다시 올려 재실행한다 */
  const [submitted, setSubmitted] = useState<ParticipantSubmission | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [errResults, setErrResults] = useState<Record<string, string>>({});
  /* 저장본은 둘로 나뉜다(QA 1차 2026-08-13) — 프로필(화면 설정)과 세션(답변·확정 메뉴).
     각자 저장·삭제가 따로 논다. 프로필은 S04 가, 세션은 S15 가 주인이다. */
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(null);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [fromSaved, setFromSaved] = useState(false);
  const [storeToggle, setStoreToggle] = useState(false); // 프로필 저장 의사 — "이번 한 번만"이 기본값
  const [editOpen, setEditOpen] = useState<string | null>(null); // 조건 수정 화면에서 펼쳐진 행 (한 번에 하나)
  /** 저장본에서 불러온 항목의 key — 마법사에서 건너뛰고, 무엇이 불러와졌는지 화면에 밝힌다 */
  const [carried, setCarried] = useState<string[]>([]);
  const [demoHour, setDemoHour] = useState<number | null>(null); // 프리셋의 시간대 시연용
  /** 확정되지 않은 추천을 몇 번 만났는가 — 2회째면 안전 중단(S12) */
  const [reconfirmCount, setReconfirmCount] = useState(0);
  /**
   * «다시 추천받기»를 몇 번 눌렀는가 — 2회째면 확정 추천이어도 안전 중단(S12).
   *
   * 미확인 카운터(reconfirmCount)와 따로 세는 이유: QA(1차 TC-CM-01)의 기대는
   * «다시 추천받기 2회 클릭 시 안전 중단»인데, 확정 추천은 미확인 카운터를 매번 0으로
   * 되돌려서 그 판정만으로는 이 화면에 닿는 일반 경로가 없었다. 두 번을 다시 요청한
   * 사람에게 세 번째 계산을 들이미는 대신 직원에게 넘기는 것이 이 화면의 몫이다.
   */
  const [retryCount, setRetryCount] = useState(0);
  /**
   * 알레르기 질문의 둘째 걸음(항목 목록)에 들어와 있는가 — 디자인 S06 기본/확장.
   *
   * 질문 자체는 하나다(QUESTIONS 6개는 그대로). 나뉘는 것은 묻는 방법뿐이라 질문
   * 번호가 아니라 별도 상태로 둔다 — qIndex 를 늘리면 «질문 6개 고정»이 7개가 되고,
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
    const stores = loadStores();
    setSavedProfile(stores.profile);
    setSavedSession(stores.session);
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
    setDemoHour(null); setReconfirmCount(0); setRetryCount(0);
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

  /** 답변 확정 후 다음 질문으로. 질문은 6개 고정이므로 시스템이 먼저 끝내지 않는다. */
  const advance = () => {
    setAllergyOpen(false);   // 다음 질문으로 갈 때 알레르기는 늘 «있으신가요?»부터 다시
    const n = nextToAsk(qIndex + 1);
    if (n >= QUESTIONS.length) { finishWizard(); return; }
    setQIndex(n);
  };

  /** 저장된 설정으로 시작 — 배너에서 내용을 보여준 뒤의 클릭이므로 '확인받은 자동 불러오기'다.
   *  세션(지난 답변)이 없고 프로필만 있어도 온다 — 그때는 화면 설정만 입고 처음부터 묻는다. */
  const startFromSaved = () => {
    if (!fixture || (!savedSession && !savedProfile)) return;
    const next = { ...(savedSession?.answers ?? {}) };
    const nextA11y = savedProfile?.a11y ?? a11y;
    setAnswers(next);
    setA11y(nextA11y);
    setCarried(QUESTIONS.map((q) => q.key).filter((k) => next[k] !== undefined));
    setFromSaved(true); setStoreToggle(!!savedProfile);
    setManual(false); setDemoHour(null); setRetryCount(0); resetRun();
    const loaded = QUESTIONS.map((qq) => qq.key).filter((k) => next[k] !== undefined);
    const start = nextToAsk(0, loaded);
    if (start >= QUESTIONS.length) {
      // 저장본에 6문항이 다 있어 더 여쭤볼 것이 없다 = 지난번 주문을 그대로 되살리는 경우다
      const u = computeRecommendation(buildRawInput(next, nextA11y, true, !!savedProfile, touchedA11y), fixture, new Date());
      /* 지난번에 직접 고른 메뉴를 되살린다.
       * 답변만 재현하면 엔진이 다시 1위를 뽑으므로, 대안을 골랐던 경우 지난번과 달라진다.
       * 되살리는 대상은 scoreBreakdown 에 남은 **생존 후보뿐**이다 — 그 사이 품절되었거나
       * 알레르기를 새로 등록해 제외된 메뉴는 여기서 되살아나지 않는다. */
      const wanted = savedSession?.lastCandidateId;
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
    setFromSaved(false); setStoreToggle(false); setManual(false); setRetryCount(0); resetRun();
    goRecommend(
      computeRecommendation(buildRawInput(p.answers, nextA11y, false, false), fixture, nextHour === null ? new Date() : d),
      0, // 시연 프리셋은 새 흐름이다 — 이전 시도 횟수를 물려받지 않는다
    );
  };

  /**
   * 저장본을 **전부** 지운다 — 홈의 «처음부터 새로 시작»은 완전 초기화다(QA 확정 2026-08-13).
   * 프로필·세션이 따로 노는 것은 저장·삭제의 «주인»이 다르다는 뜻이지, 새로 시작하는
   * 사람에게 반쪽만 지워 주라는 뜻이 아니다 — 이후 프로필 생성부터 다시 밟는다.
   *
   * 지우기 직전에 되묻는다(홈의 «네, 지우고 새로 시작할게요»). 한때는 지운 **뒤**에도
   * «지웠습니다»를 한 줄 띄웠는데, 되묻기에서 이미 «되돌릴 수 없습니다»를 읽고 직접
   * 누른 사람에게 같은 말을 한 번 더 하는 셈이라 걷어냈다. 확인은 일이 일어나기 전에
   * 한 번이면 된다.
   */
  const deleteSaved = () => {
    try {
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(SESSION_KEY);
    } catch { /* 무시 */ }
    setSavedProfile(null);
    setSavedSession(null);
  };

  /** 추천 화면 → 조건 수정(«다시 추천받기»): 재확인 사유(알레르기)가 있으면 그 행을 바로
   *  열어 준다. **두 번째 요청이면 조건 수정 대신 안전 중단이다**(QA 1차 TC-CM-01) —
   *  덫은 아니다: S12 의 «조건 다시 보기»가 카운터를 되돌려 기회를 다시 준다. */
  const openEdit = () => {
    const n = retryCount + 1;
    setRetryCount(n);
    if (n >= MAX_RECONFIRM_ATTEMPTS) { setStep("stopped"); return; }
    setEditOpen(uiRec?.rec.requiresReconfirmation ? "allergies" : null);
    setStep("edit");
  };

  /**
   * 프로필(화면 설정)을 남긴다 — S04 «저장하기»의 몫이다. 답변은 여기 없다.
   * 옛 통합 저장에 있던 «저장하기를 고른 순간 지난 답변이 빈 값으로 덮이는» 함정은
   * 분리로 통째로 사라졌다 — 프로필 저장은 애초에 답변을 만지지 않는다.
   */
  const persistProfile = (nextA11y: A11y = a11y) => {
    const p: SavedProfile = { v: PROFILE_VERSION, a11y: nextA11y, savedAt: new Date().toISOString() };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); setSavedProfile(p); } catch { /* 저장 불가 환경이면 조용히 건너뜀 */ }
  };

  /**
   * 세션(답변·확정 메뉴)을 남긴다 — S15 «저장하기»와 저장본 수정이 부른다.
   * candidateId 를 넘기지 않으면 이미 저장돼 있던 지난 메뉴를 지킨다 — 답만 고치는
   * 수정(S14)이 지난 메뉴까지 지우면 «지난번과 똑같이 주문하기»가 성립하지 않는다.
   */
  const persistSession = (nextAnswers: Record<string, unknown>, candidateId?: string) => {
    const id = candidateId ?? savedSession?.lastCandidateId;
    const s: SavedSession = {
      v: SESSION_VERSION,
      answers: { ...nextAnswers }, savedAt: new Date().toISOString(),
      ...(id ? { lastCandidateId: id } : {}),
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); setSavedSession(s); } catch { /* 저장 불가 환경이면 조용히 건너뜀 */ }
  };

  /** S15 «저장하기» — 이번 답변과 확정 메뉴를 세션으로 남긴다. 프로필은 건드리지 않는다. */
  const saveSession = () => persistSession(answers, uiRec?.rec.recommendedCandidateId ?? undefined);

  /** S15 «이번만 사용»과 결과 화면 «저장 지우기» — 세션만 지운다. 프로필은 S04 의 결정이다. */
  const discardSession = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* 무시 */ }
    setSavedSession(null);
  };

  /* 저장하기로 한 사람의 화면 설정은 바뀔 때마다 저장본이 따라간다 — S04 의 결정은 그 순간의
     스냅샷이 아니라 «내 화면 설정을 이 기기에 남긴다»는 의사이기 때문이다. 수정 화면(S14)에서
     켠 고대비도 다음 방문에 남아야 그 결정이 지켜진다. */
  useEffect(() => { if (storeToggle) persistProfile(); }, [a11y, storeToggle]);

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
    if (!savedSession) return;
    setAnswers({ ...savedSession.answers });
    if (savedProfile) setA11y(savedProfile.a11y);
    setFromSaved(true);
    setStoreToggle(!!savedProfile); // 프로필 저장 의사 — 프로필을 남겨 둔 사람만 켠 채 온다
    setCarried([]); setManual(false); setDemoHour(null); setReconfirmCount(0); setRetryCount(0);
    resetRun(); setUiRec(null); setEditOpen(null);
    setStep("edit");
  };

  /**
   * 장바구니(S13)에서 수량·주문 방식을 **그 자리에서** 고친다 — 화면을 떠나지 않는다.
   *
   * 조건 수정 화면(applyEditAndRecommend)과 달리 계산 화면을 지나지 않고, **확정한
   * 메뉴를 유지한다**(logic.recommendKeeping). 주문 방식은 엔진 점수에 들어가는 값이라
   * 그냥 다시 계산하면 최종 확인 화면에서 메뉴가 갑자기 바뀔 수 있다. 고정이 실제로
   * 일어났으면(엔진 1위 ≠ 유지한 메뉴) 이후 제출은 직접 선택(MODIFY)이다.
   */
  const applyCartAnswers = (next: Record<string, unknown>) => {
    if (!fixture || !uiRec) return;
    setAnswers(next);
    const { u, pinned } = recommendKeeping(
      buildRawInput(next, a11y, fromSaved, storeToggle, touchedA11y),
      fixture, uiRec.rec.recommendedCandidateId, now,
    );
    setUiRec(u);
    if (pinned) setManual(true);
  };

  const applyEditAndRecommend = () => {
    if (!fixture) return;
    /* 저장된 세션을 고치러 온 사람(홈 → 저장된 내용 수정)의 답은 그 자리에서 저장본에
       반영된다 — 그것이 «수정»이다. 저장본이 없는 주문 도중의 조건 수정은 아무것도
       남기지 않는다 — 세션을 남길지는 주문을 마친 뒤 S15 가 묻는다. */
    if (savedSession) persistSession(answers);
    const u = computeRecommendation(buildRawInput(answers, a11y, fromSaved, storeToggle, touchedA11y), fixture, now);
    /* 확정 추천이면 장바구니 확인으로 **직행**한다(2차 QA 2026-08-13) — 고친 조건의
       결과를 곧장 주문 내역으로 보여주고, 메뉴 확인을 한 번 더 지나게 하지 않는다.
       미확정(알레르기 모름 등)은 기존 길 그대로다 — 재확인 배너와 2회째 안전 중단은
       goRecommend 가 잰다. 승인 차단을 쥔 화면을 건너뛰면 안 되기 때문이다. */
    if (!isUnresolved(u.rec)) {
      setReconfirmCount(0);
      setUiRec(u);
      setManual(false); // 엔진이 새로 뽑은 1위다 — 직접 선택 표식을 물려받지 않는다
      setStep("confirm");
      return;
    }
    // 미확정 — 여기서도 시도 횟수가 올라가고, 2회째면 안전 중단이다
    goRecommend(u);
  };

  /**
   * 프로필 저장 «의사»를 정한다(S04 «프로필 저장 완료»). 켜면 화면 설정을 그 자리에서
   * 남기고, 끄면 즉시 지운다. **세션은 건드리지 않는다** — 지난 주문 기록(답변·메뉴)의
   * 주인은 S15 다(QA 1차 2026-08-13). 한 덩어리이던 때는 여기 «이번만 사용»이 지난
   * 주문 기록까지 지웠다 — 그것이 이번 분리로 고친 결함이다.
   */
  const setStoreIntent = (next: boolean) => {
    setStoreToggle(next);
    if (next) persistProfile();
    else { try { localStorage.removeItem(PROFILE_KEY); } catch { /* 무시 */ } setSavedProfile(null); }
    if (uiRec) setUiRec({ ...uiRec, raw: { ...uiRec.raw, storeProfile: next } }); // retentionPolicy에 반영
  };

  /**
   * 서버가 없는 환경(외부 배포본)의 «주문 확정하기».
   * 실행 대신 계획을 만들어 보관하고 저장 유도(S15)로 간다 — 지나는 자리는 실행 경로와 같다.
   */
  const confirmOffline = () => {
    if (!fixture || !uiRec) return;
    setSubmitted(buildUiSubmission(uiRec, fixture, true, manual));
    setStep("savePrompt");
  };

  const runSimulation = async () => {
    if (!fixture || !uiRec) return;
    setStep("run"); setRunLog([]); setRunError(null); setSubmitted(null); setErrResults({});
    try {
      const submission = buildUiSubmission(uiRec, fixture, true, manual);
      /* 세션 ID 는 늘 새로 발급받는다 — 기존 세션에 잇는 입력칸(S13)은 심사 시연용이었고
         1차 QA 후 사용자 결정으로 걷어냈다(2026-08-13). */
      const r = await runOnSimulator(submission, undefined, (label) => setRunLog((l) => [...l, label]));
      setSubmitted(submission);
      setOutcome(r);
      // 주문이 끝났다 — 결과로 가기 전에 이번 세션을 남길지 S15 가 묻는다.
      setStep("savePrompt");
    } catch (e) {
      setRunError(String((e as Error)?.message ?? e));
      setStep("result");
    }
  };

  /* 저장본에 6문항이 다 들어 있으면 되살리는 순간 더 여쭤볼 것이 없다 = 지난번 주문 그대로다.
     저장해 둔 플래그가 아니라 **실제로 들어 있는 답변**을 보고 판단한다 — 옛 형식에서 옮겨온
     부분 저장본이라면 남은 질문을 다시 여쭤봐야 하고, 문구도 그에 맞아야 한다. */
  const savedCoversAll = !!savedSession && QUESTIONS.every((qq) => savedSession.answers[qq.key] !== undefined);
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
    step, a11y, fixture, live, qIndex, answers, uiRec, manual, runLog,
    outcome, submitted, runError, errResults, savedProfile, savedSession, fromSaved,
    storeToggle, editOpen,
    carried, demoHour, reconfirmCount, retryCount, profileStep, allergyOpen,
    // 파생값
    now, simple, rawInput, savedCoversAll, q, answered, ev, askTotal, askPos,
    // 조작
    setStep, setA11y, setFlag, setQIndex, setAnswers, setUiRec, setManual,
    setSubmitted, setErrResults, setStoreToggle, setEditOpen, setReconfirmCount, setRetryCount,
    setProfileStep, setAllergyOpen,
    t, staffBtn, nextToAsk, advance, startWizard, startFromSaved, applyPreset, deleteSaved, editSaved,
    openEdit, applyEditAndRecommend, applyCartAnswers, setStoreIntent, saveSession, discardSession,
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
