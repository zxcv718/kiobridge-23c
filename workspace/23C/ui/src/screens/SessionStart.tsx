import React from "react";
import { useFlow } from "../flow";

/**
 * S05 세션 시작 — **아직 만들지 않았다.**
 *
 * 자리만 뚫어 둔 것이다. 화면을 파일로 나눠 동시에 만들 참인데, 자리가 없으면
 * 사람마다 App.tsx 를 고쳐야 하고 그러면 한 파일에서 다시 줄을 서게 된다.
 * 담당: 레인 A
 *
 * 만들 것: 불러온 설정을 확인받고 이번 이용을 시작한다.
 *
 * 이 화면은 아직 어디에서도 갈 수 없다(라우팅 표에는 있지만 가는 길이 없다).
 * 미완성 명단은 tests/a11y.test.ts 의 PLACEHOLDER 가 들고 있고, 명단과 코드가
 * 어긋나면 테스트가 먼저 알려준다. 마지막에는 이 명단이 비어 있어야 한다.
 */
export const PLACEHOLDER = true;

export function SessionStart() {
  const { setStep, staffBtn } = useFlow();
  return (
    <section className="card" aria-label="S05 세션 시작">
      <h2>S05 세션 시작</h2>
      <p className="hint">이 화면은 아직 만들고 있습니다.</p>
      <div className="btnrow">
        <button type="button" className="btn ghost" onClick={() => setStep("start")}>처음으로</button>
        {staffBtn()}
      </div>
    </section>
  );
}
