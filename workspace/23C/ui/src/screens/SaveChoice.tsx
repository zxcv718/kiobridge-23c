import React from "react";
import { useFlow } from "../flow";
import { FLOW_STEPS } from "../model";
import { Card, Cta, Emphasize, Screen } from "../components";
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
 * 디자인대로 **결정이 곧 버튼이다** — «저장하기»·«이번만 사용» 두 개가 저장 방식을 정하고
 * 그대로 다음 화면으로 보낸다. 한때 이것을 라디오 두 장 + «다음»으로 바꿔 두었는데, 그건
 * 매장 QR 을 건너뛰는 세 번째 버튼이 이 화면에 필요하다고 봤기 때문이다. 건너뛰기는 QR
 * 화면(S04) 안에 이미 있으므로 여기 둘 이유가 없었다. 버튼이 둘이면 «무엇을 고른
 * 상태인지»를 화면에 남길 필요도 없다 — 누르는 순간 정해지고 화면을 떠난다.
 */
export function SaveChoice() {
  const { a11y, setStoreIntent, setProfileStep, setStep, staffBtn } = useFlow();

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

  /** 저장 방식을 정하고 그대로 다음 화면으로 — 결정과 이동이 같은 버튼이다. */
  const choose = (store: boolean) => { setStoreIntent(store); setStep("qr"); };

  return (
    <Screen
      onBack={() => setStep("profile")}
      steps={{ labels: FLOW_STEPS, current: 3 }}
      label="저장 방식"
      title={<Emphasize text="선택하신 내용을 확인해주세요" word="확인" />}
      subtitle="고치실 것이 있으면 «수정»을 눌러 그 단계로 돌아가실 수 있습니다."
      actions={<>
        <Cta tone="primary" label="이 기기에 저장하기" onClick={() => choose(true)} />
        <Cta label="이번만 사용하기" onClick={() => choose(false)} />
        {staffBtn()}
      </>}
    >
      <Card
        label="지금 화면 설정"
        rows={[
          row("글씨 크기", a11y.largeText ? "큰 글씨" : "기본 크기", 1),
          row("고대비", a11y.highContrast ? "고대비 화면" : "기본 화면", 2),
          row("화면 안내", a11y.visualGuidance ? "안내 켜짐" : "기본", 3),
        ]}
      />

      <p className="p-cap">저장 방식을 선택해주세요</p>
      {/* guide.txt 5번은 «저장 여부 선택 · 저장된 내용 확인 · 수정 · 삭제» 를 요구한다.
          «내용 확인»이 저장한 뒤에만 되면 늦다 — 고르기 전에 무엇이 남는지 알아야 한다.
          특히 알레르기는 건강에 가까운 정보이고, 공용 기기에서 가장 민감한 항목이다. */}
      <div className="p-willsave">
        <b>저장하면 이 기기에 남는 것</b>
        <ul>
          <li>지금 고르신 <span>화면 설정</span> (글씨 크기·고대비·화면 안내 등)</li>
          <li>주문을 마치면 <span>답해 주신 내용</span> — <b>알레르기</b>·맵기·형태·이용 방식·수량·컵·예산</li>
          <li>주문을 마치면 <span>고르신 메뉴</span> 하나</li>
        </ul>
        <p>서버나 계정에는 아무것도 보내지 않습니다. 이 기기 안에만 남습니다.</p>
      </div>

      <p className="p-note">
        저장하시면 다음에 오셨을 때 그대로 되살려 드리고, 홈 화면에서 언제든 지우실 수 있습니다.
        {" "}여러 사람이 쓰는 기기라면 <b>이번만 사용하기</b>를 권합니다.
      </p>
    </Screen>
  );
}
