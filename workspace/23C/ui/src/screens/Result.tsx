import React from "react";
import type { Evidence } from "@kiobridge/participant-sdk";
import { useFlow } from "../flow";
import { Card, type CardRow } from "../components";
import { INJECTIONS, STOP_KO, answerLabel } from "../model";
import { candidateName, candidatePrice, downloadSubmission, injectError, summarizeOrderPlan } from "../logic";
import "./cart.css";

/**
 * 결과 화면 (+ 화면목록 S15 «안내·저장» · Figma 99:1830).
 *
 * 공식 판정(PASS/stopType)은 키트 서버만 낼 수 있는 값이라, 서버가 없는 체험
 * 모드에서는 **쓰지 않는다.** 화면에 임의로 쓰면 가짜 판정이 되기 때문이다.
 * 대신 방금 만든 계획에서 직접 읽어낸 사실만 보여준다(summarizeOrderPlan).
 */
export function Result() {
  const {
    live, ev, outcome, runError, submitted, uiRec, fixture, setStep, answers, saved,
    storeToggle, toggleStore, t, errResults, setErrResults, staffBtn,
  } = useFlow();

  const plainFinish = !live && !ev && !runError && !(outcome && !outcome.valid);

  /* 저장된(또는 저장되지 않은) 내용 — 디자인의 RecentOrderCard(185:227) 다섯 줄.
     값은 이번 세션의 답변에서 그대로 읽는다. */
  const savedRows: CardRow[] = [
    { label: "메뉴명", value: fixture ? candidateName(fixture, uiRec?.rec.recommendedCandidateId ?? saved?.lastCandidateId ?? null) : "(없음)" },
    { label: "알레르기", value: answerLabel("allergies", answers.allergies) },
    { label: "맵기 선호", value: answerLabel("spicyLevel", answers.spicyLevel) },
    { label: "뼈/순살 선택", value: answerLabel("boneType", answers.boneType) },
    { label: "수량", value: answerLabel("quantity", answers.quantity) },
  ];

  return (
    <section>
      <div className="card">
        <h2>{plainFinish
          ? "주문이 완성되었습니다"
          : <>실행 결과 {ev ? (String(ev.result) === "PASS" ? <span className="pass">PASS</span> : <span className="fail">{String(ev.result)}</span>) : outcome && !outcome.valid ? <span className="fail">검증 거부</span> : runError ? <span className="fail">오류</span> : null}</>}</h2>
        {/* 이 화면은 길다. 직원 도움을 아래 버튼 줄에만 두면, 실행이 실패한 경우처럼
            아래 블록이 통째로 안 그려질 때 도움이 화면에서 사라진다 — 위에도 둔다. */}
        <div className="btnrow" style={{ marginTop: 10, marginBottom: 4 }}>{staffBtn()}</div>
        {runError && <div className="banner danger" role="alert">{runError}</div>}
        {outcome && !outcome.valid && (
          <div>
            <p className="hint">공식 검증기가 제출을 거부했습니다 — 코드가 고칠 위치를 알려줍니다.</p>
            {outcome.validationErrors.map((e, i) => <p className="excluded" key={i}><b>{e.code}</b> {e.path} — {e.message}</p>)}
          </div>
        )}
        {ev && (
          <>
            <div className="evgrid">
              <div className="evitem"><b>이 결과의 의미</b>형식·안전 검증 통과 (점수 아님)</div>
              <div className="evitem"><b>정지 유형</b>{STOP_KO[String(ev.stopType)] ?? String(ev.stopType)}</div>
              <div className="evitem"><b>장바구니 확인 화면</b>{ev.boundaryReached ? "도달함" : "도달 못 함"}</div>
              <div className="evitem"><b>읽기 전용 확인(verify_cart)</b>{ev.requiredVerifierExecuted ? "실행함" : "실행 안 됨"}</div>
              <div className="evitem"><b>결제 동작</b>{`계획 ${ev.plannedPaymentActionCount}건 · 실행 ${ev.executedPaymentActionCount}건 (0건이어야 통과)`}</div>
              <div className="evitem"><b>실제 기기로 간 명령</b>{ev.actualDeviceCommandSent ? "있음(문제!)" : "없음 — 시뮬레이션만"}</div>
            </div>
            <p className="hint">세션 {outcome?.sessionId} — 공식 시뮬레이터 화면(<code>localhost:3000</code>)에서 같은 세션이면 가상 키오스크 재생을 볼 수 있습니다.</p>

            {/* 두 파일은 방향이 반대다 — 이걸 구분해 주지 않으면 Evidence 를 업로드 칸에 넣게 된다.
                공식 시뮬레이터는 submission.profile 을 옵셔널 체이닝 없이 읽으므로
                Evidence 를 올리면 화면이 통째로 죽는다(ErrorBoundary 없음). */}
            <div className="dlnote">
              <b>내려받기 두 가지는 서로 다른 파일입니다.</b>
              <span><b>주문 계획</b> = 우리가 <u>만든 것</u>(입력). 공식 시뮬레이터 업로드 칸에는 <b>이 파일</b>을 넣으세요.</span>
              <span><b>실행 증거</b> = 서버가 <u>돌린 결과</u>(출력). 제출 자료용이며 업로드 칸에 넣으면 시뮬레이터가 멈춥니다.</span>
            </div>
            <div className="btnrow">
              <button type="button" className="btn primary" onClick={() => {
                if (submitted) downloadSubmission(submitted);
              }} disabled={!submitted}>주문 계획(제출물) 내려받기</button>
              <button type="button" className="btn ghost" onClick={() => {
                const blob = new Blob([JSON.stringify(ev, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob); a.download = "simulation-evidence.json"; a.click();
                URL.revokeObjectURL(a.href);
              }}>실행 증거(Evidence) 내려받기</button>
              <button type="button" className="btn ghost" onClick={() => setStep("start")}>처음으로</button>
              {staffBtn()}
            </div>
          </>
        )}

        {/* 체험 모드(서버 없음) — 방금 만든 "이 주문"의 결말을 보여준다. */}
        {!live && !ev && uiRec && fixture && submitted && (() => {
          const plan = summarizeOrderPlan(submitted, fixture);
          const qty = Number(uiRec.engineCtx.preferences.quantity ?? 1);
          const total = (candidatePrice(fixture, uiRec.rec.recommendedCandidateId) ?? 0) * qty;
          const excluded = uiRec.rec.excludedCandidates.length;
          return (
            <>
              <dl className="summary">
                <dt>메뉴</dt><dd>{candidateName(fixture, uiRec.rec.recommendedCandidateId)}</dd>
                <dt>수량</dt><dd>{qty}개</dd>
                <dt>이용 방식</dt>
                <dd>{uiRec.engineCtx.preferences.serviceType === "TAKE_OUT" ? "포장"
                  : uiRec.engineCtx.preferences.serviceType === "DINE_IN" ? "매장" : "메뉴 기본값"}</dd>
              </dl>
              <p className="total">합계 {total.toLocaleString()}원</p>
              {excluded > 0 && (
                <p className="hint">
                  고르실 수 없던 {excluded}가지는 이유를 알려드리고, 대신 고를 수 있는 것으로 안내했습니다.
                </p>
              )}

              <h3 className="selhead">이 주문이 키오스크에서 가는 길</h3>
              <div className="evgrid">
                <div className="evitem"><b>주문 단계</b>{plan.stepCount}단계</div>
                <div className="evitem"><b>마지막 화면</b>{plan.endsAtTitle}</div>
                <div className="evitem"><b>결제 동작</b>{plan.paymentActionCount}건</div>
                <div className="evitem"><b>실제 기기로 간 명령</b>{plan.deviceCommandSent ? "있음(문제!)" : "없음"}</div>
              </div>
              <p className="hint">
                {plan.stopsAtReviewBoundary ? (
                  <>이 주문은 <b>결제 직전 장바구니 확인 화면에서 멈춥니다.</b>{" "}
                    {plan.includesRequiredVerifier && "담긴 내용을 읽어서 확인하는 것까지가 끝이고, "}
                    결제는 사람이 직접 하도록 남겨 둡니다.</>
                ) : (
                  <>이 주문은 <b>{plan.endsAtTitle}</b>에서 끝납니다.</>
                )}
              </p>
              <div className="btnrow">
                <button type="button" className="btn primary" onClick={() => setStep("start")}>처음으로</button>
                <button type="button" className="btn ghost" onClick={() => downloadSubmission(submitted)}>
                  주문 계획(JSON) 내려받기
                </button>
                {staffBtn()}
              </div>
            </>
          );
        })()}
      </div>

      {/* 화면목록 S15 «안내·저장» — **묻는 곳이 아니라 알리는 곳이다.**
       *
       * 저장 여부는 프로필 단계에서 이미 여쭤봤고, 저장 자체는 주문이 확정되는 순간
       * finishOrder() 가 끝냈다. 여기서 또 물으면 같은 결정을 두 번 시키는 것이고,
       * 이미 저장된 사람에게는 «아직 저장되지 않았다»는 오해까지 준다.
       *
       * 그래서 여기서는 셋만 한다 — 어떻게 됐는지 사실로 알리고, 무엇이 남았는지
       * 보여주고, 마음이 바뀌었을 때 뒤집을 길을 하나 남긴다. */}
      <section className="card savebox" aria-label="이 기기 저장 안내">
        <h2>{storeToggle ? "이 기기에 저장했습니다" : "저장하지 않았습니다"}</h2>
        <p className="hint">
          {storeToggle
            ? t(
              "다음에 오시면 한 번만 누르면 됩니다.",
              "아래 내용을 이 기기에 남겼습니다. 다음에 오시면 «지난번과 똑같이 주문하기» 한 번으로 끝납니다.",
            )
            : t(
              "이번 주문에만 쓰고 지웠습니다.",
              "아래 내용은 이번 주문에만 쓰고 지웠습니다. 이 기기에도 남아 있지 않습니다.",
            )}
        </p>

        <Card label={storeToggle ? "이 기기에 남은 내용" : "저장하지 않은 내용"} rows={savedRows} />

        <div className="btnrow">
          <button type="button" className="btn ghost" onClick={toggleStore}>
            {storeToggle ? "저장 지우기" : "이 기기에 저장하기"}
          </button>
        </div>
        <p className="savenote">
          {storeToggle
            ? "지우면 즉시 삭제되며, 시작 화면에서도 지울 수 있습니다."
            : "공용 기기에서는 저장하지 않는 편이 안전합니다."}
          {" "}<b>서버·계정에는 어느 쪽이든 아무것도 저장되지 않습니다.</b>
        </p>
      </section>

      {outcome?.valid && submitted && (
        <div className="card errpanel">
          <h2>안전 시연 — 일부러 틀려 보기</h2>
          <p className="hint">
            같은 제출물을 <b>매번 새 세션</b>에 올려 변형 실행합니다 — 위의 정상 결과는 그대로 보존됩니다.
            어떤 경우든 안전 엔진이 즉시 멈추는 것을 보여줍니다.
          </p>
          <div className="choices">
            {INJECTIONS.map(({ code, label, desc }) => (
              <button key={code} type="button" className="choice" onClick={async () => {
                try {
                  const r = await injectError(submitted, code);
                  const e = r.evidence as (Evidence & Record<string, unknown>) | undefined;
                  setErrResults((prev) => ({
                    ...prev,
                    [code]: e
                      ? `즉시 차단됨 — ${STOP_KO[String(e.stopType)] ?? String(e.stopType)} · 결제 실행 ${e.executedPaymentActionCount}건`
                      : `제출 단계에서 거부됨 (${(r.validation?.errors ?? []).map((x) => x.code).join(", ")})`,
                  }));
                } catch (err) {
                  setErrResults((prev) => ({ ...prev, [code]: String((err as Error).message) }));
                }
              }}>
                {label}
                <small>{desc}</small>
                {errResults[code] ? <span className="verdict">{errResults[code]}</span> : <span className="code">{code}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
