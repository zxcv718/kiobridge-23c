import React from "react";
import { useFlow } from "../flow";
import { Cta, Screen } from "../components";
import "./cart.css";

/**
 * 화면목록 S12 — 안전 중단 (Figma 99:1337).
 *
 * 재확인 2회째에도 확정되지 않았을 때 온다. 정상 종료가 아니라는 것과
 * **아무 준비도 시작되지 않았다는 것**을 함께 밝힌다(승인 전이므로 실행계획이
 * 비어 있다). 직원 도움이 첫 번째 버튼인 것이 이 화면의 존재 이유다.
 *
 * 레이아웃은 디자인 그대로다 — 가운데 정렬, 세로로도 가운데, 라벨 → 제목 → 부제 →
 * 넓은 여백 → 화면 아래 CTA. 세로 가운데 정렬은 `.stopwrap` 이 있는 화면에만
 * 걸린다(cart.css) — `Screen` 은 공유 부품이라 이 화면 하나 때문에 고치지 않는다.
 *
 * 디자인과 다르게 한 것 넷:
 *
 * ① **머리말이 «ERROR» 가 아니다.** 이 화면을 만나는 사람은 «확실하지 않아서
 *    멈췄다»는 말을 들어야 하는 사람이고, 영문 대문자 한 단어는 그 말을 못 한다.
 *    같은 자리에 한국어 «진행 중단»을 둔다.
 *
 * ② **제목이 «추천 메뉴를 찾지 못했습니다» 가 아니다.** 그 문장은 다른 상태
 *    (조건에 맞는 후보가 없음 — 추천 화면이 말한다)의 것이다. 여기 오는 경로는
 *    «두 번 여쭤봤는데도 확실해지지 않음»이라, 그 사실을 그대로 적는다.
 *
 * ③ **버튼이 «처음으로 돌아가기» 하나가 아니다.** 처음으로만 보내면 두 번 답한
 *    사람에게 다시 처음부터 답하라는 뜻이 된다. 직원 도움을 첫 자리에 두고,
 *    조건만 고쳐 이어갈 길을 남긴다.
 *
 * ④ **일러스트를 그리지 않았다.** assets/icons/ 에 없는 그림이고, 손으로 만들면
 *    디자인과 다른 것이 된다. 그 자리는 «무슨 일이 일어났는가»를 말하는 알림이 쓴다.
 */
export function SafetyStop() {
  const { t, staffBtn, setReconfirmCount, setEditOpen, setStep } = useFlow();

  return (
    <Screen
      label="안전 중단"
      noStaff="이 화면에서는 직원 도움이 «비상구»가 아니라 **주 동작**이다 — 머리 줄의 작은 버튼이 아니라 아래 첫 버튼으로 둔다"
      eyebrow={<span className="stoplabel">진행 중단</span>}
      title="확인이 어려워 진행을 멈췄어요"
      subtitle={t(
        "두 번 여쭤봤는데도 확실하지 않았습니다. 어려우시면 직원을 불러주세요.",
        "두 번 확인을 요청드렸는데도 조건이 확실해지지 않았습니다. 임의로 판단해서 진행하지 않습니다 — 어려우시면 직원을 불러주세요.",
      )}
      actions={(
        <>
          {staffBtn("btn primary")}
          <Cta label="조건 다시 보기"
            onClick={() => { setReconfirmCount(0); setEditOpen("allergies"); setStep("edit"); }} />
          <Cta label="처음으로 돌아가기" onClick={() => setStep("start")} />
        </>
      )}
    >
      {/* 한 덩어리로 합쳤다 — 예전에는 «정상 종료가 아니다» 배너와 «준비가 시작되지
          않았다» 문단이 따로 있었는데, 둘 다 같은 안심을 서로 다른 말로 두 번 했다. */}
      <div className="stopwrap">
        <p className="stopalert" role="alert">
          <b>정상적으로 끝난 것이 아닙니다.</b> 승인 전이므로 실행 계획이 만들어지지 않았고,
          장바구니에도 아무것도 담기지 않았습니다.
        </p>
      </div>
    </Screen>
  );
}
