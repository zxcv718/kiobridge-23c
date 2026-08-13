import React from "react";
import { useFlow } from "../flow";
import { answerLabel } from "../model";
import { Card, Cta, Screen } from "../components";
import "./finish.css";

/**
 * 화면목록 S15 «안내·저장 유도» — Figma 99:1830.
 *
 * **여기서 묻는 것은 세션(오늘의 답변·확정 메뉴)뿐이다.** 프로필(화면 설정)의 저장은
 * S04 에서 이미 정했고, 이 화면의 결정은 프로필을 건드리지 않는다(QA 1차 2026-08-13).
 *
 * 주문이 확정된 **직후**에 묻는 이유: 프로필 단계에서는 아직 답변도 확정 메뉴도 없어서,
 * «지난번과 똑같이 주문하기»를 성립시킬 재료가 이 시점에야 갖춰지기 때문이다.
 * 한때는 결과 화면이 저장 여부를 알리기만 했는데, 그러면 세션을 남길지 **묻는 자리**가
 * 흐름 어디에도 없었다.
 *
 * 버튼 순서는 시안 그대로 — «이번만 사용»이 위, «저장하기»(주황)가 아래다. S04 와
 * 반대인 것을 알고 따른다: 시안이 이 화면에서는 저장을 아래 강조 자리에 두었다.
 */
export function SavePrompt() {
  const { answers, fixture, saveSession, discardSession, setStep } = useFlow();

  /* 카드 위 매장명 (시안의 «ChickenStore» 자리표시자). 실제 가게 이름을 쓰고,
     없으면 줄을 그리지 않는다 — 빈 자리표시자를 그리지 않는다(Result 와 같은 규칙). */
  const storeName = fixture?.manifest.displayName ?? fixture?.manifest.name ?? "";

  return (
    <Screen
      label="저장 유도"
      title="오늘 입력한 내용을 저장할까요?"
      subtitle="다음 방문 시 입력 과정 없이 바로 메뉴를 추천 받을 수 있어요."
      actions={<>
        <Cta label="이번만 사용" onClick={() => { discardSession(); setStep("result"); }} />
        <Cta tone="primary" label="저장하기" onClick={() => { saveSession(); setStep("result"); }} />
      </>}
    >
      {/* save-prompt 는 이 화면의 세로 구도(위 여백·성근 간격)를 켜는 CSS 갈고리를
          겸한다(finish.css) — S14 의 edit-extra 와 같은 방식이다. */}
      <div className="save-prompt">
        {storeName && <p className="res-store">{storeName}</p>}
        {/* 시안 99:1830 의 여섯 행 그대로 — 메뉴명 줄은 없다. 카드가 말하는 것은 오늘
            «입력한» 내용이고, 확정 메뉴는 저장하기를 누르면 데이터에만 함께 남는다. */}
        <Card
          label="오늘 입력한 내용"
          rows={[
            { label: "알레르기", value: answerLabel("allergies", answers.allergies) },
            { label: "맵기 선호", value: answerLabel("spicyLevel", answers.spicyLevel) },
            { label: "뼈/순살 선택", value: answerLabel("boneType", answers.boneType) },
            { label: "수량", value: answerLabel("quantity", answers.quantity) },
            { label: "먹고가기/포장 선택", value: answerLabel("serviceType", answers.serviceType) },
            { label: "예산", value: answerLabel("budgetKrw", answers.budgetKrw) },
          ]}
        />
      </div>
    </Screen>
  );
}
