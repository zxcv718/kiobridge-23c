import React from "react";
import { useFlow } from "../flow";
import { Cta, Emphasize, Screen } from "../components";
import { candidateName, candidatePrice, withManualSelection } from "../logic";
import "./cart.css";
import "./recommend.css";

/**
 * 추천 결과 — 이유·제외·대안·거절·직원 도움.
 *
 * **디자인에는 이 화면이 없다.** 시안은 계산 → 메뉴 확인 → 장바구니로 곧장 가지만,
 * 이 화면이 제출 선언 셋(recommendationReasonsShown · alternativesShown ·
 * recommendationCanBeRejected)을 지고 있어 없앨 수 없다. 우리 차별점인
 * «이런 메뉴는 제외했어요»도 여기에 있다.
 *
 * 그래서 화면은 남기되 **다른 화면과 같은 문법으로 다시 그렸다** — 뒤로가기 →
 * «고객님,» → 큰 제목 → 내용 → 화면 아래 붙는 CTA. 예전에는 카드 세 장(추천·대안·제외)이
 * 쌓여 있었는데, 카드가 겹칠수록 «어느 것이 이 화면의 답인가»가 흐려진다. 지금은
 * 추천 메뉴 한 상자를 머리에 두고 그 아래로 «왜 이것인가 → 다른 것 → 뺀 것»이
 * 한 줄기로 이어진다. 답이 하나라는 사실이 배치로 드러난다.
 *
 * 재확인이 필요한 상태에서는 승인 버튼이 **비활성화**된다. 확실하지 않은 정보를
 * 임의로 판단해서 진행하지 않는다는 계약이 화면에서도 그대로 지켜져야 한다.
 */
export function Recommend() {
  const { uiRec, fixture, setUiRec, setManual, openEdit, setStep, staffBtn } = useFlow();
  if (!uiRec || !fixture) return null;

  const rec = uiRec.rec;
  const blocked = rec.requiresReconfirmation;
  /* 뒤로는 질문으로 돌아간다. 추천은 답의 결과이므로 «앞»은 언제나 질문이고,
     조건을 통째로 손보는 길(조건 수정)은 아래 CTA 에 따로 있다. */
  const back = () => setStep("wizard");

  if (rec.recommendedCandidateId === null) {
    return (
      <Screen
        label="추천 결과"
        onBack={back}
        eyebrow="고객님,"
        title={<Emphasize text="조건에 맞는 메뉴가 없어요" word="없어요" />}
        subtitle="조건을 조금 바꾸면 찾을 수 있습니다."
        actions={
          <>
            <Cta tone="primary" label="조건 수정하기" onClick={openEdit} />
            {staffBtn()}
          </>
        }
      >
        <section className="q-sec">
          <h3 className="q-sechead">이렇게 찾아봤어요</h3>
          <ul className="reasons">{rec.recommendationReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </section>
      </Screen>
    );
  }

  return (
    <Screen
      label="추천 결과"
      onBack={back}
      eyebrow="고객님,"
      title={<Emphasize text="이런 메뉴는 어떠세요?" word="이런 메뉴" />}
      actions={
        <>
          {/* 곧바로 장바구니 확인으로 가지 않는다. 이 화면은 «왜 이것인가»(이유·대안·제외)를
              한꺼번에 보여주느라 빽빽하다. 메뉴 확인이 그것을 한 문장으로 정리하고
              «이 메뉴가 맞습니까» 하나만 묻는다. */}
          <Cta tone="primary" label="네, 좋아요" disabled={blocked} onClick={() => setStep("menuConfirm")} />
          <div className="q-actrow">
            <button type="button" className="btn ghost" onClick={openEdit}>조건 수정</button>
            <button type="button" className="btn danger" onClick={() => setStep("start")}>추천 거절</button>
            {staffBtn()}
          </div>
        </>
      }
    >
      {blocked && (
        <div className="banner warn" role="alert">
          확실하지 않은 정보가 있어요. 임의로 판단하지 않습니다 — 알레르기 항목을 다시 확인해 주시거나, 직원 도움을 이용해 주세요.
        </div>
      )}

      {/* 추천 메뉴 — 메뉴 확인 화면과 같은 상자를 쓴다. 두 화면이 같은 메뉴를 말하는데
          모양이 다르면 사용자는 다른 것을 보고 있다고 생각한다. */}
      <div className="cart-box">
        <p className="cart-cap">추천 메뉴</p>
        <div className="cart-menuline">
          <span className="cart-name">{candidateName(fixture, rec.recommendedCandidateId)}</span>
          <span className="cart-price">{candidatePrice(fixture, rec.recommendedCandidateId)?.toLocaleString()}원</span>
        </div>
      </div>

      {rec.unmetConditions && rec.unmetConditions.length > 0 && (
        <div className="banner warn">다만: {rec.unmetConditions.join(" · ")}</div>
      )}

      <section className="q-sec">
        <h3 className="q-sechead">왜 이 메뉴인가요?</h3>
        <ul className="reasons" aria-label="추천 이유">
          {rec.recommendationReasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </section>

      {rec.alternativeCandidateIds.length > 0 && (
        <section className="q-sec">
          <h3 className="q-sechead">다른 선택지도 있어요</h3>
          <ul className="q-alts">
            {rec.alternativeCandidateIds.map((id) => (
              <li key={id}>
                <span className="q-altname">{candidateName(fixture, id)}</span>
                <span className="cart-price">{candidatePrice(fixture, id)?.toLocaleString()}원</span>
                <button type="button" className="btn ghost"
                  onClick={() => { setUiRec(withManualSelection(uiRec, fixture, id)); setManual(true); }}>
                  이걸로 할래요
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rec.excludedCandidates.length > 0 && (
        <section className="q-sec">
          <h3 className="q-sechead">이런 메뉴는 제외했어요</h3>
          <ul className="q-excl">
            {rec.excludedCandidates.map((e) => (
              <li key={e.candidateId}>
                <b>{candidateName(fixture, e.candidateId)}</b> — {e.explanation ?? e.reasonCode}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  );
}
