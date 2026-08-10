import React from "react";
import { useFlow } from "../flow";
import { A11Y_ITEMS, FLOW_STEPS, PROBE_RESULT, PROBE_SAMPLE, PROBE_SIZES, type A11y } from "../model";
import { Cta, Emphasize, RadioCard, Screen } from "../components";
import "./profile.css";

/**
 * 화면목록 S02 — 프로필(화면·안내) 생성. Figma 150:221(1/3 글씨 크기) ·
 * 150:454(2/3 고대비) · 150:509(3/3 화면 안내).
 *
 * 디자인이 한 화면을 세 걸음으로 나눈 이유는 **한 번에 하나만 고르게 하기 위해서**다.
 * 토글 7개를 한꺼번에 보여주면 «무엇을 켜야 나에게 맞는지»를 사용자가 먼저 알아야 하고,
 * 그건 이 제품이 없애려는 부담 그 자체다.
 *
 * 다만 7종을 셋으로 줄이지는 않는다. 제출물이 접근성 채널 8종을 선언하고 있고,
 * 선언한 채널이 화면에서 닿지 않으면 그건 «없는 기능을 있다고 말한 것»이 된다.
 * 그래서 «자세한 설정»에 7종을 전부 펼쳐 둔다(접지 않는다).
 *
 * **«자세한 설정»은 마지막 걸음에만 둔다.** 세 걸음 모두에 붙여 두었더니 걸음마다 같은
 * 목록이 800px 씩 따라붙어, 디자인이 말하는 «제목 → 선택지 두 장 → 넓은 여백 → 아래
 * 버튼»이 세 화면 다 무너졌다. 골라야 할 것을 다 고른 뒤 마지막 화면에서 세부를 여는
 * 순서가 «한 번에 하나»와도 맞는다. 7종은 한 걸음 뒤로 옮겨졌을 뿐 그대로 다 닿는다.
 *
 * 「화면 글씨 맞춰보기」 문답은 1단계에 남는다 — 설정 이름 대신 실제 크기로 렌더한
 * 문장을 보여주고 보이는지만 묻는 것이 이 화면의 핵심이기 때문이다.
 */

/** 한 걸음 = 제목 + 라디오 두 장. 바꾸는 플래그는 하나뿐이다. */
const SUBSTEPS: {
  key: keyof A11y;
  title: string;
  /** 제목 안에서 크게 읽힐 어절 (Figma 는 한 문장 안에서 강조어만 키운다) */
  word: string;
  group: string;
  options: { on: boolean; label: string; desc: string; preview: string; previewSize?: string }[];
}[] = [
  {
    key: "largeText", title: "더 읽기 편한 크기를 선택해주세요", word: "크기", group: "글씨 크기",
    options: [
      { on: false, label: "기본 크기", desc: "지금 화면과 같은 크기로 보여드려요", preview: "가", previewSize: "16px" },
      // 디자인 문구는 «20% 크게»지만 우리 화면은 18px→23px(약 28%)이고 버튼도 함께 커진다.
      // 숫자를 옮겨 적으면 화면과 다른 말이 되므로 실제로 일어나는 일을 적는다.
      { on: true, label: "큰 글씨", desc: "글자와 버튼이 한 단계 커집니다", preview: "가", previewSize: "21px" },
    ],
  },
  {
    key: "highContrast", title: "더 또렷하게 보이는 화면을 선택해주세요", word: "또렷하게", group: "고대비",
    options: [
      { on: false, label: "기본 화면", desc: "지금과 같은 밝기·색상으로 보여드려요", preview: "가" },
      { on: true, label: "고대비 화면", desc: "검은 배경에 밝은 글씨로 바뀝니다", preview: "가" },
    ],
  },
  {
    key: "visualGuidance", title: "필요한 안내 방식을 선택해주세요", word: "안내 방식", group: "화면 안내",
    options: [
      { on: false, label: "기본", desc: "추가 안내 없이 진행해요", preview: "○" },
      // 디자인은 «다음에 누를 버튼을 테두리와 화살표로 강조»라고 적혀 있으나 그 기능은
      // 만들지 않았다. 이 플래그가 실제로 하는 일(선택지에 그림 병기)을 적는다.
      { on: true, label: "안내 켜짐", desc: "선택지에 그림이 함께 표시됩니다", preview: "🍗" },
    ],
  },
];

export function ProfileSetup() {
  const {
    a11y, setA11y, setFlag, probeStep, setProbeStep, probeResult, setProbeResult,
    profileStep, setProfileStep, setStep, } = useFlow();
  const sub = profileStep;
  const setSub = (n: number) => setProfileStep(n as 1 | 2 | 3);

  const here = SUBSTEPS[sub - 1];
  const last = sub === SUBSTEPS.length;
  const back = () => (sub > 1 ? setSub(sub - 1) : setStep("start"));
  const next = () => (last ? setStep("saveChoice") : setSub(sub + 1));

  /* Figma 의 MiniStepIndicator(183:205) 자리. `Screen` 의 eyebrow 는 <p> 안에 들어가므로
     여기서는 인라인 요소만 쓴다 — 블록을 넣으면 브라우저가 문단을 쪼개 버린다.
     점 색만으로 위치를 말하지 않도록 «3단계 중 n단계 — 그룹 이름»을 옆에 붙인다. */
  const miniSteps = (
    <span className="p-mini">
      {SUBSTEPS.map((s, i) => (
        <span key={s.key} className={`p-minidot${i + 1 <= sub ? " on" : ""}`} aria-hidden="true">{i + 1}</span>
      ))}
      <span className="p-minitext">{`${SUBSTEPS.length}단계 중 ${sub}단계 — ${here.group}`}</span>
    </span>
  );

  return (
    <Screen
      onBack={back}
      steps={{ labels: FLOW_STEPS, current: 2 }}
      label="화면과 안내 설정"
      eyebrow={miniSteps}
      title={<Emphasize text={here.title} word={here.word} />}
      subtitle="고르시면 이 화면이 바로 바뀝니다. 언제든 다시 바꾸실 수 있습니다."
      actions={<>
        <Cta tone="primary" label="다음" onClick={next} />
      </>}
    >
      <div className="kb-radios" role="group" aria-label={here.group}>
        {here.options.map((o) => (
          <RadioCard
            key={o.label} label={o.label} desc={o.desc} preview={o.preview} previewSize={o.previewSize}
            selected={a11y[here.key] === o.on}
            onPick={() => setFlag(here.key, o.on)}
          />
        ))}
      </div>

      {/* 화면목록 S02 «실시간 변동되는 화면을 통해 최적 화면 맞춤» — 1단계에만 둔다.
          글씨 크기를 스스로 고르기 어려운 분에게 «보이는지»만 물어 대신 정해 드린다. */}
      {sub === 1 && (probeStep === null ? (
        <div className="btnrow">
          <Cta label="화면 글씨 맞춰보기" onClick={() => { setProbeStep(0); setProbeResult(null); }} />
          {probeResult !== null && (
            <span className="hint">
              {probeResult === 0 && "기본 크기로 두었습니다."}
              {probeResult !== 0 && "큰 글씨를 켰습니다."}
              {" "}위에서 언제든 바꾸실 수 있습니다.
              {/* 가장 크게 해도 부족했다면 글씨 외의 도움이 필요할 수 있다. 다만 그것을
                  여기서 대신 켜지는 않는다 — 바로 다음 걸음에서 여쭤볼 질문이다. */}
              {probeResult === 2 && (
                <> 글씨를 가장 크게 해도 불편하시면, <b>다음 단계에서 고대비 화면</b>도 함께 보시겠어요?</>
              )}
            </span>
          )}
        </div>
      ) : (
        <div className="card p-probe" aria-labelledby="probehead">
          <h2 id="probehead">화면 글씨가 잘 보이시나요?</h2>
          <p className="p-sample" aria-hidden="true" style={{ fontSize: PROBE_SIZES[probeStep] }}>{PROBE_SAMPLE}</p>
          <p className="hint">위 문장이 편하게 읽히시면 «잘 보여요»를 눌러 주세요.</p>
          <div className="choices" role="group" aria-label="글씨 크기 확인">
            <button type="button" className="choice" onClick={() => {
              setA11y((s) => ({ ...s, ...PROBE_RESULT[probeStep] }));
              setProbeResult(probeStep); setProbeStep(null);
            }}>잘 보여요</button>
            <button type="button" className="choice" onClick={() => {
              if (probeStep < PROBE_SIZES.length - 1) { setProbeStep(probeStep + 1); return; }
              const end = PROBE_SIZES.length - 1;
              setA11y((s) => ({ ...s, ...PROBE_RESULT[end] }));
              setProbeResult(end); setProbeStep(null);
            }}>조금 작아요</button>
          </div>
        </div>
      ))}

      {/* 선언한 접근성 채널 7종은 마지막 걸음에서 전부 닿는다 — 접어 두지 않는다 */}
      {last && (
        <details className="p-more" open>
          <summary>
            자세한 설정
            <span className="p-morehint">위에서 고르신 것을 포함해 7가지를 하나씩 켜고 끌 수 있어요</span>
            <span aria-hidden="true">▾</span>
          </summary>
          <div className="p-morebody">
            <div className="a11ylist">
              {A11Y_ITEMS.map((it) => (
                <button key={it.key} type="button" className="a11yrow" aria-pressed={a11y[it.key] === true}
                  onClick={() => setFlag(it.key, !(a11y[it.key] as boolean))}>
                  <span className="alabel">{it.label}</span>
                  <span className="aeffect">{it.effect}</span>
                  <span className="astate">{a11y[it.key] ? "켬" : "끔"}</span>
                </button>
              ))}
            </div>

            <h3 className="p-subhead">어떻게 입력하시겠어요?</h3>
            <div className="choices" role="group" aria-label="입력 방식">
              <button type="button" className="choice" aria-pressed={a11y.preferredInput === "TOUCH"}
                onClick={() => setFlag("preferredInput", "TOUCH")}>직접 누르기</button>
              <button type="button" className="choice" aria-pressed={a11y.preferredInput === "ASSISTED"}
                onClick={() => setFlag("preferredInput", "ASSISTED")}>
                옆에서 도와주기<small>보호자·직원이 대신 눌러 주는 경우</small>
              </button>
            </div>
            <p className="hint">
              도와주기를 고르시면 입력 출처를 <b>대리 입력</b>으로 기록합니다. 본인 확인을 대신하지는 않습니다.
              {" "}음성 입력은 이번 버전에 없습니다 — 없는 기능을 있다고 표시하지 않습니다.
            </p>
          </div>
        </details>
      )}
    </Screen>
  );
}
