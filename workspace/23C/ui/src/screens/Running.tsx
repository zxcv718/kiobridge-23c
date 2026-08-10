import React from "react";
import { useFlow } from "../flow";

/**
 * 가상 키오스크 실행 중.
 *
 * 조작 요소가 없는 진행 표시라 직원 도움 버튼을 두지 않는다 — 그 예외는
 * tests/a11y.test.ts 의 면제 목록에 이유와 함께 적혀 있다. 진행 상황은
 * App.tsx 의 aria-live 영역이 화면 낭독기에 함께 알린다.
 */
export function Running() {
  const { runLog } = useFlow();

  return (
    <section className="card">
      <h2>가상 키오스크에서 실행 중입니다…</h2>
      <ul className="runlog">{runLog.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </section>
  );
}
