import React from "react";
import { useFlow } from "../flow";
import { GROUP_KO, OPTION_KO } from "../model";
import { buildExecutionPlanCore, explainSelections } from "../../../src/core/plan";
import { candidateName, candidatePrice } from "../logic";

/**
 * 화면목록 S13 — 장바구니(최종) 확인.
 *
 * 실제로 만들어질 실행계획을 그대로 읽어 보여준다 — 화면과 계획이 어긋날 수 없다.
 * 필수 옵션은 "상관없어요"여도 하나가 정해지므로 그 사실을 숨기지 않고,
 * 각 값이 어떻게 정해졌는지(USER·AUTO·SUBSTITUTED)를 구분해 밝힌다.
 *
 * 이 화면에서는 주문만 확인한다. 저장 얘기는 주문이 끝난 뒤에 한 번 묻는다(S15) —
 * 뒷사람 눈치가 최고조인 순간에 다음 방문에 관한 판단을 시키지 않는다.
 */
export function CartReview() {
  const {
    uiRec, fixture, live, sessionInput, setSessionInput, runSimulation,
    setStep, openEdit, confirmOffline, staffBtn,
  } = useFlow();
  if (!uiRec || !fixture) return null;

  const qty = Number(uiRec.engineCtx.preferences.quantity ?? 1);
  const preview = buildExecutionPlanCore(
    { approved: true, decision: "APPROVE" }, uiRec.rec, fixture, uiRec.engineCtx,
  );
  const sels = explainSelections(fixture, preview, uiRec.engineCtx);
  const need = sels.filter((x) => x.origin !== "USER");

  return (
    <section className="card">
      <h2>마지막으로 확인해 주세요</h2>
      <dl className="summary">
        <dt>메뉴</dt><dd>{candidateName(fixture, uiRec.rec.recommendedCandidateId)}</dd>
        <dt>수량</dt><dd>{qty}개</dd>
        <dt>이용 방식</dt><dd>{uiRec.engineCtx.preferences.serviceType === "TAKE_OUT" ? "포장" : uiRec.engineCtx.preferences.serviceType === "DINE_IN" ? "매장" : "메뉴 기본값"}</dd>
      </dl>
      <p className="total">
        합계 {((candidatePrice(fixture, uiRec.rec.recommendedCandidateId) ?? 0) * qty).toLocaleString()}원
      </p>

      {sels.length > 0 && (
        <>
          <h3 className="selhead">키오스크에서 이렇게 선택합니다</h3>
          <ul className="sellist">
            {sels.map((x) => (
              <li key={x.groupId} data-origin={x.origin}>
                <span className="sg">{GROUP_KO[x.groupId] ?? x.groupId}</span>
                <span className="sv">{OPTION_KO[x.id] ?? x.id}</span>
                <span className="so">
                  {x.origin === "USER" && "고르신 대로"}
                  {x.origin === "AUTO" && "상관없다고 하셔서 이 메뉴의 값으로 정했습니다"}
                  {x.origin === "SUBSTITUTED" &&
                    `원하신 ${OPTION_KO[x.wanted!] ?? x.wanted}는 이 메뉴에 없어 바꿨습니다`}
                </span>
              </li>
            ))}
          </ul>
          {need.length > 0 && (
            <div className="btnrow" style={{ marginTop: 4, marginBottom: 8 }}>
              <button type="button" className="btn ghost" onClick={() => setStep("recommend")}>다른 메뉴 보기</button>
              <button type="button" className="btn ghost" onClick={openEdit}>조건 바꾸기</button>
            </div>
          )}
        </>
      )}

      <div className="banner ok">가상 키오스크에서 장바구니 확인까지만 진행합니다. <b>실제 결제·주문은 일어나지 않습니다.</b></div>
      {live ? (
        <>
          <label className="field">공식 시뮬레이터 세션에 제출하기 (선택 — 시뮬레이터 화면의 세션 ID 입력)
            <input value={sessionInput} onChange={(e) => setSessionInput(e.target.value)} placeholder="예: SIM-20260806-003 (비우면 새 세션)" />
          </label>
          <div className="btnrow">
            <button type="button" className="btn ghost" onClick={() => setStep("recommend")}>← 되돌아가기</button>
            <button type="button" className="btn primary" onClick={runSimulation}>가상 키오스크에서 실행</button>
            {staffBtn()}
          </div>
        </>
      ) : (
        <div className="btnrow">
          <button type="button" className="btn ghost" onClick={() => setStep("recommend")}>← 되돌아가기</button>
          {/* 체험 모드에서도 주문은 끝까지 간다 — 계획을 만들어 보관하고 결과 화면에서 그 결말을 보여준다. */}
          <button type="button" className="btn primary" onClick={confirmOffline}>주문 확정하기</button>
          {staffBtn()}
        </div>
      )}
    </section>
  );
}
