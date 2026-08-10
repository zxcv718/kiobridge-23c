import React from "react";
import { useFlow } from "../flow";
import { FLOW_STEPS, PRESETS, savedSummary} from "../model";
import { candidateName } from "../logic";
import { Cta, StepIndicator } from "../components";
import "./profile.css";

/**
 * 화면목록 S01 — 시작 화면. Figma 150:162(S01a 최초 방문) · 150:190(S01b 재방문).
 * 두 시안은 같은 화면이고, 저장본이 있으면 카드가 하나 늘어난다.
 *
 * 디자인의 «시작하기»는 곧바로 주문이 아니라 **프로필 생성으로** 간다(5단계 인디케이터의
 * 1→2단계). 화면 설정을 먼저 맞추고 주문에 들어가는 것이 이 흐름의 요지다.
 *
 * 되살리기 버튼은 **하나뿐이다.** 무엇을 되살릴지는 저장할 때 이미 정해졌기 때문이다.
 * 여기서 "전부 쓸까 / 설정만 쓸까"를 또 물으면 같은 결정을 두 번 묻는 것이고,
 * 실제로 두 선택지가 하는 일이 같아진다. 그래서 버튼 라벨이 저장본에 실제로
 * 들어 있는 답변을 보고 "무슨 일이 일어나는지"를 그대로 말한다.
 *
 * 시연 사례 카드는 디자인에 없지만 남긴다 — 심사 시연에서 각 경로를 그 자리에서
 * 보여주는 유일한 수단이고, 결과를 미리 정해 두지 않는다는 사실도 여기서 밝힌다.
 */
export function Home() {
  const {
    saved, fixture, savedCoversAll, startFromSaved, deleteSaved, setStep, staffBtn, applyPreset, t,
  } = useFlow();

  return (
    <>
      <StepIndicator labels={FLOW_STEPS} current={1} />

      {saved && fixture && (
        <section className="card" style={{ borderColor: "var(--brand)", borderWidth: 2 }} aria-label="이 기기에 저장된 기록">
          <p className="p-eyebrow">다시 오셨네요</p>
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
            <Cta tone="primary" disabled={!fixture} onClick={startFromSaved}
              label={savedCoversAll ? "지난번과 똑같이 주문하기" : "저장된 설정으로 시작하기"} />
            <Cta tone="danger" label="기록 지우기" onClick={deleteSaved} />
            {staffBtn()}
          </div>
        </section>
      )}

      <section className="card">
        {!saved && <p className="p-eyebrow">KioBridge에 오신 걸 환영해요</p>}
        <h2>닭강정 가게 주문을 도와드릴게요</h2>
        <p className="hint">
          몇 가지만 여쭤보고 화면을 맞춰 드릴게요.{" "}
          {t(
            "로그인이 없습니다. 답해 주신 내용은 이번 한 번만 쓰고 저장하지 않습니다. 추천 뒤에 확인을 거치고, 결제 직전에 멈춥니다.",
            "로그인 없이 바로 시작합니다. 답해 주신 내용은 이번 한 번만 사용하고 저장하지 않는 것이 기본이며, 저장할지는 프로필을 만든 뒤 «저장 방식» 단계에서 한 번만 여쭤봅니다. 추천 뒤에는 반드시 확인을 거치며, 결제 직전(장바구니 확인)에서 멈춥니다.",
          )}
        </p>
        <div className="btnrow">
          {/* 디자인의 단일 CTA. 저장본이 있을 때만 «새로»를 붙여 되살리기와 구별한다 */}
          <Cta tone={saved ? "white" : "primary"} disabled={!fixture} onClick={() => setStep("profile")}
            label={saved ? "처음부터 새로 시작하기" : "시작하기"} />
          {/* 주문까지 가지 않고 화면 설정만 바꾸러 오는 길 — 같은 화면에서 «설정 마치기»로 돌아온다 */}
          <Cta label="화면·안내 설정" onClick={() => setStep("profile")} />
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
