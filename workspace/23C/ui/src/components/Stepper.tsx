import React from "react";

/**
 * 수를 하나씩 올리고 내리는 입력 — 디자인 S10(99:1292) 「얼마나 드실 건가요?」의 «− 1 +».
 *
 * 선택지 버튼(1개·2개·3개)으로 두었던 자리다. 계약은 `quantity: integer, minimum 1` 이라
 * 상한이 없는데 버튼으로는 셋까지만 고를 수 있었으니, 시안과 다르기도 하고 **계약이 허용하는
 * 것을 화면이 막고 있기도** 했다.
 *
 * 접근성에서 스테퍼는 조심해야 하는 물건이다 — 작은 표적 두 개를 반복해서 정확히 눌러야 해서,
 * 손이 떨리는 분께 불리하다. 그래서 두 가지를 지킨다:
 *  · 타깃을 키운다. 누르는 자리는 64px 이고 «큰 글씨»·«누르기 편하게»를 켜면 함께 커진다.
 *  · **상한에서 막다른 길을 만들지 않는다.** 더 못 누르는 이유를 말하고 직원 도움으로 잇는다.
 *
 * 화면 낭독기에는 버튼 세 개가 아니라 **하나의 수 입력**으로 알린다(role="spinbutton").
 * 「빼기, 1, 더하기」로 읽히면 지금 값이 몇인지가 셋 중 어디에 있는지 알 수 없다.
 */
export function Stepper({ value, onChange, min = 1, max, unit = "개", label, atMaxNote }: {
  value: number | undefined;
  onChange: (next: number) => void;
  min?: number;
  max: number;
  unit?: string;
  /** 화면 낭독기용 이름 — 화면에 제목이 따로 있어도 이 입력이 무엇인지 스스로 말해야 한다 */
  label: string;
  /** 상한에 닿았을 때 보여줄 안내 — 없으면 아무 말도 하지 않는다 */
  atMaxNote?: React.ReactNode;
}) {
  const cur = value ?? min;

  /* 화면에 «1»이 떠 있는데 답은 비어 있는 상태를 만들지 않는다.
     그대로 두면 사용자는 1을 고른 것처럼 보이는 화면 앞에서 «다음»이 꺼져 있는 이유를
     알 수 없다. 보이는 값이 곧 기록되는 값이어야 한다 — 감춰진 기본값이 아니라 **보이는**
     기본값이므로, 눈앞에 있는 수를 그대로 답으로 삼는 것이 맞다. */
  React.useEffect(() => {
    if (value === undefined) onChange(min);
  }, [value, min, onChange]);

  const 내리기 = () => onChange(Math.max(min, cur - 1));
  const 올리기 = () => onChange(Math.min(max, cur + 1));

  return (
    <div className="stepper-wrap">
      <div
        className="stepper"
        role="spinbutton"
        aria-label={label}
        aria-valuenow={cur}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={`${cur}${unit}`}
        tabIndex={0}
        onKeyDown={(e) => {
          // 방향키로도 바꿀 수 있어야 한다 — spinbutton 을 쓰는 사람이 기대하는 조작이다
          if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); 올리기(); }
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); 내리기(); }
        }}
      >
        {/* 그림만 있는 버튼을 만들지 않는다. «−»·«+» 는 기호라 낭독기가 읽지 못하므로
            보이지 않는 글자를 함께 둔다. 버튼 자체는 탭 순서에서 빼고(스테퍼가 대표한다)
            누르기로만 쓴다 — 탭이 한 칸에 셋씩 서면 앞뒤로 지나가기가 번거로워진다. */}
        <button type="button" className="stepbtn" onClick={내리기} disabled={cur <= min} tabIndex={-1}>
          <span aria-hidden="true">−</span><span className="sr">하나 줄이기</span>
        </button>
        <output className="stepval">{cur}<span className="stepunit">{unit}</span></output>
        <button type="button" className="stepbtn" onClick={올리기} disabled={cur >= max} tabIndex={-1}>
          <span aria-hidden="true">+</span><span className="sr">하나 늘리기</span>
        </button>
      </div>
      {cur >= max && atMaxNote && <p className="hint stepnote">{atMaxNote}</p>}
    </div>
  );
}
