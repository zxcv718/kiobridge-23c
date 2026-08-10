import React from "react";
import { useFlow } from "../flow";
import { EDIT_LABELS, QUESTIONS, answerLabel } from "../model";

/**
 * 화면목록 S11 — 계산 중.
 *
 * 결과는 이미 계산돼 있고 화면만 거친다. 기다리는 척하는 게 아니라, 답이
 * 반영됐다는 것을 알리는 단계다. 여기서도 직원 도움으로 빠져나갈 수 있어야 한다.
 */
export function Calculating() {
  const { t, answers, staffBtn } = useFlow();

  return (
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
  );
}
