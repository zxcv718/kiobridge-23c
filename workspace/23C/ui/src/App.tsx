/**
 * 팀 23C 데모 UI — 껍데기와 라우팅만.
 *
 * 화면 하나하나는 `screens/` 에, 상태와 조작은 `flow.tsx` 에, 데이터는 `model.ts` 에 있다.
 * 이 파일이 하는 일은 셋뿐이다 — 모든 화면에 공통인 껍데기, **화면 하나를 고르는 표**,
 * 그리고 그 둘을 잇는 것.
 *
 * 껍데기가 얇아졌다. 위쪽의 «큰 글씨 · 고대비 · 설정 더보기» 세 버튼도, 아래쪽의
 * «시뮬레이션 — 실제 주문·결제 없음 · 지금은 늦은 시간» 도 없앴다. 디자인에 없고,
 * 둘 다 화면마다 자리를 차지하면서 정작 필요한 순간에는 아무 일도 하지 않았다.
 *
 * 없앤 것이 사실을 숨기는 것은 아니다 — 시뮬레이션이라는 사실은 **주문을 확정하기
 * 직전**(장바구니 확인)에 «실제 결제·주문은 일어나지 않습니다» 로 말한다. 그게 그 말이
 * 필요한 자리다. 시간대(상황신호)도 화면에 띄우든 말든 sessionContext.extensions 에
 * 출처(DEVICE_CLOCK)·관측시각과 함께 그대로 기록된다.
 *
 * 표를 `Record<Step, …>` 으로 둔 것은 실수를 타입이 잡게 하려는 것이다 —
 * Step 을 하나 늘리면 표에 넣기 전까지 컴파일이 되지 않는다.
 *
 * 판단은 전부 core 가, 실행·검증·Evidence 는 전부 공식 서버가 한다.
 */
import React from "react";
import { FlowProvider, useFlowState } from "./flow";
import type { Step } from "./model";

import { Home } from "./screens/Home";
import { ProfileSetup } from "./screens/ProfileSetup";
import { SaveChoice } from "./screens/SaveChoice";
import { QrConnect } from "./screens/QrConnect";
import { SessionStart } from "./screens/SessionStart";
import { QuestionScreen } from "./screens/Question";
import { Calculating } from "./screens/Calculating";
import { MenuConfirm } from "./screens/MenuConfirm";
import { CartReview } from "./screens/CartReview";
import { CartEdit } from "./screens/CartEdit";
import { Running } from "./screens/Running";
import { Result } from "./screens/Result";
import { SafetyStop } from "./screens/SafetyStop";
import { StaffHelp } from "./screens/StaffHelp";

/** 라우팅 표 — 화면 하나 = 한 줄. 여기 없는 Step 은 존재할 수 없다. */
const SCREENS: Record<Step, React.ComponentType> = {
  start: Home,                // S01a·S01b 홈
  profile: ProfileSetup,      // S02 프로필 생성 3걸음
  saveChoice: SaveChoice,     // S03 저장 방식
  qr: QrConnect,              // S04a·S04b 매장 QR
  sessionStart: SessionStart, // S05 세션 시작
  wizard: QuestionScreen,     // S06~S10 질문
  calculating: Calculating,   // S11 계산 중
  menuConfirm: MenuConfirm,   // 메뉴 확인 (추천 화면과 통합 — 노션 기획 2026-08-12)
  confirm: CartReview,        // S13 장바구니 확인
  edit: CartEdit,             // S14 수정
  run: Running,               // 가상 키오스크 실행 중
  result: Result,             // 결과 + S15 안내
  stopped: SafetyStop,        // S12 안전 중단
  staff: StaffHelp,           // 직원 호출
};

export function App() {
  const flow = useFlowState();
  const { step, a11y, runLog, staffBtn } = flow;
  const Screen = SCREENS[step];

  return (
    <FlowProvider value={flow}>
      <div className={[
        "app",
        a11y.largeText ? "large" : "",
        a11y.highContrast ? "contrast" : "",
        a11y.mobilitySupport ? "roomy" : "",
        /* 시안 150:509 의 「안내 켜짐」 = «다음에 누를 버튼을 테두리와 화살표로 강조».
           예전 이름은 `icons` 였고 하는 일도 «선택지에 그림 병기»였다 — 시안에 없는
           기능이 시안에 있는 기능의 자리를 차지하고 있었다(styles.css .app.guide). */
        a11y.visualGuidance ? "guide" : "",
      ].join(" ").trim()}>
        <div className="shell">
          {/* 진행 상황을 화면 낭독기에 알린다. 눈에는 보이지 않는다. */}
          <div aria-live="polite" className="srline">{step === "run" ? runLog[runLog.length - 1] : ""}</div>

          {/* «직원 도움 먼저»를 켠 사람에게만 — 켜지 않았으면 화면을 차지하지 않는다 */}
          {a11y.staffAssistancePreferred && step !== "staff" && (
            <div className="staffbar">
              <span>도움이 필요하시면 언제든 눌러 주세요.</span>
              {staffBtn("btn primary")}
            </div>
          )}

          {a11y.hearingSupport && step === "start" && (
            <div className="banner ok" role="note">
              이 서비스는 <b>소리 안내를 사용하지 않습니다.</b> 모든 안내가 화면 글자로 표시되므로 놓치는 내용이 없습니다.
            </div>
          )}

          <Screen />

        </div>
      </div>
    </FlowProvider>
  );
}
