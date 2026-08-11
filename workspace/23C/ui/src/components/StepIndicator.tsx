import React from "react";

/**
 * 진행 단계 표시 (Figma `StepIndicator` 181:177 5종 · `MiniStepIndicator` 183:205 3종).
 *
 * 디자인은 5단계 큰 표시와 3단계 작은 표시를 따로 그렸지만, 다른 것은 «라벨이
 * 있느냐»뿐이라 하나로 묶었다. 라벨을 주면 큰 표시, 안 주면 점만 찍는다.
 *
 * **색만으로 현재 위치를 말하지 않는다.** 완료는 ✓, 현재는 번호가 들어가고,
 * 화면 낭독기에는 «5단계 중 2단계 — 프로필 생성» 이라고 문장으로 알린다.
 * 색각 이상이나 저시력 사용자에게 주황 점과 회색 점의 차이는 신호가 되지 못한다.
 */
export function StepIndicator({ total, current, labels, srLabel }: {
  /** 전체 단계 수. labels 를 주면 그 길이를 쓴다. */
  total?: number;
  /** 지금 단계 (1부터) */
  current: number;
  /** 단계 이름. 주면 아래에 글자가 붙고, 없으면 점만 찍는 작은 표시가 된다. */
  labels?: string[];
  /** 낭독기에 읽힐 문장. 기본값이 있지만 화면 성격에 맞게 바꿀 수 있다. */
  srLabel?: string;
}) {
  const n = labels?.length ?? total ?? 0;
  if (n <= 1) return null;
  const here = Math.min(Math.max(current, 1), n);
  const say = srLabel ?? `${n}단계 중 ${here}단계${labels ? ` — ${labels[here - 1]}` : ""}`;

  /* 지나온 비율. 시안(181:196 ConnectorProgress)은 첫 점 중심에서 지금 점 중심까지를
     주황으로 덮는다 — 칸마다 선을 나눠 색칠하면 점이 양끝에 붙는 배치에서 길이가 틀어진다. */
  const done = { "--steps-done": String((here - 1) / (n - 1)) } as React.CSSProperties;

  return (
    <div className={labels ? "kb-steps" : "kb-steps mini"} style={done}>
      {/* 점은 장식이다 — 뜻은 이 문장이 전한다 */}
      <span className="srline">{say}</span>
      {Array.from({ length: n }, (_, i) => {
        const no = i + 1;
        const state = no < here ? "done" : no === here ? "now" : "next";
        return (
          <div key={no} className={`kb-step ${state}`} aria-hidden="true">
            <span className="kb-dot">{state === "done" ? "✓" : no}</span>
            {labels && <span className="kb-steplabel">{labels[i]}</span>}
          </div>
        );
      })}
    </div>
  );
}
