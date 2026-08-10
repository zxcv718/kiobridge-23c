import React from "react";
import type { Question } from "../model";

/** 마법사와 조건 수정 화면이 공유하는 선택지 그리드 — 같은 동작은 같은 부품으로 (UI 통일성). */
export function ChoiceGrid({ q, answers, setAnswers, onPicked, showIcons, icons, marks }: {
  q: Question;
  answers: Record<string, unknown>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  /** 단일 선택을 고른 직후 호출 — 수정 화면에서 행 자동 접기에 사용 (다중 선택은 호출 안 함) */
  onPicked?: () => void;
  /** 그림 함께 보기 — 아이콘만 두지 않고 반드시 글자를 병기한다 */
  showIcons?: boolean;
  /**
   * 선택지 값 → Figma 에서 내려받은 그림 파일. 있으면 이모지 대신 이것을 그린다.
   *
   * 한때 이 자리를 CSS 로 우회했다 — 이모지를 `font-size: 0` 으로 감추고 같은 칸에
   * 배경 그림을 까는 방식이었는데, 그림이 끝내 안 나왔다. «그림을 그린다»를 CSS 의
   * 부작용으로 표현하면 왜 안 나오는지 알 수 없다. 그림은 `<img>` 로 그린다.
   */
  icons?: Record<string, string>;
  /**
   * 글자 **뒤에** 나란히 붙는 표식과 그 개수 (Figma S07 맵기: 순한맛 0 · 보통맛 1 · 매운맛 3).
   *
   * 정도(degree)를 나타내는 방법이다. 서로 다른 그림을 쓰면 «더 매운 것»이 아니라
   * «다른 종류»로 읽히지만, **같은 표식을 반복하면 순서가 그대로 보인다.**
   * 그림은 거드는 신호일 뿐이라 화면 낭독기에서는 숨긴다 — 순한맛·보통맛·매운맛이라는
   * 글자가 이미 순서를 말하고 있고, 「불꽃 세 개」를 읽어 줘 봐야 도움이 되지 않는다.
   */
  marks?: Record<string, { src: string; count: number }>;
}) {
  return (
    <div className="choices" role="group" aria-label={q.title}>
      {q.options.map((o) => {
        const cur = answers[q.key];
        const pressed = q.multi
          ? Array.isArray(cur) && (cur as unknown[]).includes(o.value)
          : cur === o.value;
        return (
          <button key={String(o.value)} type="button" className="choice" aria-pressed={pressed}
            onClick={() => {
              setAnswers((prev) => {
                if (!q.multi) return { ...prev, [q.key]: o.value };
                const list = new Set((prev[q.key] as unknown[]) ?? []);
                if (list.has(o.value)) list.delete(o.value); else list.add(o.value);
                if (o.value === "없음" && list.has("없음")) return { ...prev, [q.key]: ["없음"] };
                list.delete("없음");
                return { ...prev, [q.key]: [...list] };
              });
              if (!q.multi) onPicked?.();
            }}>
            {showIcons && icons?.[String(o.value)]
              ? <img className="ico" src={icons[String(o.value)]} alt="" aria-hidden="true" />
              : showIcons && o.icon && <span className="ico" aria-hidden="true">{o.icon}</span>}
            {o.label}
            {(() => {
              const m = showIcons ? marks?.[String(o.value)] : undefined;
              if (!m || m.count < 1) return null;
              return (
                <span className="kb-marks" aria-hidden="true">
                  {Array.from({ length: m.count }, (_, i) => (
                    <img key={i} src={m.src} alt="" />
                  ))}
                </span>
              );
            })()}
            {o.sub && <small>{o.sub}</small>}
          </button>
        );
      })}
    </div>
  );
}
