import React from "react";

/**
 * 카드 (Figma `SummaryCard` 185:209 · `RecentOrderCard` 185:227).
 *
 * 두 컴포넌트는 «왼쪽 라벨 · 오른쪽 값 · 사이에 구분선»으로 구조가 같아 하나로 묶었다.
 * 다른 것은 담기는 내용뿐이라, 값 목록을 `rows` 로 받는다.
 *
 * 값 옆의 «수정» 링크는 디자인에 있지만 여기서 만들지 않는다 — 무엇을 어디서
 * 고칠 수 있는지는 화면마다 다르고, 링크만 있고 동작이 없는 자리를 만들면
 * «없는 기능을 있다고 표시하지 않는다»는 원칙에 어긋나기 때문이다.
 * 고칠 수 있는 화면은 `action` 으로 진짜 버튼을 넘긴다.
 */
export interface CardRow {
  label: React.ReactNode;
  value: React.ReactNode;
  /** 이 줄을 고칠 수 있으면 진짜 버튼을 넘긴다. 없으면 아무것도 그리지 않는다. */
  action?: React.ReactNode;
}

export function Card({ title, hint, rows, children, tone, label }: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  rows?: CardRow[];
  children?: React.ReactNode;
  /** 강조 테두리 — 추천 카드처럼 이 화면의 주인공일 때 */
  tone?: "accent";
  /** 화면 낭독기용 이름 (제목이 없거나 제목만으로 부족할 때) */
  label?: string;
}) {
  return (
    <section className={tone === "accent" ? "card recwrap" : "card"} aria-label={label}>
      {title && <h2>{title}</h2>}
      {hint && <p className="hint">{hint}</p>}
      {rows && rows.length > 0 && (
        <dl className="kb-rows">
          {rows.map((r, i) => (
            <div className="kb-row" key={i}>
              <dt className="kb-rowlabel">{r.label}</dt>
              <dd className="kb-rowvalue">{r.value}{r.action}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  );
}
