import React from "react";
import type { Question } from "../model";

/**
 * 마법사와 조건 수정 화면이 공유하는 선택지 그리드 — 같은 동작은 같은 부품으로 (UI 통일성).
 *
 * **그림은 조건 없이 그린다.** 한때 `showIcons` 로 «화면 안내» 설정에 묶어 두었는데,
 * 시안(99:1228 알레르기 · 99:1264 맵기 · 99:1270 뼈/순살 · 99:1281 포장/매장)에서 그림은
 * 켜고 끄는 것이 아니라 선택지의 일부다. 묶어 둔 탓에 기본 설정으로 들어온 사람은
 * 시안과 다른 화면을 봤고, 「안내 켜짐」 자리에는 시안에 없는 기능이 들어가 있었다.
 * 아이콘만 남는 일은 없다 — 라벨은 언제나 함께 그려진다.
 */
export function ChoiceGrid({ q, answers, setAnswers, onPicked, icons, marks, disabledValues }: {
  q: Question;
  answers: Record<string, unknown>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  /** 단일 선택을 고른 직후 호출 — 수정 화면에서 행 자동 접기에 사용 (다중 선택은 호출 안 함) */
  onPicked?: () => void;
  /**
   * 누를 수 없는 선택지 값들 — 장바구니의 주문 방식처럼 **지금 담긴 것이 지원하지 않는**
   * 값을 잠글 때 쓴다. 왜 못 누르는지는 이 부품이 말하지 않는다 — 이유 문장은 부른 쪽이
   * 바로 옆에 눈에 보이게 두어야 한다(비활성만 있고 이유가 없으면 고장으로 읽힌다).
   */
  disabledValues?: (string | number)[];
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
            disabled={disabledValues?.includes(o.value) ?? false}
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
            {icons?.[String(o.value)]
              ? <img className="ico" src={icons[String(o.value)]} alt="" aria-hidden="true" />
              : o.icon && <span className="ico" aria-hidden="true">{o.icon}</span>}
            {o.label}
            {(() => {
              const m = marks?.[String(o.value)];
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
