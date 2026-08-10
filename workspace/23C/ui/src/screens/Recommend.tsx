import React from "react";
import { useFlow } from "../flow";
import { candidateName, candidatePrice, withManualSelection } from "../logic";

/**
 * 추천 결과 — 이유·제외·대안·거절·직원 도움.
 *
 * 재확인이 필요한 상태에서는 승인 버튼이 **비활성화**된다. 확실하지 않은 정보를
 * 임의로 판단해서 진행하지 않는다는 계약이 화면에서도 그대로 지켜져야 한다.
 */
export function Recommend() {
  const { uiRec, fixture, setUiRec, setManual, openEdit, setStep, staffBtn } = useFlow();
  if (!uiRec || !fixture) return null;

  return (
    <section>
      {uiRec.rec.requiresReconfirmation && (
        <div className="banner warn" role="alert">
          확실하지 않은 정보가 있어요. 임의로 판단하지 않습니다 — 알레르기 항목을 다시 확인해 주시거나, 직원 도움을 이용해 주세요.
        </div>
      )}
      {uiRec.rec.recommendedCandidateId === null ? (
        <div className="card">
          <h2>조건에 맞는 메뉴가 없습니다</h2>
          <ul className="reasons">{uiRec.rec.recommendationReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <div className="btnrow">
            <button type="button" className="btn primary" onClick={openEdit}>조건 수정하기</button>
            {staffBtn()}
          </div>
        </div>
      ) : (
        <>
          <div className="card recwrap">
            <p className="stepmeta">이런 메뉴는 어떠세요?</p>
            <h2>{candidateName(fixture, uiRec.rec.recommendedCandidateId)}
              {" "}<span className="price">{candidatePrice(fixture, uiRec.rec.recommendedCandidateId)?.toLocaleString()}원</span></h2>
            <ul className="reasons" aria-label="추천 이유">
              {uiRec.rec.recommendationReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            {uiRec.rec.unmetConditions && uiRec.rec.unmetConditions.length > 0 && (
              <div className="banner warn">다만: {uiRec.rec.unmetConditions.join(" · ")}</div>
            )}
            <div className="btnrow">
              <button type="button" className="btn primary"
                disabled={uiRec.rec.requiresReconfirmation}
                /* 곧바로 장바구니 확인으로 가지 않는다. 이 화면은 «왜 이것인가»(이유·대안·제외)를
                   한꺼번에 보여주느라 빽빽하다. 메뉴 확인(신규)이 그것을 한 문장으로 정리하고
                   «이 메뉴가 맞습니까» 하나만 묻는다. */
                onClick={() => setStep("menuConfirm")}>네, 좋아요</button>
              <button type="button" className="btn ghost" onClick={openEdit}>조건 수정</button>
              <button type="button" className="btn danger" onClick={() => setStep("start")}>추천 거절</button>
              {staffBtn()}
            </div>
          </div>

          {uiRec.rec.alternativeCandidateIds.length > 0 && (
            <div className="card">
              <h2>다른 선택지도 있어요</h2>
              {uiRec.rec.alternativeCandidateIds.map((id) => (
                <div className="altcard" key={id}>
                  <span><b>{candidateName(fixture, id)}</b> <span className="price">{candidatePrice(fixture, id)?.toLocaleString()}원</span></span>
                  <button type="button" className="btn ghost" onClick={() => { setUiRec(withManualSelection(uiRec, fixture, id)); setManual(true); }}>이걸로 할래요</button>
                </div>
              ))}
            </div>
          )}

          {uiRec.rec.excludedCandidates.length > 0 && (
            <div className="card">
              <h2>이런 메뉴는 제외했어요</h2>
              {uiRec.rec.excludedCandidates.map((e) => (
                <p className="excluded" key={e.candidateId}><b>{candidateName(fixture, e.candidateId)}</b> — {e.explanation ?? e.reasonCode}</p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
