import React from "react";
import { useFlow } from "../flow";

/**
 * 화면목록 S12 — 안전 중단.
 *
 * 재확인 2회째에도 확정되지 않았을 때 온다. 정상 종료가 아니라는 것과
 * **아무 준비도 시작되지 않았다는 것**을 함께 밝힌다(승인 전이므로 실행계획이
 * 비어 있다). 직원 도움이 첫 번째 버튼인 것이 이 화면의 존재 이유다.
 */
export function SafetyStop() {
  const { t, staffBtn, setReconfirmCount, setEditOpen, setStep } = useFlow();

  return (
    <section className="card" aria-labelledby="stophead">
      <div className="banner warn" role="alert">여기서 멈췄습니다 — 정상적으로 끝난 것이 아닙니다.</div>
      <h2 id="stophead">확인이 어려워 진행을 멈췄어요</h2>
      <p className="hint" style={{ fontSize: "1em", color: "var(--fg)" }}>
        {t(
          "두 번 여쭤봤는데도 확실하지 않았습니다. 어려우시면 직원을 불러주세요.",
          "두 번 확인을 요청드렸는데도 조건이 확실해지지 않았습니다. 임의로 판단해서 진행하지 않습니다 — 어려우시면 직원을 불러주세요.",
        )}
      </p>
      <p className="hint">
        <b>주문 준비는 시작되지 않았습니다.</b> 승인 전이므로 실행 계획이 만들어지지 않았고,
        장바구니에도 아무것도 담기지 않았습니다.
      </p>
      <div className="btnrow">
        {staffBtn("btn primary")}
        <button type="button" className="btn ghost"
          onClick={() => { setReconfirmCount(0); setEditOpen("allergies"); setStep("edit"); }}>
          조건 다시 보기
        </button>
        <button type="button" className="btn ghost" onClick={() => setStep("start")}>처음으로</button>
      </div>
    </section>
  );
}
