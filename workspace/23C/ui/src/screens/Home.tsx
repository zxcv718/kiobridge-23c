import React from "react";
import { useFlow } from "../flow";
import { A11Y_ITEMS, FLOW_STEPS, QUESTIONS, answerLabel } from "../model";
import { candidateName } from "../logic";
import { Card, Cta, Emphasize, Screen } from "../components";
import "./profile.css";

/**
 * 화면목록 S01 — 시작 화면. Figma 150:162(S01a 최초 방문) · 150:190(S01b 재방문).
 *
 * **한 화면에 시작 버튼은 한 벌뿐이다.** 예전에는 저장본 카드와 시작 카드가 따로 있어
 * «시작» 결정이 두 곳으로 갈렸고, 직원 도움 버튼이 한 화면에 세 번 나왔다. 디자인의 두
 * 시안은 같은 화면의 두 상태다 — 저장본이 있으면 제목과 버튼이 바뀔 뿐 화면이 늘지 않는다.
 *
 * 디자인의 «시작하기»는 곧바로 주문이 아니라 **프로필 생성으로** 간다(5단계 표시의 1→2).
 * 화면 설정을 먼저 맞추고 주문에 들어가는 것이 이 흐름의 요지다.
 *
 * 되살리기 버튼은 **하나뿐이다.** 무엇을 되살릴지는 저장할 때 이미 정해졌기 때문이다.
 * 여기서 "전부 쓸까 / 설정만 쓸까"를 또 물으면 같은 결정을 두 번 묻는 것이다. 그래서
 * 버튼 라벨이 저장본에 실제로 들어 있는 답변을 보고 «무슨 일이 일어나는지»를 그대로 말한다.
 *
 * 시연 사례 카드는 없앴다. 디자인에 없기도 하지만, 첫 화면에서 «주문»과 «시연»이 나란히
 * 놓이면 처음 온 사람이 무엇을 눌러야 하는지부터 고르게 된다.
 */
export function Home() {
  const { saved, fixture, savedCoversAll, startFromSaved, deleteSaved, setStep, staffBtn, t } = useFlow();

  /* 저장본 요약 — 실제로 들어 있는 것만 줄로 만든다. 비어 있는 항목을 «아직 선택 안 함»
     으로 채우면 저장된 것보다 저장 안 된 것이 더 눈에 띈다. */
  const savedRows = saved
    ? [
      ...(saved.lastCandidateId && fixture
        ? [{ label: "지난 메뉴", value: candidateName(fixture, saved.lastCandidateId) }]
        : []),
      ...QUESTIONS
        .filter((q) => ["allergies", "spicyLevel"].includes(q.key) && saved.answers[q.key] !== undefined)
        .map((q) => ({ label: q.key === "allergies" ? "알레르기" : "맵기", value: answerLabel(q.key, saved.answers[q.key]) })),
      { label: "화면 설정", value: A11Y_ITEMS.filter((i) => saved.a11y[i.key] === true).map((i) => i.label).join("·") || "기본" },
    ]
    : [];

  return (
    <Screen
      steps={{ labels: FLOW_STEPS, current: 1 }}
      label={saved ? "다시 오신 것을 확인하는 시작 화면" : "시작 화면"}
      title={saved
        ? <Emphasize text="다시 오셨네요" word="다시" />
        : <Emphasize text="KioBridge에 오신 걸 환영해요" word="KioBridge" />}
      subtitle={saved
        ? "이 기기에 지난번 기록이 있어요. 자동으로 적용하지 않으니 확인하고 골라 주세요."
        : "몇 가지만 여쭤보고 화면을 맞춰 드릴게요."}
      actions={saved
        ? <>
          <Cta tone="primary" disabled={!fixture} onClick={startFromSaved}
            label={savedCoversAll ? "지난번과 똑같이 주문하기" : "저장된 설정으로 시작하기"} />
          <Cta label="처음부터 새로 시작하기" disabled={!fixture} onClick={() => setStep("profile")} />
          {/* 지우기는 되돌릴 수 없다 — 시작 버튼들과 같은 무게로 놓지 않는다 */}
          <Cta tone="danger" label="이 기기에서 기록 지우기" onClick={deleteSaved} />
          {staffBtn()}
        </>
        : <>
          <Cta tone="primary" disabled={!fixture} onClick={() => setStep("profile")} label="시작하기" />
          {staffBtn()}
        </>}
    >
      {saved && (
        <>
          {/* 부제가 이미 «이 기기에 지난번 기록이 있어요»라고 말했다 — 카드 위에
              같은 말을 한 번 더 두면 버튼 넉 장과 함께 화면이 넘친다 */}
          <Card label="이 기기에 저장된 기록" rows={savedRows} />
          <p className="p-note">
            {savedCoversAll ? "저장된 항목은 다시 여쭤보지 않습니다." : "저장돼 있지 않은 것만 다시 여쭤봅니다."}
          </p>
        </>
      )}

      {!saved && (
        <p className="p-note">
          {t(
            "로그인이 없습니다. 답해 주신 내용은 이번 한 번만 쓰고 저장하지 않습니다.",
            "로그인 없이 바로 시작합니다. 답해 주신 내용은 이번 한 번만 사용하고 저장하지 않는 것이 기본이며, 저장할지는 «저장 방식» 단계에서 한 번만 여쭤봅니다. 추천 뒤에는 반드시 확인을 거치며, 결제 직전에서 멈춥니다.",
          )}
        </p>
      )}

      {!fixture && <p className="hint">매장 정보를 불러오는 중입니다. 잠시만 기다려 주세요.</p>}
    </Screen>
  );
}
