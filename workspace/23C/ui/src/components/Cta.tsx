import React from "react";

/**
 * 버튼 하나 (Figma `Cta` 208:752~761 · `button` 38:1938).
 *
 * Figma 의 컴포넌트 설명이 «선택형/확인형 버튼 전부에 재사용» 이라고 못박고 있어서
 * 변형을 늘리지 않고 하나로 둔다. 디자인의 Yellow·Dark 변형은 만들지 않는다 —
 * 그건 고대비 상태를 그린 것이고, 우리는 `.app.contrast` 가 팔레트를 갈아끼워
 * 같은 버튼이 저절로 그렇게 된다(components.css ①).
 *
 * 아이콘만 있는 버튼은 만들 수 없다. `label` 이 필수인 것이 그 장치다 —
 * 제출물의 «아이콘 단독 금지» 보증이 타입 수준에서 지켜진다.
 */
export type CtaTone = "primary" | "white" | "danger";

export function Cta({ label, onClick, tone = "white", disabled, icon, full, ...rest }: {
  /** 버튼에 보이는 글자. 없앨 수 없다 — 아이콘만 있는 버튼을 못 만들게 하는 장치다. */
  label: React.ReactNode;
  onClick?: () => void;
  tone?: CtaTone;
  disabled?: boolean;
  /** 글자 **앞에** 붙는 그림. 글자를 대신하지 않는다. */
  icon?: React.ReactNode;
  /** 한 줄을 다 쓰는 큰 버튼 (Figma 의 354px CTA) */
  full?: boolean;
  "aria-label"?: string;
}) {
  const cls = ["btn", tone === "primary" ? "primary" : tone === "danger" ? "danger" : "ghost", full ? "full" : ""]
    .join(" ").trim();
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} {...rest}>
      {icon && <span className="ico" aria-hidden="true">{icon}</span>}
      {label}
    </button>
  );
}
