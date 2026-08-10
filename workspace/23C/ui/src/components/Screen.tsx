import React from "react";
import { Header } from "./Header";
import { StepIndicator } from "./StepIndicator";

/**
 * 화면 한 장의 골격 — 디자인의 레이아웃 문법을 한 곳에 담는다.
 *
 * Figma 의 화면들은 전부 같은 뼈대를 쓴다:
 *   뒤로가기 → 진행 표시 → 인사말 → 큰 제목 → 부제 → **넓은 여백** → 화면 아래 붙는 CTA
 *
 * 이걸 화면마다 따로 짜면 열여섯 벌이 조금씩 어긋나고, 결국 «디자인을 반영한 것 같기는
 * 한데 두 개가 섞인» 느낌이 된다. 그래서 뼈대를 부품 하나로 두고, 화면은 **무엇을 담을지만**
 * 정한다.
 *
 * **CTA 는 화면 아래에 붙는다.** 디자인이 그렇게 그렸기 때문만은 아니다 — 모바일에서
 * 내용이 길어지면 버튼이 접힌 화면 밖으로 밀려나는데, 그러면 «다음»을 찾으려고 스크롤을
 * 내려야 한다. 이 서비스가 없애려는 것이 정확히 그 종류의 부담이다.
 * 홈 버튼이 있는 기기에서 가려지지 않도록 안전 영역(safe-area)만큼 아래를 띄운다.
 */
export function Screen({
  onBack, backLabel, steps, eyebrow, title, titleId, subtitle, children, actions, label, busy,
}: {
  /** 없으면 뒤로가기를 그리지 않는다 */
  onBack?: () => void;
  backLabel?: string;
  /** 진행 표시. labels 를 주면 이름이 붙은 큰 표시, total 만 주면 점만 찍는다. */
  steps?: { labels?: string[]; total?: number; current: number; srLabel?: string };
  /** 제목 위 한 줄 (Figma 의 «고객님,») */
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  /**
   * 제목에 붙일 id. 화면 밖에서 «이 화면의 제목»을 가리켜야 할 때 쓴다 —
   * 질문 화면은 `qtitle` 을 쓰며, 그 이름으로 e2e 가 «지금 몇 번째 질문인가»를 잡는다.
   * 손잡이가 없으면 화면은 멀쩡한데 검사만 눈이 머는 일이 생긴다(실제로 났다).
   */
  titleId?: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  /** 화면 아래에 붙는 버튼들. 넘긴 순서가 곧 중요도 순서다. */
  actions?: React.ReactNode;
  /** 화면 낭독기용 이름 */
  label?: string;
  busy?: boolean;
}) {
  return (
    <section className="kb-screen" aria-label={label} aria-busy={busy}>
      {(onBack || steps) && (
        <div className="kb-screen-top">
          {onBack && <Header onBack={onBack} backLabel={backLabel} />}
          {steps && (
            <StepIndicator
              labels={steps.labels} total={steps.total} current={steps.current} srLabel={steps.srLabel}
            />
          )}
        </div>
      )}

      <div className="kb-screen-body">
        {eyebrow && <p className="kb-eyebrow">{eyebrow}</p>}
        {title && <h2 className="kb-title" id={titleId}>{title}</h2>}
        {subtitle && <p className="kb-subtitle">{subtitle}</p>}
        {children}
      </div>

      {actions && <div className="kb-actions">{actions}</div>}
    </section>
  );
}

/**
 * 제목 안에서 **핵심 어절만 크게** 보여 준다 (Figma 는 한 문장 안에서 강조어를 28px,
 * 나머지를 22px 로 둔다).
 *
 * 문장을 쪼개 배열로 넘기지 않는 이유는, 조각 사이에 공백이 끼면 화면 낭독기에서
 * «알레르기 가 있으세요»처럼 끊겨 읽히기 때문이다. 문장은 그대로 두고 위치만 찾는다.
 */
export function Emphasize({ text, word }: { text: string; word?: string }) {
  const at = word ? text.indexOf(word) : -1;
  if (at < 0 || !word) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}<span className="kb-title-key">{word}</span>{text.slice(at + word.length)}
    </>
  );
}
