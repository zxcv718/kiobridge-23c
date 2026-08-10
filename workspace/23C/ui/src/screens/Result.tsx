import React from "react";
import type { Evidence } from "@kiobridge/participant-sdk";
import { useFlow } from "../flow";
import { Card, Cta, Emphasize, Screen, type CardRow } from "../components";
import { INJECTIONS, STOP_KO, answerLabel } from "../model";
import { candidateName, candidatePrice, downloadSubmission, injectError, summarizeOrderPlan } from "../logic";
import "./cart.css";

/**
 * 결과 화면 (+ 화면목록 S15 «안내·저장» · Figma 99:1830).
 *
 * **이 화면은 카드를 쌓지 않는다.**
 *
 * 예전에는 카드 세 장이었다 — 결과 · 저장 안내 · 오류 주입. 세 장이 나란히 서면
 * 어느 것이 이 화면의 용건인지 알 수 없고, 아래로 갈수록 «아직 뭔가 더 해야 하나»
 * 싶어진다. 디자인 문법에서는 화면 한 장이 한 가지를 말한다. 그래서:
 *
 *  · 용건은 제목과 부제가 말한다 — «주문이 완성되었고, 결제 직전에서 멈춘다».
 *  · 저장 결과는 **사실 한 줄 + 남은 내용 카드**로 본문에 녹인다(디자인 S15 그대로).
 *  · 실행 증거·내려받기와 오류 주입 7종은 **접어 둔다**(`<details>`). 없애지 않는다 —
 *    안전 시연은 이 제출물의 핵심이고, 내려받기 두 파일의 방향 안내(.dlnote)는
 *    빠지면 심사위원이 Evidence 를 업로드 칸에 넣어 공식 시뮬레이터가 죽는다.
 *    실행을 실제로 한 경우(ev)에는 펼친 채로 연다 — 그때는 그것이 용건이기 때문이다.
 *
 * 공식 판정(PASS/stopType)은 키트 서버만 낼 수 있는 값이라, 서버가 없는 체험
 * 모드에서는 **쓰지 않는다.** 화면에 임의로 쓰면 가짜 판정이 되기 때문이다.
 * 대신 방금 만든 계획에서 직접 읽어낸 사실만 보여준다(summarizeOrderPlan).
 */
export function Result() {
  const {
    ev, outcome, runError, submitted, uiRec, fixture, setStep, answers, saved,
    storeToggle, toggleStore, t, errResults, setErrResults, } = useFlow();

  /** 계획에서 읽어낸 사실 — 서버가 있든 없든 같은 함수가 같은 것을 읽는다. */
  const plan = submitted && fixture ? summarizeOrderPlan(submitted, fixture) : null;
  const failed = !!runError || !!(outcome && !outcome.valid);
  const evResult = ev ? String(ev.result) : null;

  const qty = Number(uiRec?.engineCtx.preferences.quantity ?? 1);
  const menuId = uiRec?.rec.recommendedCandidateId ?? null;
  const total = (fixture && menuId ? candidatePrice(fixture, menuId) ?? 0 : 0) * qty;
  const excluded = uiRec?.rec.excludedCandidates.length ?? 0;
  const serviceKo = uiRec?.engineCtx.preferences.serviceType === "TAKE_OUT" ? "포장"
    : uiRec?.engineCtx.preferences.serviceType === "DINE_IN" ? "먹고 가기" : "메뉴 기본값";

  /* 저장된(또는 저장되지 않은) 내용 — 디자인의 RecentOrderCard(185:227) 다섯 줄.
     값은 이번 세션의 답변에서 그대로 읽는다. */
  const savedRows: CardRow[] = [
    { label: "메뉴명", value: fixture ? candidateName(fixture, menuId ?? saved?.lastCandidateId ?? null) : "(없음)" },
    { label: "알레르기", value: answerLabel("allergies", answers.allergies) },
    { label: "맵기 선호", value: answerLabel("spicyLevel", answers.spicyLevel) },
    { label: "뼈/순살 선택", value: answerLabel("boneType", answers.boneType) },
    { label: "수량", value: answerLabel("quantity", answers.quantity) },
  ];

  const title = failed
    ? <Emphasize text="실행하지 못했습니다" word="못했습니다" />
    : ev
      ? <>실행 결과 {evResult === "PASS" ? <span className="pass">PASS</span> : <span className="fail">{evResult}</span>}</>
      : <Emphasize text="주문이 완성되었습니다" word="완성" />;

  const subtitle = failed
    ? "무엇이 막혔는지 아래에 그대로 적었습니다. 직원 도움을 이용하셔도 됩니다."
    : plan
      ? (plan.stopsAtReviewBoundary
        ? <>이 주문은 <b>결제 직전 장바구니 확인 화면에서 멈춥니다.</b>{" "}
          {plan.includesRequiredVerifier && "담긴 내용을 읽어서 확인하는 것까지가 끝이고, "}
          결제는 사람이 직접 하도록 남겨 둡니다.</>
        : <>이 주문은 <b>{plan.endsAtTitle}</b>에서 끝납니다.</>)
      : undefined;

  return (
    <Screen
      label="주문 결과"
      title={title}
      subtitle={subtitle}
      actions={(
        <>
          <Cta tone="primary" label="처음으로" onClick={() => setStep("start")} />
          {/* 저장은 이미 끝났다(finishOrder). 여기 버튼은 «마음이 바뀌었을 때» 하나뿐이다. */}
          <Cta label={storeToggle ? "저장 지우기" : "이 기기에 저장하기"} onClick={toggleStore} />
          {/* 화면이 길어도 도움은 늘 화면 아래에 붙어 있다 — 끝까지 내려가지 않아도 닿는다. */}
        </>
      )}
    >
      {runError && <p className="banner danger" role="alert">{runError}</p>}
      {outcome && !outcome.valid && (
        <>
          <p className="hint">공식 검증기가 제출을 거부했습니다 — 코드가 고칠 위치를 알려줍니다.</p>
          {outcome.validationErrors.map((e, i) => <p className="excluded" key={i}><b>{e.code}</b> {e.path} — {e.message}</p>)}
        </>
      )}

      {/* 주문한 내용 — 디자인 S13 의 추천카드와 같은 상자다. 결과 화면에서도 «무엇을
          주문했는지»가 첫 번째로 보여야 할 것이라, 같은 모양을 그대로 쓴다. */}
      {fixture && menuId && (
        <div className="cart-box">
          <p className="cart-cap">주문한 내용</p>
          <div className="cart-menuline">
            <span className="cart-name">{candidateName(fixture, menuId)}</span>
            <span className="cart-qty">x {qty}개</span>
            <span className="cart-price">{total.toLocaleString()}원</span>
          </div>
          <p className="cart-sub">이용 방식: <b>{serviceKo}</b></p>
          {excluded > 0 && (
            <p className="cart-sub">고르실 수 없던 {excluded}가지는 이유를 알려드리고, 대신 고를 수 있는 것으로 안내했습니다.</p>
          )}
        </div>
      )}

      {/* 화면목록 S15 «안내·저장» — **묻는 곳이 아니라 알리는 곳이다.**
       *
       * 저장 여부는 프로필 단계에서 이미 여쭤봤고, 저장 자체는 주문이 확정되는 순간
       * finishOrder() 가 끝냈다. 여기서 또 물으면 같은 결정을 두 번 시키는 것이고,
       * 이미 저장된 사람에게는 «아직 저장되지 않았다»는 오해까지 준다.
       *
       * 그래서 여기서는 셋만 한다 — 어떻게 됐는지 사실로 알리고, 무엇이 남았는지
       * 보여주고, 마음이 바뀌었을 때 뒤집을 길(화면 아래 버튼)을 하나 남긴다. */}
      <h3 className="resfact">{storeToggle ? "이 기기에 저장했습니다" : "저장하지 않았습니다"}</h3>
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
      <p className="savenote">
        {storeToggle
          ? "지우면 즉시 삭제되며, 시작 화면에서도 지울 수 있습니다."
          : "공용 기기에서는 저장하지 않는 편이 안전합니다."}
        {" "}<b>서버·계정에는 어느 쪽이든 아무것도 저장되지 않습니다.</b>
      </p>

      {/* 기술적인 뒷받침 — 접어 둔다. 실제로 실행한 경우에만 펼친 채로 연다. */}
      {(plan || ev) && (
        <details className="resmore" open={!!ev}>
          <summary>{ev ? "실행 증거와 내려받기" : "키오스크에서 가는 길 · 주문 계획 내려받기"}</summary>
          <div className="resbody">
            {ev ? (
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
                </div>
              </>
            ) : plan && (
              <>
                <div className="evgrid">
                  <div className="evitem"><b>주문 단계</b>{plan.stepCount}단계</div>
                  <div className="evitem"><b>마지막 화면</b>{plan.endsAtTitle}</div>
                  <div className="evitem"><b>결제 동작</b>{plan.paymentActionCount}건</div>
                  <div className="evitem"><b>실제 기기로 간 명령</b>{plan.deviceCommandSent ? "있음(문제!)" : "없음"}</div>
                </div>
                <div className="btnrow">
                  <button type="button" className="btn ghost" onClick={() => { if (submitted) downloadSubmission(submitted); }}>
                    주문 계획(JSON) 내려받기
                  </button>
                </div>
              </>
            )}
          </div>
        </details>
      )}

      {/* 오류 주입 7종 — 안전 시연의 핵심이라 없애지 않는다. 다만 «정상 결과»를 먼저
          읽은 사람이 스스로 열어 보는 자리로 내린다. */}
      {outcome?.valid && submitted && (
        <details className="resmore">
          <summary>안전 시연 — 일부러 틀려 보기 ({INJECTIONS.length}가지)</summary>
          <div className="resbody">
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
        </details>
      )}
    </Screen>
  );
}
