import React from "react";
import { useFlow } from "../flow";
import { A11Y_ITEMS, PROBE_RESULT, PROBE_SAMPLE, PROBE_SIZES } from "../model";

/**
 * 화면목록 S02 — 프로필(화면·안내) 설정.
 *
 * 설정 이름 대신 **실제 크기로 렌더한 문장**을 보여주고 보이는지만 묻는다.
 * 판단 대상이 «무엇을 켜야 나에게 맞는가»가 아니라 «내 눈에 보이는가»가 된다.
 * 산출 결과는 곧바로 반영하되 아래 토글에서 언제든 바꿀 수 있게 둔다 —
 * 자동으로 정해 놓고 못 바꾸게 하면 «자동으로 불러온 정보의 재확인»에 어긋난다.
 */
export function ProfileSetup() {
  const { a11y, setA11y, setFlag, probeStep, setProbeStep, probeResult, setProbeResult, setStep, staffBtn } = useFlow();

  return (
    <section className="card" aria-label="화면과 안내 설정">
      <h2>화면과 안내를 맞춰 드릴게요</h2>
      <p className="hint">켜면 이 화면이 바로 바뀝니다. 언제든 다시 끌 수 있습니다.</p>

      {probeStep === null ? (
        <div className="btnrow" style={{ marginBottom: 18 }}>
          <button type="button" className="btn ghost" onClick={() => { setProbeStep(0); setProbeResult(null); }}>
            화면 글씨 맞춰보기
          </button>
          {probeResult !== null && (
            <span className="hint">
              {probeResult === 0 && "기본 크기로 두었습니다."}
              {probeResult === 1 && "큰 글씨를 켰습니다."}
              {probeResult === 2 && "큰 글씨·고대비·그림 안내를 켰습니다."}
              {" "}아래에서 언제든 바꾸실 수 있습니다.
            </span>
          )}
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 18 }} aria-labelledby="probehead">
          <h2 id="probehead">화면 글씨가 잘 보이시나요?</h2>
          <p aria-hidden="true" style={{ fontSize: PROBE_SIZES[probeStep], fontWeight: 700, margin: "18px 0" }}>
            {PROBE_SAMPLE}
          </p>
          <p className="hint">위 문장이 편하게 읽히시면 «잘 보여요»를 눌러 주세요.</p>
          <div className="choices" role="group" aria-label="글씨 크기 확인">
            <button type="button" className="choice" onClick={() => {
              setA11y((s) => ({ ...s, ...PROBE_RESULT[probeStep] }));
              setProbeResult(probeStep); setProbeStep(null);
            }}>잘 보여요</button>
            <button type="button" className="choice" onClick={() => {
              if (probeStep < PROBE_SIZES.length - 1) { setProbeStep(probeStep + 1); return; }
              const last = PROBE_SIZES.length - 1;
              setA11y((s) => ({ ...s, ...PROBE_RESULT[last] }));
              setProbeResult(last); setProbeStep(null);
            }}>조금 작아요</button>
          </div>
        </div>
      )}

      <div className="a11ylist">
        {A11Y_ITEMS.map((it) => (
          <button key={it.key} type="button" className="a11yrow" aria-pressed={a11y[it.key] === true}
            onClick={() => setFlag(it.key, !(a11y[it.key] as boolean))}>
            <span className="alabel">{it.label}</span>
            <span className="aeffect">{it.effect}</span>
            <span className="astate">{a11y[it.key] ? "켬" : "끔"}</span>
          </button>
        ))}
      </div>

      <h2 style={{ marginTop: 22 }}>어떻게 입력하시겠어요?</h2>
      <div className="choices" role="group" aria-label="입력 방식">
        <button type="button" className="choice" aria-pressed={a11y.preferredInput === "TOUCH"}
          onClick={() => setFlag("preferredInput", "TOUCH")}>직접 누르기</button>
        <button type="button" className="choice" aria-pressed={a11y.preferredInput === "ASSISTED"}
          onClick={() => setFlag("preferredInput", "ASSISTED")}>
          옆에서 도와주기<small>보호자·직원이 대신 눌러 주는 경우</small>
        </button>
      </div>
      <p className="hint">
        도와주기를 고르시면 입력 출처를 <b>대리 입력</b>으로 기록합니다. 본인 확인을 대신하지는 않습니다.
        {" "}음성 입력은 이번 버전에 없습니다 — 없는 기능을 있다고 표시하지 않습니다.
      </p>
      <div className="btnrow">
        <button type="button" className="btn primary" onClick={() => setStep("start")}>설정 마치기</button>
        {staffBtn()}
      </div>
    </section>
  );
}
