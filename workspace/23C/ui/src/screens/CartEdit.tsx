import React from "react";
import { useFlow } from "../flow";
import { Card, Header, type CardRow } from "../components";
import { ChoiceGrid } from "../components/ChoiceGrid";
import { EDIT_LABELS, QUESTIONS, answerLabel } from "../model";
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
 * 그래서 위에는 화면 보기 방식(디자인), 아래에는 조건 수정(문서)을 둔다.
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
  { key: "visualGuidance", label: "화면 안내", on: "그림 함께 보기", off: "기본" },
];

export function CartEdit() {
  const {
    editOpen, setEditOpen, uiRec, fixture, answers, setAnswers, simple, a11y, setFlag,
    applyEditAndRecommend, setStep, setUiRec, setManual, staffBtn,
  } = useFlow();

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

  return (
    <section aria-label="주문 조건과 화면 보기 방식 수정">
      <section className="card">
        <Header onBack={() => setStep("recommend")} backLabel="뒤로" />
        <p className="stepmeta">고객님,</p>
        <h2>어떤 항목을 수정하고 싶으신가요?</h2>
        {/* 화면이 길다 — 도움을 끝까지 내려가야 닿는 곳에 두지 않는다 */}
        <div className="btnrow" style={{ marginTop: 10, marginBottom: 4 }}>{staffBtn()}</div>

        <Card title="화면 보기 방식" rows={viewRows}
          hint={simple ? undefined : "누르면 이 화면이 그 자리에서 바뀝니다. 상단 «설정 더보기»에서도 바꾸실 수 있습니다."} />
      </section>

      <section className="card">
        <h2>주문 조건</h2>
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
    </section>
  );
}
