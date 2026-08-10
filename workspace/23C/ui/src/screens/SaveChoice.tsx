import React from "react";
import { useFlow } from "../flow";
import { FLOW_STEPS } from "../model";
import { Card, Cta, Header, RadioCard, StepIndicator } from "../components";
import "./profile.css";

/**
 * 화면목록 S03 — 저장 방식. Figma 150:275.
 *
 * **저장 여부를 묻는 자리는 여기 하나뿐이다.** 결과 화면(S15)에서 다시 묻지 않는다 —
 * 주문을 마친 사람에게 "다음 방문에도 쓸까요"를 묻는 것은 결정을 가장 피곤한 순간으로
 * 미루는 일이고, 공용 기기에서는 그 순간이 이미 자리를 뜬 뒤이기 때문이다.
 *
 * 다만 **실제 저장은 두 번 일어난다.** 여기서는 «의사»만 받아 그때 남길 수 있는 것
 * (화면 설정)을 남기고, 주문이 확정되는 순간 finishOrder 가 고른 메뉴까지 함께 다시
 * 남긴다. 프로필 단계에는 아직 고른 메뉴가 없어서 여기서만 저장하면
 * «지난번과 똑같이 주문하기»가 성립하지 않는다(flow.tsx 의 setStoreIntent 참고).
 *
 * 디자인은 «저장하기 / 이번만 사용» 두 개의 CTA 다. 우리는 그것을 라디오 두 장으로
 * 바꾸고 이동은 «다음»이 맡는다. 매장 QR 이 없을 때 건너뛰는 길이 반드시 필요해서
 * 버튼이 셋이 되는데, 그러면 «저장을 정하는 일»과 «어디로 가는 일»이 한 줄에 섞여
 * 무엇을 고른 상태인지 화면에 남지 않는다. 라디오는 고른 것이 계속 보인다.
 */
export const PLACEHOLDER = true;

export function SaveChoice() {
  const { a11y, storeToggle, setStoreIntent, setProfileStep, setStep, staffBtn } = useFlow();

  /** 요약 한 줄 — 값과 «수정»(진짜 버튼)을 함께 준다 (Figma SummaryCard 185:209). */
  const row = (label: string, value: string, to: 1 | 2 | 3) => ({
    label,
    value,
    action: (
      <button type="button" className="p-edit" aria-label={`${label} 수정`}
        onClick={() => { setProfileStep(to); setStep("profile"); }}>
        수정
      </button>
    ),
  });

  return (
    <>
      <StepIndicator labels={FLOW_STEPS} current={3} />
      <section className="card" aria-label="저장 방식">
        <Header onBack={() => setStep("profile")} />

        <h2>선택하신 내용을 확인해주세요</h2>
        <p className="hint">고치실 것이 있으면 «수정»을 눌러 그 단계로 돌아가실 수 있습니다.</p>

        <Card
          label="지금 화면 설정"
          rows={[
            row("글씨 크기", a11y.largeText ? "큰 글씨" : "기본 크기", 1),
            row("고대비", a11y.highContrast ? "고대비 화면" : "기본 화면", 2),
            row("화면 안내", a11y.visualGuidance ? "안내 켜짐" : "기본", 3),
          ]}
        />

        <h3 className="p-subhead">저장 방식을 선택해주세요</h3>
        <div className="kb-radios" role="group" aria-label="저장 방식">
          <RadioCard
            label="이 기기에 저장하기"
            desc="다음에 오시면 이 설정과 주문 내용을 그대로 되살려 드립니다"
            selected={storeToggle}
            onPick={() => setStoreIntent(true)}
          />
          <RadioCard
            label="이번만 사용"
            desc="이용이 끝나면 이 기기에 아무것도 남기지 않습니다"
            selected={!storeToggle}
            onPick={() => setStoreIntent(false)}
          />
        </div>
        <p className="p-note">
          여러 사람이 쓰는 기기라면 <b>이번만 사용</b>을 권합니다. 저장하시더라도 홈 화면에서 언제든 내용을 확인하고
          지우실 수 있고, 저장 여부는 이 화면에서만 여쭤봅니다.
        </p>

        <div className="btnrow">
          <Cta tone="primary" label="다음" onClick={() => setStep("qr")} />
          <Cta label="매장 QR 없이 계속하기" onClick={() => setStep("sessionStart")} />
          <Cta label="처음으로" onClick={() => setStep("start")} />
          {staffBtn()}
        </div>
      </section>
    </>
  );
}
