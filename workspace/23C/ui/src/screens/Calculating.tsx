import React from "react";
import { useFlow } from "../flow";
import { Screen } from "../components";
import { EDIT_LABELS, QUESTIONS, answerLabel } from "../model";
import "./question.css";

/**
 * 화면목록 S11 — 계산 중 (Figma 99:1239).
 *
 * 결과는 이미 계산돼 있고 화면만 거친다. 기다리는 척하는 게 아니라, 답이
 * 반영됐다는 것을 알리는 단계다. 여기서도 직원 도움으로 빠져나갈 수 있어야 한다.
 *
 * 디자인은 뒤로가기도 진행 표시도 없이 **화면 한가운데** 문구 두 줄과 도는 고리만
 * 둔다. 그 배치를 그대로 따르되(question.css 의 `:has(.calcspin)`), 우리는 여기에
 * «답해 주신 내용»과 직원 도움을 남긴다 — 무엇을 근거로 계산하는지는 결과가 나오기
 * 전에 밝히는 편이 낫고, 화면이 잠깐 지나가더라도 막다른 길이면 안 된다.
 */
export function Calculating() {
  const { t, answers, staffBtn } = useFlow();

  return (
    <Screen
      label="추천 계산 중"
      busy
      title={t("메뉴를 찾고 있어요", "추천할 메뉴를 찾고 있어요")}
      subtitle="잠시만 기다려 주세요"
      actions={staffBtn()}
    >
      {/* 도는 고리는 장식이다 — 진행 중이라는 뜻은 위 문구와 aria-busy 가 전한다 */}
      <div className="calcspin" aria-hidden="true" />
      <ul className="calc-answers" aria-label="지금까지 답해 주신 내용">
        {QUESTIONS.filter((q) => answers[q.key] !== undefined).map((q) => (
          <li key={q.key}>{EDIT_LABELS[q.key] ?? q.key} — {answerLabel(q.key, answers[q.key])}</li>
        ))}
      </ul>
    </Screen>
  );
}
