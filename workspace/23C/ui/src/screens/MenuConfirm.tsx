import React from "react";
import { useFlow } from "../flow";
import { Badge, Cta, Emphasize, Screen } from "../components";
import { OPTION_KO } from "../model";
import { candidateName, candidatePrice, withManualSelection } from "../logic";
import { metConditionsFor, type MetCondition } from "../../../src/core/engine";
import { ALLERGEN_KO, josa } from "./CartReview";
import "./cart.css";
import "./recommend.css";

/**
 * 메뉴 확인 (Figma 99:1762 · 노션 기획 «장바구니 수정 플로우 변경» 2026-08-12).
 *
 * 추천 화면(Recommend)과 합쳐졌다. 예전에는 «왜 이것인가»(추천)와 «이것이 맞는가»
 * (메뉴 확인)가 두 화면이었는데, 같은 메뉴를 두 번 확인시키는 중복이라 기획이 하나로
 * 정리했다. 이 화면이 제출 선언 셋을 진다 — 추천 이유(«추천해요» 절), 대안(조건 수정의
 * 메뉴 목록으로 닿는다), 거절 가능(뒤로·다시 추천받기 — 승인하지 않고 나갈 길이 둘이다).
 *
 * 기획 목업의 값(매운맛 닭강정·17,800원·«새우, 대두»)은 목업이라 쓰지 않는다.
 * 메뉴·가격은 fixture, 제외 개수·반영 못한 조건은 엔진 결과에서 그대로 읽는다 —
 * 화면이 자기 값을 따로 적으면 계획과 어긋날 수 있다.
 *
 * 재확인이 필요한 상태에서는 승인 버튼이 **비활성화**된다. 확실하지 않은 정보를
 * 임의로 판단해서 진행하지 않는다는 계약이 화면에서도 그대로 지켜져야 한다.
 */

/** 조건 절 하나 — «앞말 + 강조할 값 + 뒷말». 문장 조립은 화면이, 값은 코어가 준다. */
interface Clause { pre?: string; em: string; post: string }

/**
 * «추천해요» 절 — 코어가 대조한 **메뉴가 실제로 만족하는 축**(metConditionsFor)만
 * 문장이 된다(QA TC-CM-03). 한때 사용자 선호만 보고 만들었는데, 그러면 순살 메뉴
 * 옆에 «뼈가 가능하며»가 붙는다 — 어긋난 축은 아래 «주의 필요»가 말한다.
 */
function whyClauses(met: MetCondition[]): Clause[] {
  const ko = (v: string) => OPTION_KO[v] ?? v;
  return met.map(({ key, value }) => {
    const v = ko(value);
    if (key === "spicyLevel") return { pre: "맵기는 ", em: v, post: "이고" };
    if (key === "boneType") return { em: v, post: `${josa(v, "이", "가")} 가능하며` };
    return { em: v, post: `${josa(v, "이", "가")} 가능한` };
  });
}

export function MenuConfirm() {
  const { uiRec, fixture, setStep, setUiRec, setManual, openEdit, simple } = useFlow();
  if (!uiRec || !fixture) return null;

  const rec = uiRec.rec;
  const blocked = rec.requiresReconfirmation;
  /* 뒤로는 질문으로 돌아간다. 추천은 답의 결과이므로 «앞»은 언제나 질문이고,
     조건을 통째로 손보는 길은 아래 «다시 추천받기»에 따로 있다. */
  const back = () => setStep("wizard");

  /* 조건에 맞는 메뉴가 없는 경우 — 막다른 길이 아니라 조건 수정으로 잇는다 */
  if (rec.recommendedCandidateId === null) {
    return (
      <Screen
        label="메뉴 확인"
        onBack={back}
        eyebrow="고객님,"
        title={<Emphasize text="조건에 맞는 메뉴가 없어요" word="없어요" />}
        subtitle="조건을 조금 바꾸면 찾을 수 있습니다."
        actions={<Cta tone="primary" label="조건 수정하기" onClick={openEdit} />}
      >
        <section className="q-sec">
          <h3 className="q-sechead">이렇게 찾아봤어요</h3>
          <ul className="reasons">{rec.recommendationReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </section>
      </Screen>
    );
  }

  const id = rec.recommendedCandidateId;
  const declared = (uiRec.engineCtx.hardConstraints.allergenIds ?? []).filter((a) => a !== "UNKNOWN");
  const allergyNames = declared.map((a) => ALLERGEN_KO[a]).filter(Boolean).join(", ");
  const allergyExcluded = rec.excludedCandidates.filter((e) => e.reasonCode === "ALLERGEN_CONFLICT").length;
  /* 직접 고른 메뉴도 이 화면으로 돌아오므로(MenuSelect), 선호가 아니라 **지금 화면에
     선 그 메뉴**를 코어에 대조시킨다 — 엔진 1순위든 직접 선택이든 같은 잣대다. */
  const tail = whyClauses(metConditionsFor(fixture.candidates.find((c) => c.candidateId === id), uiRec.engineCtx));

  /* 다른 메뉴 카드 — 지금 화면의 메뉴를 뺀 **생존 후보**를 점수순으로 가로에 편다
     (2차 QA 2026-08-13: 메뉴에 관한 선택이 이 화면에서 한 번에 보이게).
     제외된 후보를 되살리지 않는 것은 메뉴 선택 화면과 같은 결정이다(verify-b B9). */
  const alts = Object.entries(rec.scoreBreakdown ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([cid]) => cid)
    .filter((cid) => cid !== id);

  /** 카드를 누르면 그 메뉴가 그 자리에서 위 카드로 올라온다 — 직접 선택(MODIFY)이다.
   *  화면을 떠나지 않으므로 «추천해요»·«주의 필요»도 새 메뉴 기준으로 즉시 다시 선다.
   *  미확인 차단(blocked)은 그대로다 — 메뉴를 확인한 것이지 알레르기를 확인한 것이 아니다. */
  const pickAlt = (cid: string) => {
    setUiRec(withManualSelection(uiRec, fixture, cid));
    setManual(true);
  };

  return (
    <Screen
      label="메뉴 확인"
      onBack={back}
      /* 기획 목업은 인사말 없이 이 물음 한 줄을 카드 위 15px 캡션으로 둔다.
         크기·굵기는 CSS(.mc-flow 스코프)가 내리고, h2 인 것은 유지한다 —
         화면 제목이 h2 하나라는 전제를 낭독기와 e2e(heading level 2)가 쓴다. */
      title="이 메뉴를 선택하시겠어요?"
      actions={
        <>
          {/* 순서는 «선택하기»(주황)가 위, «다시 추천받기»가 아래 — 2차 QA(2026-08-13)로
              기획 목업의 순서를 뒤집었다. 주 동작이 위에 서는 다른 화면들과 같아졌다.
              «다시 추천받기»는 조건을 고쳐 다시 받는 화면으로 보낸다 (기획 3번). */}
          <Cta tone="primary" label="선택하기" disabled={blocked} onClick={() => setStep("confirm")} />
          <Cta label="다시 추천받기" onClick={openEdit} />
        </>
      }
    >
      <div className="mc-flow">
        {/* 확실하지 않은 정보가 남아 있으면 여기서 승인할 수 없다 — 이 화면이
            빠져나가는 길이 되면 «임의로 판단하지 않는다»는 선언이 거짓이 된다. */}
        {blocked && (
          <div className="banner warn" role="alert">
            확실하지 않은 정보가 있어요. 임의로 판단하지 않습니다 — 조건을 다시 확인해 주시거나, 직원 도움을 이용해 주세요.
          </div>
        )}

        <div className="cart-box">
          <p className="cart-cap">추천 메뉴</p>
          <div className="cart-menuline">
            <span className="cart-name">{candidateName(fixture, id)}</span>
            <span className="cart-price">{candidatePrice(fixture, id)?.toLocaleString()}원</span>
          </div>
        </div>

        {/* 기획: «추천해요 — 알레르기로 제외한 메뉴 개수 + 추천에 반영된 사항» */}
        {(allergyExcluded > 0 || tail.length > 0) && (
          <section className="q-sec">
            <p className="mc-badgeline"><Badge mark="✓">추천해요</Badge></p>
            <ul className="reasons" aria-label="추천 이유">
              {allergyExcluded > 0 && allergyNames && (
                <li><b>{allergyNames}</b>{josa(allergyNames, "이", "가")} 들어간 메뉴 {allergyExcluded}가지는 제외했습니다.</li>
              )}
              {tail.length > 0 && (
                <li>
                  선택하신 선호에 따라 {tail.map((c, i) => (
                    <React.Fragment key={i}>{c.pre}<b>{c.em}</b>{c.post}{i < tail.length - 1 ? ", " : " "}</React.Fragment>
                  ))}메뉴를 추천드려요.
                </li>
              )}
            </ul>
          </section>
        )}

        {/* 기획: «주의필요 — 반영되지 못한 사항. 없을 경우 표시 X» */}
        {rec.unmetConditions && rec.unmetConditions.length > 0 && (
          <section className="q-sec">
            {/* 시안(메뉴 확인 신규)의 라벨·마크 그대로 — «✓ 주의 필요» */}
            <p className="mc-badgeline"><Badge mark="✓">주의 필요</Badge></p>
            <ul className="reasons" aria-label="반영하지 못한 조건">
              {rec.unmetConditions.map((u, i) => <li key={i}>{u}</li>)}
            </ul>
          </section>
        )}

        {/* 다른 메뉴 카드 — 목록 화면으로 나가지 않고 이 자리에서 바꿔잡는다 (2차 QA) */}
        {alts.length > 0 && (
          <div className="mc-alts" role="group" aria-label="다른 메뉴 바로 고르기">
            {alts.map((cid) => (
              <button key={cid} type="button" className="mc-altcard" onClick={() => pickAlt(cid)}>
                <span className="mc-altcap">다른 메뉴</span>
                <b className="menu-name">{candidateName(fixture, cid)}</b>
                <small>{candidatePrice(fixture, cid)?.toLocaleString()}원</small>
              </button>
            ))}
          </div>
        )}

        {!simple && (
          <p className="hint">
            담아도 결제는 일어나지 않습니다. 다음 화면에서 무엇을 주문하게 되는지 전부 보여드립니다.
          </p>
        )}
      </div>
    </Screen>
  );
}
