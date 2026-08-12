import React, { useState } from "react";
import { useFlow } from "../flow";
import { Card, Cta, Screen, type CardRow } from "../components";
import { ChoiceGrid } from "../components/ChoiceGrid";
import { Stepper } from "../components/Stepper";
import { EDIT_LABELS, QUANTITY_MAX, QUESTIONS, answerLabel } from "../model";
import { candidateName } from "../logic";
import "./cart.css";
import "./profile.css"; // .p-edit — 요약 행의 주황 «수정» 링크 (시안 185:214, S03 과 같은 문법)

/**
 * 화면목록 S14 — 수정 (노션 기획 «장바구니 수정 플로우 변경» 2026-08-12).
 *
 * 기획은 이 화면을 **네 행**으로 줄였다 — 메뉴 · 뼈/순살 선택 · 수량 · 먹고가기/포장 선택.
 * 메뉴는 별도의 «메뉴 선택» 화면으로 가고(점수순 목록), 나머지 셋은 그 자리에서 펴서
 * 고친다(기획: «해당 옵션 선택 → 해당 옵션만 다시 반영하여 메뉴 추천 — 지금과 플로우는
 * 동일함»). 다 고치면 «수정 완료»가 재계산해 메뉴 확인으로 보낸다.
 *
 * **기획 목업에 없는 항목을 지우지는 못한다.** 알레르기(재확인 경로의 입구), 예산
 * («조건에 맞는 메뉴가 없어요»의 유일한 탈출로), 맵기·컵, 그리고 화면 보기 방식
 * (글씨가 안 보여 멈춘 사람의 입구)이 그것이다. 지우는 대신 «다른 항목 수정»으로
 * 접는다(FIGMA_RULES §2.1) — 기본 화면은 기획 그대로 네 행이고, 필요한 사람은 한 번
 * 눌러 닿는다. 저장된 내용 수정(홈)과 재확인·조건 없음 경로에서는 **저절로 펴진다** —
 * 고치러 온 화면에서 절반이 숨으면 안 된다(무로그인 가이드 4번).
 *
 * 고를 수 있는 메뉴는 STEP 4 를 통과한 **생존 후보뿐**이다(MenuSelect 참조).
 */

/** 그 자리에서 펴서 고치는 세 행 — 라벨은 기획 표기 그대로. */
const PRIMARY: { key: "boneType" | "quantity" | "serviceType"; label: string }[] = [
  { key: "boneType", label: "뼈/순살 선택" },
  { key: "quantity", label: "수량" },
  { key: "serviceType", label: "먹고가기/포장 선택" },
];

/** 기획 목업에 없어 «다른 항목 수정»으로 접는 항목들 — 위 파일머리 주석의 이유로 못 지운다. */
const EXTRA_KEYS = ["allergies", "spicyLevel", "cupOption", "budgetKrw"] as const;

/** 화면 보기 방식 세 줄 — 디자인의 SummaryCard(185:209) 행과 같은 순서다. */
const VIEW_ROWS: {
  key: "largeText" | "highContrast" | "visualGuidance";
  label: string; on: string; off: string;
}[] = [
  { key: "largeText", label: "글씨 크기", on: "큰 글씨", off: "기본 크기" },
  { key: "highContrast", label: "고대비", on: "고대비 화면", off: "기본 화면" },
  { key: "visualGuidance", label: "화면 안내", on: "안내 켜짐", off: "기본" },
];

export function CartEdit() {
  const {
    editOpen, setEditOpen, uiRec, fixture, answers, setAnswers, simple, a11y, setFlag,
    applyEditAndRecommend, setStep,
  } = useFlow();

  /* 접힘의 초기 상태 — 세 경우에 저절로 펴진다:
     ① 저장본 수정(추천 없음): 일곱 항목이 전부 보여야 한다(무로그인 가이드 4번의 «수정»)
     ② 조건에 맞는 메뉴 없음: 빠져나가려면 대개 예산을 고쳐야 한다 — 접혀 있으면 막다른 길
     ③ 재확인 경로: openEdit 가 알레르기 행을 편 채로 보낸다 */
  const [extraOpen, setExtraOpen] = useState<boolean>(
    !uiRec
    || uiRec.rec.recommendedCandidateId === null
    || (editOpen !== null && (EXTRA_KEYS as readonly string[]).includes(editOpen)),
  );

  const questionOf = (key: string) => QUESTIONS.find((x) => x.key === key)!;

  /* 디자인의 «수정»은 14px 텍스트 링크지만 여기서는 진짜 버튼이다 —
     누르면 그 자리에서 화면이 바뀌고, 무엇이 바뀌었는지는 옆 값이 글자로 말한다. */
  const viewRows: CardRow[] = VIEW_ROWS.map(({ key, label, on, off }) => ({
    label,
    value: a11y[key] ? on : off,
    action: (
      <button type="button" className="rowfix" aria-pressed={a11y[key] === true}
        aria-label={`${label} 수정`} onClick={() => setFlag(key, !a11y[key])}>
        수정
      </button>
    ),
  }));

  /** 접히는 행 하나 — 옛 화면의 아코디언 문법 그대로. 값은 기획 목업처럼 오른쪽에 선다. */
  const editRow = (key: string, label: string, body: React.ReactNode) => {
    const open = editOpen === key;
    return (
      <div className="editrow" key={key}>
        <button type="button" className="edithead" aria-expanded={open}
          onClick={() => setEditOpen(open ? null : key)}>
          <span className="editlabel">{label}</span>
          <span className="editvalue">{answerLabel(key, answers[key])}</span>
          <span aria-hidden="true">{open ? "▲" : "▼"}</span>
        </button>
        {open && <div className="editbody">{body}</div>}
      </div>
    );
  };

  /* 이 화면에는 두 갈래로 들어온다 — 추천을 받은 뒤 «다시 추천받기», 그리고 홈에서
     «저장된 내용 수정». 뒤로가 늘 추천으로 가면 추천을 받은 적 없는 사람이 빈 화면에
     떨어진다. 어디서 왔는지는 «추천이 있는가»가 말해 준다. */
  return (
    <Screen
      label="주문 조건과 화면 보기 방식 수정"
      onBack={() => setStep(uiRec ? "menuConfirm" : "start")}
      eyebrow="고객님,"
      /* 기획 목업은 한 문장이 통째로 같은 크기다 — 강조 분할을 쓰지 않는다. */
      title="어떤 항목을 수정하고 싶으신가요?"
      actions={(
        <>
          {/* 라벨은 기획의 «수정 완료». 하는 일은 그대로다 — 고친 조건으로 추천을 다시
              계산해 메뉴 확인으로 보낸다 (기획: «지금과 플로우는 동일함»). */}
          <Cta tone="primary" label="수정 완료" onClick={applyEditAndRecommend} />
        </>
      )}
    >
      {/* ── 기획의 네 행 — SummaryCard(185:209) 문법: 라벨 · 값(Bold) · 주황 «수정» ── */}
      <Card rows={[
        ...(uiRec && fixture && uiRec.rec.recommendedCandidateId ? [{
          label: "메뉴",
          value: candidateName(fixture, uiRec.rec.recommendedCandidateId),
          action: (
            /* 메뉴는 그 자리에서 펴지 않는다 — 점수순 목록을 가진 «메뉴 선택» 화면으로 간다 */
            <button type="button" className="p-edit" aria-label="메뉴 수정"
              onClick={() => setStep("menuSelect")}>
              수정
            </button>
          ),
        }] : []),
        ...PRIMARY.map(({ key, label }) => ({
          label,
          value: answerLabel(key, answers[key]),
          action: (
            <button type="button" className="p-edit" aria-expanded={editOpen === key}
              aria-label={`${label} 수정`}
              onClick={() => setEditOpen(editOpen === key ? null : key)}>
              수정
            </button>
          ),
        })),
      ]} />

      {/* «수정»을 누른 행의 선택지 — 카드 바로 아래에서 편다 (기획: 지금과 플로우 동일) */}
      {PRIMARY.filter(({ key }) => editOpen === key).map(({ key, label }) => (
        <div className="editbody" key={key} role="group" aria-label={`${label} 선택`}>
          {key === "quantity" ? (
            /* 수량은 질문 화면과 같은 부품으로 고친다. 여기만 선택지 버튼으로 두면
               같은 값을 두 가지 방법으로 고르게 되고, 고칠 수 있는 범위도 달라진다. */
            <Stepper
              label="수량"
              value={typeof answers.quantity === "number" ? answers.quantity : undefined}
              onChange={(n) => setAnswers((p) => ({ ...p, quantity: n }))}
              max={QUANTITY_MAX}
              atMaxNote={<>한 번에 {QUANTITY_MAX}개까지 고르실 수 있어요.</>}
            />
          ) : (
            <ChoiceGrid q={questionOf(key)} answers={answers} setAnswers={setAnswers}
              onPicked={() => setEditOpen(null)} />
          )}
        </div>
      ))}

      {/* ── 기획 목업에 없는 항목 — 접어 둔다 (§2.1) ── */}
      <details className="home-saved" open={extraOpen}
        onToggle={(e) => setExtraOpen((e.target as HTMLDetailsElement).open)}>
        <summary>다른 항목 수정<span aria-hidden="true">▾</span></summary>
        <div className="home-savedbody">
          <h3 className="cart-cap">화면 보기 방식</h3>
          <Card rows={viewRows}
            hint={simple ? undefined : "누르면 이 화면이 그 자리에서 바뀝니다."} />

          <h3 className="cart-cap">다른 주문 조건</h3>
          {EXTRA_KEYS.map((key) => {
            const qq = questionOf(key);
            return editRow(
              key, EDIT_LABELS[key] ?? qq.title,
              <>
                {qq.hint && !simple && <p className="hint">{qq.hint}</p>}
                <ChoiceGrid q={qq} answers={answers} setAnswers={setAnswers}
                  onPicked={() => setEditOpen(null)} />
              </>,
            );
          })}
        </div>
      </details>
    </Screen>
  );
}
