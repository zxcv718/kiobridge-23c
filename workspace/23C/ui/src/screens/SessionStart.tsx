import React from "react";
import { useFlow } from "../flow";
import { FLOW_STEPS, QUESTIONS, answerLabel } from "../model";
import { candidateName } from "../logic";
import { Card, Cta, Emphasize, Screen } from "../components";
import "./profile.css";

/**
 * 화면목록 S05 — 세션 시작. Figma 150:396 «S05 Session 시작 (재사용 확인)».
 *
 * 여기서 하는 일은 **불러온 것을 보여주고 확인받는 것**이다. 저장본을 자동으로 적용해
 * 곧바로 주문에 들어가면 «자동으로 불러온 정보의 재확인» 원칙이 깨진다 — 지난번 알레르기
 * 답이 지금도 맞는지는 사람만 안다.
 *
 * 디자인은 지난 주문이 있는 경우(네/아니오)만 그렸다. 프로필만 새로 만들고 온 사람에게는
 * 되살릴 주문이 없으므로, 그때는 방금 정한 화면 설정을 확인시키고 한 갈래로만 보낸다.
 * 없는 «지난 주문» 카드를 빈 채로 그리지 않는다.
 *
 * **카드는 한 장이다.** 지난 주문이 있을 때 화면 설정까지 카드로 또 세우면 디자인의
 * 넓은 여백이 사라지고, 정작 확인받아야 할 «지난 주문»이 둘 중 하나로 묻힌다. 화면
 * 설정은 바로 앞 화면(S03)에서 이미 카드로 확인했으므로 여기서는 한 줄로만 되짚는다.
 */
export function SessionStart() {
  const {
    saved, fixture, a11y, storeToggle, setStoreToggle, startWizard, startFromSaved, setStep, } = useFlow();

  /* 저장 «의사»만 있고 답변이 없는 저장본이 있을 수 있다 — S03 에서 저장하기를 고르면
     그 자리에서 화면 설정만 먼저 남기기 때문이다. 그건 «지난 주문»이 아니다. */
  const prev = saved && QUESTIONS.some((q) => saved.answers[q.key] !== undefined) ? saved : null;
  const storeName = fixture?.manifest.displayName ?? fixture?.manifest.name ?? "";

  /**
   * 처음부터 새로 고르기.
   *
   * startWizard 는 새 흐름을 여는 함수라 저장 의사(storeToggle)까지 초기값으로 되돌린다.
   * 이 흐름에서는 그 결정을 **바로 앞 화면(S03)에서 방금 받았으므로** 되돌려 놓으면
   * 주문 확정 때 finishOrder 가 저장을 건너뛴다. 그래서 다시 세워 준다.
   * (flow.tsx 를 고쳐 startWizard 가 저장 의사를 보존하게 하는 편이 옳다 — 통합 때 볼 것)
   */
  const beginFresh = () => {
    const keep = storeToggle;
    startWizard();
    if (keep) setStoreToggle(true);
  };

  /** 이번에 적용된 화면 설정 한 줄 — 카드를 한 장 더 세우지 않고 되짚기만 한다. */
  const settingLine = [
    a11y.largeText ? "큰 글씨" : "기본 크기",
    a11y.highContrast ? "고대비 화면" : "기본 화면",
    a11y.visualGuidance ? "화면 안내 켬" : "화면 안내 끔",
    a11y.preferredInput === "ASSISTED" ? "옆에서 도와주기" : "직접 누르기",
    storeToggle ? "이 기기에 저장" : "이번만 사용",
  ].join(" · ");

  return (
    <Screen
      onBack={() => setStep("saveChoice")}
      steps={{ labels: FLOW_STEPS, current: 4 }}
      label="세션 시작"
      /* 시안 150:422·150:423·208:754/756 그대로. 강조어를 키우지 않고, 버튼은 「네」·「아니오」다.
         저장본이 없을 때(시안에 없는 상태)의 문구만 우리가 적는다. */
      title={prev ? "이전 주문과 동일하게 준비해드릴까요?" : "이제 주문을 시작할게요"}
      subtitle={prev
        ? "지난번에 주문하신 내용이에요"
        : "방금 맞추신 화면 설정으로 진행합니다"}
      actions={<>
        {prev
          ? <>
            <Cta tone="primary" label="네" onClick={startFromSaved} disabled={!fixture} />
            <Cta label="아니오" onClick={beginFresh} disabled={!fixture} />
          </>
          : <Cta tone="primary" label="주문 시작하기" onClick={beginFresh} disabled={!fixture} />}
      </>}
    >
      {prev && fixture ? (
        <>
          <p className="p-cap">지난 주문{storeName ? ` · ${storeName}` : ""}</p>
          <Card
            label="지난 주문 내용"
            rows={[
              ...(prev.lastCandidateId ? [{ label: "메뉴명", value: candidateName(fixture, prev.lastCandidateId) }] : []),
              { label: "알레르기", value: answerLabel("allergies", prev.answers.allergies) },
              { label: "맵기 선호", value: answerLabel("spicyLevel", prev.answers.spicyLevel) },
              { label: "뼈/순살 선택", value: answerLabel("boneType", prev.answers.boneType) },
              { label: "수량", value: answerLabel("quantity", prev.answers.quantity) },
              /* 시안(150:396)의 여섯 행을 그대로 — 먹고가기/포장·예산도 저장되는 값이다 */
              { label: "먹고가기/포장 선택", value: answerLabel("serviceType", prev.answers.serviceType) },
              { label: "예산", value: answerLabel("budgetKrw", prev.answers.budgetKrw) },
            ]}
          />
          {/* 시안(150:396)에는 이 줄이 없다 — 화면 설정은 바로 앞 걸음(S03)에서 카드로
              확인하고 왔으므로 여기서는 접어 둔다. */}
          <details className="home-saved">
            <summary>이번 화면 설정<span aria-hidden="true">▾</span></summary>
            <p className="p-willsave">{settingLine}</p>
          </details>
        </>
      ) : (
        <>
          <p className="p-cap">이번 화면 설정</p>
          <Card
            label="이번에 적용된 화면 설정"
            rows={[
              { label: "글씨 크기", value: a11y.largeText ? "큰 글씨" : "기본 크기" },
              { label: "고대비", value: a11y.highContrast ? "고대비 화면" : "기본 화면" },
              { label: "화면 안내", value: a11y.visualGuidance ? "안내 켜짐" : "기본" },
              { label: "입력 방식", value: a11y.preferredInput === "ASSISTED" ? "옆에서 도와주기" : "직접 누르기" },
              { label: "저장 방식", value: storeToggle ? "이 기기에 저장" : "이번만 사용" },
            ]}
          />
        </>
      )}
    </Screen>
  );
}
