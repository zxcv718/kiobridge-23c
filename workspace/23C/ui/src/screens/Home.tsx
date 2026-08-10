import React from "react";
import { useFlow } from "../flow";
import { PRESETS, savedSummary } from "../model";
import { candidateName } from "../logic";

/**
 * 화면목록 S01 — 시작 화면. 최초 방문(S01a)과 재방문(S01b)이 같은 화면이고,
 * 저장본이 있으면 카드가 하나 늘어난다.
 *
 * 되살리기 버튼은 **하나뿐이다.** 무엇을 되살릴지는 저장할 때 이미 정해졌기 때문이다.
 * 여기서 "전부 쓸까 / 설정만 쓸까"를 또 물으면 같은 결정을 두 번 묻는 것이고,
 * 실제로 두 선택지가 하는 일이 같아진다. 그래서 버튼 라벨이 저장본에 실제로
 * 들어 있는 답변을 보고 "무슨 일이 일어나는지"를 그대로 말한다.
 */
export function Home() {
  const {
    saved, fixture, savedCoversAll, startFromSaved, deleteSaved, startWizard,
    applyPreset, setStep, staffBtn, t,
  } = useFlow();

  return (
    <>
      {saved && fixture && (
        <section className="card" style={{ borderColor: "var(--brand)", borderWidth: 2 }} aria-label="이 기기에 저장된 기록">
          <h2>이 기기에 지난번 기록이 있어요</h2>
          <p className="hint" style={{ fontSize: "1em", color: "var(--fg)" }}>{savedSummary(saved)}</p>
          {saved.lastCandidateId && (
            <p className="hint" style={{ fontSize: "1em", color: "var(--fg)" }}>
              지난번에 고르신 메뉴 — {candidateName(fixture, saved.lastCandidateId)}
            </p>
          )}
          <p className="hint">
            자동으로 적용하지 않습니다 — 내용을 확인하시고 골라 주세요.
            {savedCoversAll
              ? " 저장해 두신 항목은 다시 여쭤보지 않고 확인 화면으로 넘어갑니다."
              : " 저장돼 있지 않은 항목만 다시 여쭤봅니다."}
          </p>
          <div className="btnrow">
            <button type="button" className="btn primary" onClick={startFromSaved} disabled={!fixture}>
              {savedCoversAll ? "지난번과 똑같이 주문하기" : "저장된 설정으로 시작하기"}
            </button>
            <button type="button" className="btn danger" onClick={deleteSaved}>기록 지우기</button>
            {staffBtn()}
          </div>
        </section>
      )}

      <section className="card">
        <h2>닭강정 가게 주문을 도와드릴게요</h2>
        <p className="hint">
          {t(
            "로그인이 없습니다. 답해 주신 내용은 이번 한 번만 쓰고 저장하지 않습니다. 추천 뒤에 확인을 거치고, 결제 직전에 멈춥니다.",
            "로그인 없이 바로 시작합니다. 답해 주신 내용은 이번 한 번만 사용하고 저장하지 않는 것이 기본이며, 원하시면 마지막 확인 단계에서 이 기기에 저장을 선택할 수 있습니다. 추천 뒤에는 반드시 확인을 거치며, 결제 직전(장바구니 확인)에서 멈춥니다.",
          )}
        </p>
        <div className="btnrow">
          <button type="button" className={saved ? "btn ghost" : "btn primary"} onClick={startWizard} disabled={!fixture}>
            {saved ? "처음부터 새로 시작하기" : "이번 한 번만 시작하기"}
          </button>
          <button type="button" className="btn ghost" onClick={() => setStep("profile")}>화면·안내 설정</button>
          {staffBtn()}
        </div>
      </section>

      <section className="card presets" aria-label="시연 사례">
        <h2>시연 사례로 바로 보기</h2>
        <p className="hint">
          아래 버튼은 <b>입력만 채웁니다.</b> 추천은 직접 입력했을 때와 똑같은 엔진이 그 자리에서 계산합니다 —
          미리 만들어 둔 결과 화면이 아닙니다.
        </p>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="presetrow" onClick={() => applyPreset(p)} disabled={!fixture}>
            <span className="ptitle">{p.title}</span>
            <span className="pshows">{p.shows}</span>
          </button>
        ))}
      </section>
    </>
  );
}
