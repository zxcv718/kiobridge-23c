import React from "react";

/**
 * 상태 알약.
 *
 * 강조색 글씨를 강조색 바탕에 얹지 않는다 — 그 조합은 바탕을 아무리 밝혀도
 * 4.21:1 이 한계라 본문 기준(4.5)을 넘지 못한다. 글씨는 본문색으로 두고
 * 강조는 바탕과 테두리가 맡는다. 색은 여기서 유일한 신호가 아니다.
 */
export function Badge({ children, tone }: {
  children: React.ReactNode;
  tone?: "warn" | "danger";
}) {
  return <span className={tone ? `kb-badge ${tone}` : "kb-badge"}>{children}</span>;
}
