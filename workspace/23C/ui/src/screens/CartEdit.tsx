import React from "react";
import { useFlow } from "../flow";
import { Card, Cta, Emphasize, Screen, type CardRow } from "../components";
import { ChoiceGrid } from "../components/ChoiceGrid";
import { Stepper } from "../components/Stepper";
import { EDIT_LABELS, QUANTITY_MAX, QUESTIONS, answerLabel } from "../model";
import { candidateName, candidatePrice, withManualSelection } from "../logic";
import "./cart.css";

/**
 * 화면목록 S14 — 수정 (Figma 114:2008).
 *
 * **화면목록과 디자인이 서로 다른 화면을 S14 라 부른다.** 문서는 «메뉴·수량·옵션 수정»
 * 이라 하고, 디자인은 «글씨 크기·고대비·화면 안내» 수정 화면을 그렸다. 둘 중 하나를
 * 버리지 않고 한 화면에 둔다:
 *
 *  - 조건(메뉴·맵기·수량…) 수정을 없애면 «조건에 맞는 메뉴가 없습니다»에서
 *    빠져나갈 길이 사라진다. 그건 막다른 길이다.
 *  - 화면 설정 수정을 없애면, 글씨가 안 보여서 멈춘 사람이 «설정 더보기»를 찾아
 *    상단바까지 올라가야 한다. 안 보이는 사람에게 더 찾게 하는 셈이다.
 *
 * 그래서 위에는 화면 보기 방식(디자인의 SummaryCard 185:209), 아래에는 조건 수정(문서)을 둔다.
 *
 * 예전에는 이 둘을 «카드 두 장»으로 나눠 쌓았다. 지금은 화면 자체가 틀(`Screen`)이고,
 * 카드 모양은 디자인이 카드로 그린 것 하나 — 화면 보기 방식 — 에만 남긴다.
 * 조건 수정은 원래도 카드가 아니라 목록이었다.
 *
 * 고를 수 있는 메뉴는 STEP 4 를 통과한 **생존 후보뿐**이다(scoreBreakdown).
 * 알레르기·품절·예산으로 제외된 후보를 여기서 되살리지 않는다 — 되살릴 수 있으면
 * 제외가 «추천에서 빠짐»에 그치고 «먹으면 안 됨»이 아니게 된다.
 */

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
    applyEditAndRecommend, setStep, setUiRec, setManual, } = useFlow();

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

  /* 이 화면에는 두 갈래로 들어온다 — 추천을 받은 뒤 «조건 수정», 그리고 홈에서
     «저장된 내용 수정». 뒤로가 늘 추천으로 가면 추천을 받은 적 없는 사람이 빈 화면에
     떨어진다. 어디서 왔는지는 «추천이 있는가»가 말해 준다. */
  return (
    <Screen
      label="주문 조건과 화면 보기 방식 수정"
      onBack={() => setStep(uiRec ? "recommend" : "start")}
      eyebrow="고객님,"
      title={<Emphasize text="어떤 항목을 수정하고 싶으신가요?" word="수정" />}
      actions={(
        <>
          {/* 디자인의 «수정 완료»는 화면을 닫기만 한다. 우리 것은 고친 조건으로 추천을
              다시 계산하므로, 버튼 이름이 하는 일과 같아야 한다. */}
          <Cta tone="primary" label="이 조건으로 추천 다시 받기" onClick={applyEditAndRecommend} />
        </>
      )}
    >
      <h3 className="cart-cap">화면 보기 방식</h3>
      <Card rows={viewRows}
        hint={simple ? undefined : "누르면 이 화면이 그 자리에서 바뀝니다."} />

      <h3 className="cart-cap">주문 조건</h3>
      {!simple && <p className="hint">누르면 그 자리에서 선택지가 열립니다. 다 바꾸셨으면 아래에서 추천을 다시 받아 주세요.</p>}

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
                {/* 수량은 질문 화면과 같은 부품으로 고친다. 여기만 선택지 버튼으로 두면
                    같은 값을 두 가지 방법으로 고르게 되고, 고칠 수 있는 범위도 달라진다. */}
                {qq.key === "quantity" ? (
                  <Stepper
                    label="수량"
                    value={typeof answers.quantity === "number" ? answers.quantity : undefined}
                    onChange={(n) => setAnswers((p) => ({ ...p, quantity: n }))}
                    max={QUANTITY_MAX}
                    atMaxNote={<>한 번에 {QUANTITY_MAX}개까지 고르실 수 있어요.</>}
                  />
                ) : (
                  <ChoiceGrid q={qq} answers={answers} setAnswers={setAnswers}
                    onPicked={() => setEditOpen(null)} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </Screen>
  );
}
