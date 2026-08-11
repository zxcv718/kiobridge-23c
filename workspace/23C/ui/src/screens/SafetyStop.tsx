import React from "react";
import { useFlow } from "../flow";
import { Cta, Screen } from "../components";
import stopIllustration from "../assets/icons/stop-illustration.svg";
import "./finish.css";
import "./profile.css";

/**
 * 화면목록 S12 — 안전 중단 (Figma 99:1337 «S12 - 안전 중단»).
 *
 * 재확인 2회째에도 확정되지 않았을 때 온다. 추천을 만들지 못했다는 사실과, 그래서
 * **아무 준비도 시작되지 않았다는 것**을 함께 밝힌다(승인 전이므로 실행계획이 비어 있다).
 *
 * **이 화면은 시안이 그린 화면이므로 시안 그대로 그린다.** 문구·순서·일러스트 전부
 * 99:1337 의 것이다 — 에러 라벨(99:1340) → 일러스트(99:1341) → 타이틀(99:1370) →
 * 서브텍스트(226:3420) → 아래 붙는 CTA(224:984).
 *
 * 한때 여기 «시안과 다르게 한 이유» 넷이 적혀 있었다. 그중 셋(머리말·제목·일러스트)은
 * 근거가 되지 못한다 — 기획이 「있는 화면은 시안 그대로, 있는 걸 판단하지 말고 없는 걸
 * 판단해라」를 못 박았기 때문이다. 특히 시안의 제목은 우리 화면에서도 **참이다**:
 * 이 화면은 추천을 만들지 못했을 때 오고, 그 이유가 «후보가 없어서»든 «확실하지
 * 않아서»든 「추천 메뉴를 찾지 못했다」는 사실은 같다.
 *
 * 시안이 다루지 않아 우리가 정한 것은 둘뿐이다:
 *
 * ① **«조건 다시 보기»를 하나 더 둔다.** 시안 버튼은 «처음으로 돌아가기» 하나인데,
 *    그것만 두면 두 번 답한 사람에게 처음부터 다시 답하라는 뜻이 되고 이 화면이
 *    막다른 길이 된다. 제출물이 «막다른 길을 만들지 않는다»를 선언하고 있어 남긴다.
 *    다만 **시안 버튼이 주 동작(primary)**이고, 우리 버튼은 그 아래 white 다.
 *
 * ② **«왜 멈췄나요?»를 접어 둔다(FIGMA_RULES §2.1).** 정상 종료가 아니라는 것과
 *    장바구니가 비어 있다는 안심은 시안에 없지만 요건상 지울 수 없다. 지우는 대신
 *    한 줄로 접어, 펴기 전 화면이 시안과 같아지게 한다.
 *    접힌 안쪽에는 `role="alert"` 를 두지 않는다 — 보이지 않는 것을 읽어 주면 안 된다.
 */
export function SafetyStop() {
  const { setReconfirmCount, setEditOpen, setStep } = useFlow();

  return (
    <Screen
      label="안전 중단"
      eyebrow={(
        <>
          <span className="stop-figma-label">ERROR</span>
          {/* 그림은 장식이다 — 뜻은 바로 아래 제목과 부제가 진다(FIGMA_RULES §2.7) */}
          <span className="stop-figma-illus">
            <img src={stopIllustration} alt="" aria-hidden="true" />
          </span>
        </>
      )}
      title="추천 메뉴를 찾지 못했습니다"
      subtitle="매장 직원에게 말씀해 주세요"
      actions={(
        <>
          <Cta tone="primary" label="처음으로 돌아가기" onClick={() => setStep("start")} />
          <Cta label="조건 다시 보기"
            onClick={() => { setReconfirmCount(0); setEditOpen("allergies"); setStep("edit"); }} />
        </>
      )}
    >
      <div className="stop-figma">
        <details className="home-saved">
          <summary>왜 멈췄나요?<span aria-hidden="true">▾</span></summary>
          <p className="p-willsave">
            <b>정상적으로 끝난 것이 아닙니다.</b> 두 번 확인을 요청드렸는데도 조건이 확실해지지 않아
            임의로 판단하지 않았습니다. 승인 전이므로 실행 계획이 만들어지지 않았고,
            장바구니에도 아무것도 담기지 않았습니다.
          </p>
        </details>
      </div>
    </Screen>
  );
}
