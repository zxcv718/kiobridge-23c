import React from "react";
import chevronLeft from "../assets/icons/chevron-left.svg";

/**
 * 화면 머리 — 뒤로가기 + 제목 (Figma `Header` 114:2796 / TopBar 114:2792).
 *
 * 디자인의 아이콘 박스는 44px 인데 48px 로 키웠다. 제출물에 선언한 터치 타깃
 * 보증이 48px 이고 tests/a11y.test.ts 가 그것을 검사하기 때문이다 —
 * 선언을 낮추는 대신 타깃을 키운다(components.css ②).
 *
 * 화살표 옆에 «뒤로» 글자를 남긴다. 디자인은 화살표만 두었지만, 우리는
 * «아이콘 단독 금지»를 보증으로 걸어 두었고 그 대상에 이 버튼도 들어간다.
 */
export function Header({ title, onBack, backLabel = "뒤로", right }: {
  title?: React.ReactNode;
  /** 없으면 뒤로가기 버튼을 그리지 않는다 (첫 화면) */
  onBack?: () => void;
  backLabel?: string;
  /**
   * 줄 오른쪽 끝에 붙는 것 — 직원 도움이 여기 산다.
   *
   * 이 줄에는 원래 뒤로가기 하나뿐이라 오른쪽이 늘 비어 있었다. 비상구를 화면 아래
   * 버튼 더미에서 이리로 옮기면 두 가지가 좋아진다: 어느 화면에서든 같은 자리라
   * 찾을 일이 없고, 아래는 그 화면의 주 동작만 서게 된다.
   */
  right?: React.ReactNode;
}) {
  return (
    <div className="kb-header">
      {onBack && (
        <button type="button" className="kb-back" onClick={onBack}>
          <img className="kb-ico" src={chevronLeft} alt="" aria-hidden="true" />
          {backLabel}
        </button>
      )}
      {title && <h2>{title}</h2>}
      {right}
    </div>
  );
}
