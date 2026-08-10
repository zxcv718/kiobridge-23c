import React from "react";
import type { Question } from "../model";

/** 마법사와 조건 수정 화면이 공유하는 선택지 그리드 — 같은 동작은 같은 부품으로 (UI 통일성). */
export function ChoiceGrid({ q, answers, setAnswers, onPicked, showIcons }: {
  q: Question;
  answers: Record<string, unknown>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  /** 단일 선택을 고른 직후 호출 — 수정 화면에서 행 자동 접기에 사용 (다중 선택은 호출 안 함) */
  onPicked?: () => void;
  /** 그림 함께 보기 — 아이콘만 두지 않고 반드시 글자를 병기한다 */
  showIcons?: boolean;
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
            {showIcons && o.icon && <span className="ico" aria-hidden="true">{o.icon}</span>}
            {o.label}{o.sub && <small>{o.sub}</small>}
          </button>
        );
      })}
    </div>
  );
}
