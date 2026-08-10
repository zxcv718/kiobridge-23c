import React from "react";
import { useFlow } from "../flow";
import { ChoiceGrid } from "../components/ChoiceGrid";
import { EDIT_LABELS, QUESTIONS, answerLabel } from "../model";
import { candidateName, candidatePrice, withManualSelection } from "../logic";

/**
 * 화면목록 S14 — 조건·메뉴 수정.
 *
 * 고를 수 있는 메뉴는 STEP 4 를 통과한 **생존 후보뿐**이다(scoreBreakdown).
 * 알레르기·품절·예산으로 제외된 후보를 여기서 되살리지 않는다 — 되살릴 수 있으면
 * 제외가 «추천에서 빠짐»에 그치고 «먹으면 안 됨»이 아니게 된다.
 */
export function CartEdit() {
  const {
    editOpen, setEditOpen, uiRec, fixture, answers, setAnswers, simple, a11y,
    applyEditAndRecommend, setStep, setUiRec, setManual, staffBtn,
  } = useFlow();

  return (
    <section className="card" aria-label="조건 수정">
      <h2>바꾸실 것을 눌러 주세요</h2>
      {!simple && <p className="hint">누르면 그 자리에서 선택지가 열립니다. 다 바꾸셨으면 아래에서 추천을 다시 받아 주세요.</p>}
      {/* 메뉴 행이 붙어 화면이 길어졌다 — 도움을 화면 끝까지 내려가야 닿는 곳에 두지 않는다 */}
      <div className="btnrow" style={{ marginBottom: 4 }}>{staffBtn()}</div>

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
  );
}
