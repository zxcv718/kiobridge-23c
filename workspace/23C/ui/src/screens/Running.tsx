import React from "react";
import { useFlow } from "../flow";
import { Emphasize, Screen } from "../components";

/**
 * 가상 키오스크 실행 중.
 *
 * 대응하는 시안이 없어 다른 화면과 같은 문법으로 짰다. 다만 이 화면에는
 * **CTA 가 없다** — 1초쯤 지나가는 진행 표시이고, 조작 요소를 두면 누를 새도 없이
 * 사라지는 버튼이 된다. 그래서 직원 도움 버튼도 두지 않으며, 그 예외는
 * tests/a11y.test.ts 의 면제 목록에 이유와 함께 적혀 있다.
 *
 * 진행 상황은 App.tsx 의 aria-live 영역이 화면 낭독기에 함께 알린다.
 */
export function Running() {
  const { runLog } = useFlow();

  return (
    <Screen
      label="가상 키오스크 실행 중"
      busy
      eyebrow="잠시만 기다려 주세요"
      title={<Emphasize text="가상 키오스크에서 실행 중입니다" word="실행 중" />}
    >
      <ul className="runlog">{runLog.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </Screen>
  );
}
