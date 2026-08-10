/**
 * 팀 23C 데모 UI — 껍데기와 라우팅만.
 *
 * 화면 하나하나는 `screens/` 에, 상태와 조작은 `flow.tsx` 에, 데이터는 `model.ts` 에 있다.
 * 이 파일이 하는 일은 셋뿐이다 — 모든 화면에 공통인 껍데기(상단바·직원 도움 배너·
 * 낭독 영역·바닥글), **화면 하나를 고르는 표**, 그리고 그 둘을 잇는 것.
 *
 * 표를 `Record<Step, …>` 으로 둔 것은 실수를 타입이 잡게 하려는 것이다 —
 * Step 을 하나 늘리면 표에 넣기 전까지 컴파일이 되지 않는다. 화면이 늘어도
 * «어디에도 연결되지 않은 화면»이나 «화면 없는 상태»가 생길 수 없다.
 *
 * 판단은 전부 core 가, 실행·검증·Evidence 는 전부 공식 서버가 한다.
 */
import React from "react";
import { TIME_SLOT_KO, timeSlotOf } from "../../src/core/context";
import { FlowProvider, useFlowState } from "./flow";
import type { Step } from "./model";

import { Home } from "./screens/Home";
import { ProfileSetup } from "./screens/ProfileSetup";
import { QuestionScreen } from "./screens/Question";
import { Calculating } from "./screens/Calculating";
import { Recommend } from "./screens/Recommend";
import { CartReview } from "./screens/CartReview";
import { CartEdit } from "./screens/CartEdit";
import { Running } from "./screens/Running";
import { Result } from "./screens/Result";
import { SafetyStop } from "./screens/SafetyStop";
import { StaffHelp } from "./screens/StaffHelp";
// 아직 만들지 않은 화면들 — 자리만 잡아 둔다 (screens/*.tsx 의 PLACEHOLDER 참고)
import { SaveChoice } from "./screens/SaveChoice";
import { QrConnect } from "./screens/QrConnect";
import { SessionStart } from "./screens/SessionStart";
import { MenuConfirm } from "./screens/MenuConfirm";

/** 라우팅 표 — 화면 하나 = 한 줄. 여기 없는 Step 은 존재할 수 없다. */
const SCREENS: Record<Step, React.ComponentType> = {
  start: Home,               // S01a·S01b 홈
  profile: ProfileSetup,     // S02 화면·안내 설정
  saveChoice: SaveChoice,    // S03 저장 방식            ← 아직 만들지 않음
  qr: QrConnect,             // S04a·S04b QR 연동        ← 아직 만들지 않음
  sessionStart: SessionStart, // S05 세션 시작            ← 아직 만들지 않음
  wizard: QuestionScreen,    // S06~S10 질문
  calculating: Calculating,  // S11 계산 중
  recommend: Recommend,      // 추천 결과
  menuConfirm: MenuConfirm,  // 메뉴 확인(신규)          ← 아직 만들지 않음
  confirm: CartReview,       // S13 장바구니 확인
  edit: CartEdit,            // S14 조건·메뉴 수정
  run: Running,              // 가상 키오스크 실행 중
  result: Result,            // 결과 + S15 저장 유도
  stopped: SafetyStop,       // S12 안전 중단
  staff: StaffHelp,          // 직원 호출
};

export function App() {
  const flow = useFlowState();
  const { step, a11y, setStep, setFlag, runLog, now, demoHour, staffBtn } = flow;
  const Screen = SCREENS[step];

  return (
    <FlowProvider value={flow}>
      <div className={[
        "app",
        a11y.largeText ? "large" : "",
        a11y.highContrast ? "contrast" : "",
        a11y.mobilitySupport ? "roomy" : "",
        a11y.visualGuidance ? "icons" : "",
      ].join(" ").trim()}>
        <div className="shell">
          <header className="topbar">
            <h1>주문 도우미 <span className="simbadge">시뮬레이션 — 실제 주문·결제 없음</span></h1>
            <div className="a11y" role="group" aria-label="화면 설정">
              <button type="button" className="toggle" aria-pressed={a11y.largeText} onClick={() => setFlag("largeText", !a11y.largeText)}>큰 글씨</button>
              <button type="button" className="toggle" aria-pressed={a11y.highContrast} onClick={() => setFlag("highContrast", !a11y.highContrast)}>고대비</button>
              <button type="button" className="toggle" onClick={() => setStep("profile")}>설정 더보기</button>
            </div>
          </header>
          <div aria-live="polite" className="srline">{step === "run" ? runLog[runLog.length - 1] : ""}</div>

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

          <footer className="foot">
            <span>지금 시각 기준: {TIME_SLOT_KO[timeSlotOf(now)]}{demoHour !== null ? " (시연용 고정)" : ""}</span>
          </footer>
        </div>
      </div>
    </FlowProvider>
  );
}
