import React from "react";
import { useFlow } from "../flow";
import { A11Y_ITEMS, EDIT_LABELS, FLOW_STEPS, QUESTIONS, answerLabel } from "../model";
import { candidateName } from "../logic";
import { Card, Cta, Screen } from "../components";
import "./profile.css";

/**
 * 화면목록 S01 — 시작 화면. Figma 150:162(S01a 최초 방문) · 150:190(S01b 재방문).
 *
 * **시안 두 장은 같은 화면의 두 상태다.** 저장본이 있으면 제목·부제·버튼이 바뀔 뿐
 * 화면이 늘지 않는다. 구성도 시안 그대로다:
 *   진행 표시 → 제목(22px) → 부제(15px) → **넓은 여백** → 아래 붙는 CTA
 * 본문 문단은 **없다.** 한때 여기에 «로그인이 없습니다…» 안내를 깔아 두었는데,
 * 시안의 TitleBlock 아래는 Spacer 하나뿐이다(150:186 · 150:214).
 *
 * 뒤로가기도 없다. 시안 Header 에는 있지만 홈은 흐름의 첫 화면이라 돌아갈 곳이 없다 —
 * 눌러도 아무 일이 없는 버튼을 두는 것이 시안을 지키는 일은 아니다. `onBack` 을 넘기지
 * 않으면 `Screen` 이 아예 그리지 않으므로, 앞으로 한 걸음이라도 간 뒤에만 보인다.
 *
 * 디자인의 «시작하기»는 곧바로 주문이 아니라 **프로필 생성으로** 간다(5단계 표시의 1→2).
 *
 * 조회·수정·삭제(무로그인 가이드 4번)는 시안에 없다. 없앨 수는 없고 — 그건 우리가 지켜야
 * 하는 요건이다 — 대신 **접어 둔다.** 펴기 전 화면은 시안과 같고, 필요한 사람은 한 걸음
 * 안에서 무엇이 저장됐는지 보고 고칠 수 있다.
 */
export function Home() {
  const { saved, fixture, savedCoversAll, startFromSaved, deleteSaved, editSaved, setStep } = useFlow();

  /**
   * «처음부터 새로 시작하기»를 누르면 기록이 지워진다 — 되돌릴 수 없으므로 한 번 되묻는다.
   *
   * `window.confirm` 을 쓰지 않는다. 브라우저가 그리는 창이라 큰 글씨·고대비가 적용되지
   * 않고, 화면 낭독기가 읽는 방식도 제각각이며, 그 순간 화면 전체가 멈춘다. 이 서비스에서
   * 되묻기는 «화면이 하는 일»이지 브라우저에 맡길 일이 아니다.
   */
  const [asking, setAsking] = React.useState(false);
  const 새로시작 = () => { deleteSaved(); setStep("profile"); };

  /* 저장본 요약 — **들어 있는 것을 전부** 줄로 만든다.
   *
   * 한때 알레르기와 맵기 둘만 보여줬다. 실제로는 답변 일곱 개가 전부 저장되는데,
   * 그중 어느 둘을 보여줄지 **우리가 골랐던** 것이다. 그러면 저장된 사람은 형태·이용
   * 방식·수량·컵·예산이 남아 있다는 사실을 확인할 방법이 없다. 무로그인 가이드 4번은
   * «저장된 정보를 조회·수정·삭제할 수 있어야 합니다»라고 적혀 있고, 조회는 «일부를
   * 조회»가 아니다. 비어 있는 항목은 여전히 줄을 만들지 않는다 — 없는 것을 «아직 선택
   * 안 함»으로 채우면 저장된 것보다 저장 안 된 것이 더 눈에 띈다. */
  const savedRows = saved
    ? [
      ...(saved.lastCandidateId && fixture
        ? [{ label: "지난 메뉴", value: candidateName(fixture, saved.lastCandidateId) }]
        : []),
      ...QUESTIONS
        .filter((q) => saved.answers[q.key] !== undefined)
        .map((q) => ({ label: EDIT_LABELS[q.key] ?? q.key, value: answerLabel(q.key, saved.answers[q.key]) })),
      { label: "화면 설정", value: A11Y_ITEMS.filter((i) => saved.a11y[i.key] === true).map((i) => i.label).join("·") || "기본" },
    ]
    : [];

  return (
    <Screen
      steps={{ labels: FLOW_STEPS, current: 1 }}
      label={saved ? "다시 오신 것을 확인하는 시작 화면" : "시작 화면"}
      /* 시안 150:184 · 150:212 — 한 문장이 통째로 22px Bold 다. 강조어를 키우는 것은
         질문 화면(99:1276)의 문법이지 여기 것이 아니다. */
      title={saved ? "다시 오셨네요" : "KioBridge에 오신 걸 환영해요"}
      subtitle={saved
        /* 시안 150:213 은 «화면 설정»만 말한다. 저장본에 답변 일곱 개가 다 들어 있을
           때는 그 문장이 실제보다 적게 말하므로, 그 경우에만 우리 문장을 쓴다. */
        ? (savedCoversAll
          ? "이 기기에 지난번 주문과 화면 설정이 남아 있어요"
          : "이 기기에 저장된 화면 설정이 있어요")
        : "몇 가지만 물어보고 화면을 맞춤 설정해드릴게요"}
      actions={saved
        ? asking
          /* 되묻는 중 — 아래 버튼 자리를 그대로 쓴다. 새 창을 띄우거나 버튼을 늘리는 대신
             같은 자리에서 «무엇을 물어보는지»만 바뀐다. 되돌릴 수 없는 쪽을 주 버튼으로
             두지 않는다 — 습관적으로 첫 버튼을 누르는 사람에게 삭제가 걸리면 안 된다. */
          ? <>
            <Cta tone="primary" label="아니요, 그대로 둘게요" onClick={() => setAsking(false)} />
            <Cta tone="danger" label="네, 지우고 새로 시작할게요" onClick={새로시작} />
          </>
          : <>
            {/* 시안 라벨은 「이전 화면 설정 사용」이다. 저장본에 답변이 다 있으면 이 버튼은
                마법사를 통째로 건너뛰고 추천 화면으로 간다 — 시안이 그린 적 없는 동작이라
                시안 라벨을 붙이면 이름과 하는 일이 어긋난다. 시안이 그린 경우(설정만
                저장)에는 시안 문구를 그대로 쓰고, 그 밖의 경우에만 우리가 적는다. */}
            <Cta tone="primary" disabled={!fixture} onClick={startFromSaved}
              label={savedCoversAll ? "지난번과 똑같이 주문하기" : "이전 화면 설정 사용"} />
            {/* 시안 라벨 「새로 설정하기」 — 이름 그대로 **지난 기록을 버리고** 다시 정한다.
                한때 이 버튼은 지우지 않고 화면만 옮겼고, 지우기는 따로 한 장 더 있었다.
                두 버튼이 같은 뜻으로 읽힌다는 지적이 맞았다 — 이름이 하는 말과 코드가 하는
                일이 달랐던 것이고, 그럴 때는 코드를 이름에 맞춘다.
                이번에 저장할지는 바로 다음 걸음(S03)에서 다시 정한다. */}
            <Cta label="새로 설정하기" disabled={!fixture} onClick={() => setAsking(true)} />
          </>
        : <>
          <Cta tone="primary" disabled={!fixture} onClick={() => setStep("profile")} label="시작하기" />
        </>}
    >
      {saved && (
        <>
          {/* 무로그인 가이드 4번의 «조회·수정». 시안에는 없으므로 **접어 둔다** —
              펴기 전 화면은 시안(150:190)과 같고, 무엇이 저장됐는지 확인하려는 사람은
              한 번만 누르면 된다. 삭제는 아래 «새로 설정하기»가 맡는다.
              열림 상태를 기억하지 않는다 — 다음에 와도 첫 인상은 다시 시안이어야 한다. */}
          <details className="home-saved">
            <summary>
              저장된 내용 보기
              <span className="home-savedcount">{savedRows.length}가지</span>
              <span aria-hidden="true">▾</span>
            </summary>
            <div className="home-savedbody">
              <Card label="이 기기에 저장된 기록" rows={savedRows} />
              <p className="p-note">
                {savedCoversAll ? "저장된 항목은 다시 여쭤보지 않습니다." : "저장돼 있지 않은 것만 다시 여쭤봅니다."}
              </p>
              {/* 고칠 길을 **고칠 대상 바로 아래** 둔다. 조회와 삭제는 있었는데 수정만
                  없어서, 한 항목을 바꾸려면 주문을 처음부터 다시 해야 했다. 그건 수정이 아니다. */}
              <button type="button" className="btn ghost home-edit" onClick={editSaved}>
                저장된 내용 수정
                <small>지우지 않고 항목만 고칩니다.</small>
              </button>
            </div>
          </details>

          {/* 되묻는 중에만 이유를 말한다. 평소에 «지워집니다» 경고를 깔아 두면 지울
              생각이 없는 사람까지 매번 읽어야 하고, 정작 지우는 순간에는 새로울 것이
              없어 그냥 지나친다. 경고는 그 일이 일어나려는 자리에 있어야 한다. */}
          {asking && (
            <p className="home-ask" role="alert">
              <b>이 기기에 저장된 기록을 지우고 처음부터 시작합니다.</b> 되돌릴 수 없습니다.
            </p>
          )}
        </>
      )}

      {!fixture && <p className="hint">매장 정보를 불러오는 중입니다. 잠시만 기다려 주세요.</p>}
    </Screen>
  );
}
