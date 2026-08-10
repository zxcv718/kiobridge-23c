import React from "react";
import { useFlow } from "../flow";
import { ChoiceGrid } from "../components/ChoiceGrid";
import { EDIT_LABELS, QUESTIONS, answerLabel } from "../model";

/**
 * 화면목록 S06~S10 — 질문 마법사.
 *
 * 질문은 7개 고정이고 시스템이 먼저 끝내지 않는다. 한때 «추천 신뢰도가 충분하면
 * 남은 질문을 생략»을 넣었다가 걷어냈다 — confidence 가 재는 것은 «1위 후보가 더
 * 바뀌지 않는다»이지 «남은 질문이 무의미하다»가 아니기 때문이다. 생략은 곧
 * 우리가 답을 대신 정하는 것이었고, 그 대상이 하필 키오스크 앞에서 통제권이
 * 가장 적은 사용자였다. 무엇을 주문할지는 사용자가 정한다.
 */
export function QuestionScreen() {
  const {
    q, qIndex, setQIndex, answers, setAnswers, askPos, askTotal, carried,
    simple, a11y, answered, advance, setStep, setEditOpen, nextToAsk, staffBtn,
  } = useFlow();

  if (!q) return null;

  return (
    <section className="card" aria-labelledby="qtitle">
      <p className="stepmeta">질문 {askPos + 1} / {askTotal}</p>
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
  );
}
