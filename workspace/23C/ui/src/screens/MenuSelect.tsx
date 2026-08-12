import React, { useState } from "react";
import { useFlow } from "../flow";
import { Cta, Emphasize, Screen } from "../components";
import { candidateName, candidatePrice, withManualSelection } from "../logic";
import "./cart.css";
import "./recommend.css";

/**
 * 메뉴 선택 (노션 기획 «장바구니 수정 플로우 변경» 2026-08-12).
 *
 * 수정 화면의 «메뉴 수정»이 여기로 온다. 추천 점수가 높은 순서대로 목록을 펴고,
 * 상위 3개에 «추천»을 표시한다. 고르면 메뉴 확인 화면으로 돌아가 재확인한다 —
 * 화면이 바로 장바구니에 넣지 않는다.
 *
 * **기획의 «모든 메뉴»는 생존 후보로 한정한다.** 알레르기·품절·예산으로 제외된
 * 메뉴를 여기서 되살리면 제외가 «추천에서 빠짐»에 그치고 «먹으면 안 됨»이 아니게
 * 된다 — 조건 수정 화면의 옛 메뉴 목록과 같은 결정이고, verify-b B9 가 실측한다.
 * scoreBreakdown 에는 STEP 4 를 통과한 생존 후보만 들어 있다.
 */
export function MenuSelect() {
  const { uiRec, fixture, setUiRec, setManual, setStep } = useFlow();
  const [picked, setPicked] = useState<string | null>(uiRec?.rec.recommendedCandidateId ?? null);
  if (!uiRec || !fixture) return null;

  /** 점수 내림차순 — 화면 순서가 곧 추천 순서다. */
  const ranked = Object.entries(uiRec.rec.scoreBreakdown ?? {}).sort((a, b) => b[1] - a[1]);

  const choose = () => {
    if (picked === null) return;
    if (picked !== uiRec.rec.recommendedCandidateId) {
      setUiRec(withManualSelection(uiRec, fixture, picked)); // MANUAL_SELECTION — 이유 문장도 바뀐다
      setManual(true);
    }
    setStep("menuConfirm"); // 기획: 선택한 메뉴로 재확인
  };

  return (
    <Screen
      label="메뉴 선택"
      onBack={() => setStep("edit")}
      eyebrow="고객님,"
      title={<Emphasize text="어떤 메뉴를 원하시나요?" word="어떤 메뉴" />}
      actions={<Cta tone="primary" label="선택" disabled={picked === null} onClick={choose} />}
    >
      <div className="choices menu-rank" role="group" aria-label="메뉴 선택">
        {ranked.map(([id], i) => (
          <button key={id} type="button" className="choice" aria-pressed={picked === id}
            onClick={() => setPicked(id)}>
            <b className="menu-name">{candidateName(fixture, id)}</b>
            <small>{candidatePrice(fixture, id)?.toLocaleString()}원</small>
            {/* 기획: 점수 상위 3개에 «추천». 후보가 셋 미만이면 있는 만큼만 붙는다. */}
            {i < 3 && <span className="menu-rec">추천</span>}
          </button>
        ))}
      </div>
    </Screen>
  );
}
