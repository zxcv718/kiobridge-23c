import React from "react";
import { useFlow } from "../flow";
import { FLOW_STEPS, prefersReducedMotion } from "../model";
import { Card, Cta, Emphasize, Screen } from "../components";
import "./profile.css";

/**
 * 화면목록 S03/S04 — 저장 방식 (프로필 저장 완료). Figma 150:275.
 *
 * **여기서 정하는 것은 프로필(화면 설정)의 저장뿐이다**(QA 1차 2026-08-13).
 * 오늘의 답변·확정 메뉴(세션)는 주문을 마친 뒤 S15 «안내·저장 유도»가 따로 묻는다 —
 * 프로필 단계에는 아직 남길 답변이 없고, 반대로 여기의 «이번만 사용»이 지난 주문
 * 기록까지 지워 버리면 두 결정이 하나로 뭉개진다(실제로 그랬던 결함이다).
 *
 * 디자인대로 **결정이 곧 버튼이다** — «저장하기»·«이번만 사용» 두 개가 저장 방식을 정하고
 * 그대로 다음 화면으로 보낸다. 한때 이것을 라디오 두 장 + «다음»으로 바꿔 두었는데, 그건
 * 매장 QR 을 건너뛰는 세 번째 버튼이 이 화면에 필요하다고 봤기 때문이다. 건너뛰기는 QR
 * 화면(S04) 안에 이미 있으므로 여기 둘 이유가 없었다. 버튼이 둘이면 «무엇을 고른
 * 상태인지»를 화면에 남길 필요도 없다 — 누르는 순간 정해지고 화면을 떠난다.
 */
export function SaveChoice() {
  const { a11y, setStoreIntent, setProfileStep, setStep } = useFlow();

  /* «저장하면 무엇이 남나요?» 는 화면 맨 아래라, 펼쳐도 설명이 접힌 화면 밖에 남는
     일이 있었다(QA 1차). 펼치는 순간 설명이 보이는 자리까지 올린다. */
  const willSaveRef = React.useRef<HTMLDetailsElement>(null);
  const revealWillSave = () => {
    const el = willSaveRef.current;
    if (!el?.open) return; // 닫을 때는 화면을 움직이지 않는다
    window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
    });
  };

  /** 요약 한 줄 — 값과 «수정»(진짜 버튼)을 함께 준다 (Figma SummaryCard 185:209). */
  const row = (label: string, value: string, to: 1 | 2 | 3) => ({
    label,
    value,
    action: (
      <button type="button" className="p-edit" aria-label={`${label} 수정`}
        onClick={() => { setProfileStep(to); setStep("profile"); }}>
        수정
      </button>
    ),
  });

  /** 저장 방식을 정하고 그대로 다음 화면으로 — 결정과 이동이 같은 버튼이다.
   *  QR 걸음(S04)은 기획(2026-08-12)으로 흐름에서 빠져 다음은 곧장 세션 시작이다. */
  const choose = (store: boolean) => { setStoreIntent(store); setStep("sessionStart"); };

  return (
    <Screen
      onBack={() => setStep("profile")}
      steps={{ labels: FLOW_STEPS, current: 4 }}
      label="저장 방식"
      /* 제목·부제·버튼 문구 전부 시안 그대로다 (150:301 · 150:302 · 208:754/756).
         부제 색도 시안을 따른다 — 이 화면만 secondary 가 아니라 tertiary 다. */
      title="선택하신 내용을 확인해주세요"
      subtitle="아래 내용을 확인해주세요"
      subtitleStrong
      actions={<>
        <Cta tone="primary" label="저장하기" onClick={() => choose(true)} />
        <Cta label="이번만 사용" onClick={() => choose(false)} />
      </>}
    >
      <Card
        label="지금 화면 설정"
        rows={[
          row("글씨 크기", a11y.largeText ? "큰 글씨" : "기본 크기", 1),
          row("고대비", a11y.highContrast ? "고대비 화면" : "기본 화면", 2),
          row("화면 안내", a11y.visualGuidance ? "안내 켜짐" : "기본", 3),
        ]}
      />

      {/* 시안 150:321 — 카드 아래 한 줄, 15px Regular 이고 색은 본문색이다(회색이 아니다) */}
      <p className="p-choose">저장 방식을 선택해주세요</p>

      {/* guide.txt 5번은 «저장 여부 선택 · 저장된 내용 확인 · 수정 · 삭제» 를 요구한다.
          «내용 확인»이 저장한 뒤에만 되면 늦다 — 고르기 전에 무엇이 남는지 알아야 한다.
          시안에는 이 설명이 없으므로 **접어 둔다** — 펴기 전 화면은 시안과 같고,
          알고 싶은 사람은 한 번 눌러 읽는다(홈의 «저장된 내용 보기»와 같은 방식이다). */}
      <details className="home-saved" ref={willSaveRef} onToggle={revealWillSave}>
        <summary>저장하면 무엇이 남나요?<span aria-hidden="true">▾</span></summary>
        <div className="p-willsave">
          <ul>
            <li>지금 고르신 <span>화면 설정</span> (글씨 크기·고대비·화면 안내 등) — 남는 것은 이것뿐입니다</li>
          </ul>
          <p>
            오늘 답해 주실 내용(알레르기·맵기 등)과 고르실 메뉴는 여기서 저장되지 않습니다 —
            주문을 마친 뒤에 저장할지 따로 여쭤봅니다.
            서버나 계정에는 아무것도 보내지 않습니다. 이 기기 안에만 남고, 홈 화면에서 언제든
            지우실 수 있습니다. 여러 사람이 쓰는 기기라면 <b>이번만 사용</b>을 권합니다.
          </p>
        </div>
      </details>
    </Screen>
  );
}
