import React from "react";

/**
 * 상태 알약 — 시안의 pill (메뉴 확인 99:1762 「✓ 추천해요」).
 *
 * 시안은 **가라앉은 회색 바탕에 테두리 없이** 두고, 표식(✓)만 Bold, 말은 Regular 다.
 * 한때 강조색 바탕 + 강조색 테두리 + 전체 Bold 였다. 알약 하나가 화면에서 가장
 * 강한 요소가 되어, 정작 답인 메뉴 이름보다 먼저 눈에 들어왔다.
 *
 * 표식을 `mark` 로 따로 받는 이유는 굵기가 갈리기 때문이다. 문자열 하나로 받으면
 * («✓ 추천해요») CSS 로는 앞 글자만 굵게 할 방법이 없다 — `::first-letter` 는
 * 블록 컨테이너에만 걸리고 이건 inline-flex 다.
 *
 * 강조색 글씨를 강조색 바탕에 얹지 않는 원칙은 그대로다 — 그 조합은 바탕을 아무리
 * 밝혀도 4.21:1 이 한계라 본문 기준(4.5)을 넘지 못한다. 색은 여기서 유일한 신호가
 * 아니고, 표식과 말이 함께 뜻을 진다.
 */
export function Badge({ mark, children }: {
  /** 앞에 붙는 표식. 장식이므로 읽어 주지 않는다 — 뜻은 뒤의 말이 진다. */
  mark?: string;
  children: React.ReactNode;
}) {
  return (
    <span className="kb-badge">
      {mark && <b className="kb-badgemark" aria-hidden="true">{mark}</b>}
      {children}
    </span>
  );
}
