import React from "react";
import chevronLeft from "../assets/icons/chevron-left.svg";

/**
 * 화면 머리 — 뒤로가기 + 제목 (Figma `Header` 114:2796 / TopBar 114:2792).
 *
 * 디자인의 아이콘 박스는 44px 인데 48px 로 키웠다. 제출물에 선언한 터치 타깃
 * 보증이 48px 이고 tests/a11y.test.ts 가 그것을 검사하기 때문이다 —
 * 선언을 낮추는 대신 타깃을 키운다(components.css ②).
 *
 * 시안대로 **화살표만** 둔다. 이름은 aria-label 이 준다 — «아이콘 단독 금지»가
 * 지키려던 것은 «이름 없는 버튼을 만들지 않는다»이지 «글자가 눈에 보여야 한다»가 아니다.
 */
export function Header({ title, onBack, backLabel = "뒤로", right }: {
  title?: React.ReactNode;
  /** 없으면 뒤로가기 버튼을 그리지 않는다 — 홈처럼 돌아갈 곳이 없는 화면 */
  onBack?: () => void;
  /** 화면 낭독기가 읽을 이름. 화면에는 글자가 보이지 않는다(시안이 아이콘만 둔다). */
  backLabel?: string;
  /** 줄 오른쪽 끝에 붙는 것 (지금은 쓰는 곳이 없다 — 시안의 TopBar 는 뒤로가기 하나뿐이다) */
  right?: React.ReactNode;
}) {
  return (
    <div className="kb-header">
      {onBack && (
        /* 시안 114:2793 «IconBox:뒤로가기» — 44px 원형, sunken 바탕, chevron 24px.
           **글자를 병기하지 않는다.** 한때 «아이콘 단독 버튼 금지»를 이유로 «뒤로»를
           붙였는데, 그 규칙이 지키려던 것은 «이름 없는 버튼을 만들지 않는다»이지
           «글자가 눈에 보여야 한다»가 아니다. aria-label 이 이름을 주므로 화면
           낭독기에는 «뒤로» 로 읽히고, 화면에는 시안대로 아이콘만 남는다. */
        <button type="button" className="kb-back" onClick={onBack} aria-label={backLabel}>
          <img className="kb-ico" src={chevronLeft} alt="" aria-hidden="true" />
        </button>
      )}
      {title && <h2>{title}</h2>}
      {right}
    </div>
  );
}