import React from "react";
import { useFlow } from "../flow";
import { Screen } from "../components";
import "./question.css";

/**
 * 화면목록 S11 — 계산 중 (Figma 99:1239).
 *
 * 결과는 이미 계산돼 있고 화면만 거친다. 기다리는 척하는 게 아니라, 답이
 * 반영됐다는 것을 알리는 단계다. 여기서도 직원 도움으로 빠져나갈 수 있어야 한다.
 *
 * 디자인은 뒤로가기도 진행 표시도 없이 **화면 한가운데** 문구 두 줄과 도는 고리만
 * 둔다. 그 배치를 그대로 따른다(question.css 의 `:has(.calcspin)`). 한때 여기에
 * «답해 주신 내용» 목록을 붙였지만 걷었다(기획 2026-08-12, 전면 대조) — 시안에 없는
 * 요소이고, 답은 바로 다음 화면(메뉴 확인)이 조건 문장으로 어차피 다시 말한다.
 */
export function Calculating() {
  const { t } = useFlow();

  return (
    <Screen
      label="추천 계산 중"
      busy
      title={t("메뉴를 찾고 있어요", "추천할 메뉴를 찾고 있어요")}
      subtitle="잠시만 기다려 주세요"
    >
      {/* 도는 고리는 장식이다 — 진행 중이라는 뜻은 위 문구와 aria-busy 가 전한다 */}
      <div className="calcspin" aria-hidden="true" />
    </Screen>
  );
}
