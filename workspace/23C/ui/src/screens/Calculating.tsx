import React from "react";
import { useFlow } from "../flow";
import { EDIT_LABELS, QUESTIONS, answerLabel } from "../model";
import "./question.css";

/**
 * 화면목록 S11 — 계산 중 (Figma 99:1239).
 *
 * 결과는 이미 계산돼 있고 화면만 거친다. 기다리는 척하는 게 아니라, 답이
 * 반영됐다는 것을 알리는 단계다. 여기서도 직원 도움으로 빠져나갈 수 있어야 한다.
 *
 * 디자인은 문구 두 줄과 도는 고리만 두었지만 «답해 주신 내용»을 남긴다 —
 * 무엇을 근거로 계산하는지는 결과가 나오기 전에 밝히는 편이 낫고, 이 화면은
 * 사용자가 되돌아갈 수 있는 마지막 자리이기도 하다.
 */
export function Calculating() {
  const { t, answers, staffBtn } = useFlow();

  return (
    <section className="card calcwrap" aria-labelledby="calchead" aria-busy="true">
      <h2 id="calchead">{t("메뉴를 찾고 있어요", "추천할 메뉴를 찾고 있어요")}</h2>
      <p className="calcsub">잠시만 기다려 주세요</p>
      {/* 도는 고리는 장식이다 — 진행 중이라는 뜻은 위 문구와 aria-busy 가 전한다 */}
      <div className="calcspin" aria-hidden="true" />
      <ul className="reasons" aria-label="지금까지 답해 주신 내용">
        {QUESTIONS.filter((q) => answers[q.key] !== undefined).map((q) => (
          <li key={q.key}>{EDIT_LABELS[q.key] ?? q.key} — {answerLabel(q.key, answers[q.key])}</li>
        ))}
      </ul>
      <div className="btnrow">{staffBtn()}</div>
    </section>
  );
}
