import React from "react";
import radioOff from "../assets/icons/radio.svg";
import radioOn from "../assets/icons/radio-selected.svg";

/**
 * 라디오 카드 (Figma `Radio Card` 172:2373 기본 / 172:2375 선택).
 *
 * 「둘 중 하나」를 묻는 자리에 쓴다 — 프로필 생성 세 걸음(글씨 크기·고대비·화면 안내)과
 * 저장 방식(S03)이 같은 것을 쓰고, 디자인에서도 같은 컴포넌트다.
 *
 * **고른 것을 색으로만 말하지 않는다.** 라디오 그림(빈 원/찬 원)과 «선택됨» 글자가 함께
 * 바뀌고 `aria-pressed` 로도 나간다. 주황 테두리를 못 보는 사람에게 색은 신호가 아니다.
 *
 * 라디오 그림은 Figma 에서 내려받은 에셋을 그대로 쓴다 — 손으로 그리지 않는다.
 */
export function RadioCard({ label, desc, preview, previewSize, selected, onPick }: {
  label: string;
  desc: string;
  /** 고른 결과가 어떻게 보이는지 그 자리에서 보여주는 상자. 없으면 그리지 않는다. */
  preview?: string;
  previewSize?: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button type="button" className="kb-radio" aria-pressed={selected} onClick={onPick}>
      <img className="kb-radioico" src={selected ? radioOn : radioOff} alt="" aria-hidden="true" width={24} height={24} />
      <span className="kb-radiotext">
        <span className="kb-radiolabel">{label}</span>
        <span className="kb-radiodesc">{desc}</span>
      </span>
      {preview !== undefined && (
        <span className="kb-preview" aria-hidden="true" style={previewSize ? { fontSize: previewSize } : undefined}>
          {preview}
        </span>
      )}
      {/* 색만으로 «고름»을 말하지 않는다 */}
      <span className="kb-pick">{selected ? "선택됨" : "선택"}</span>
    </button>
  );
}
