import React from "react";
import { useFlow } from "../flow";

/**
 * 직원 호출.
 *
 * 어느 화면에서든 여기로 나올 수 있다 — 막다른 길을 만들지 않는다는 약속이
 * 실제로 지켜지는지는 tests/a11y.test.ts 가 화면 파일마다 검사한다.
 * (이 화면 자신은 면제 대상이다. 직원 도움 화면에 직원 도움 버튼은 없다.)
 */
export function StaffHelp() {
  const { setStep } = useFlow();

  return (
    <section className="card">
      <h2>직원을 불러 드릴게요</h2>
      <p className="hint">
        막히는 단계가 있으면 언제든 이 버튼으로 나올 수 있습니다 — 막다른 길을 만들지 않습니다.
        (시뮬레이션이므로 실제 호출은 일어나지 않습니다.)
      </p>
      <div className="btnrow">
        <button type="button" className="btn primary" onClick={() => setStep("start")}>처음으로 돌아가기</button>
      </div>
    </section>
  );
}
