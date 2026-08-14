import React from "react";
import { useFlow } from "../flow";
import { Card, Cta, Screen } from "../components";
import { ChoiceGrid } from "../components/ChoiceGrid";
import { Stepper } from "../components/Stepper";
import { QUANTITY_MAX, QUESTIONS, answerLabel } from "../model";
import { candidateMaxQty, candidateName, fixtureMaxQty } from "../logic";
import "./cart.css";
import "./profile.css"; // .p-edit — 요약 행의 주황 «수정» 링크 (시안 185:214, S03 과 같은 문법)

/**
 * 화면목록 S14 — 수정.
 *
 * **한 카드다** (2차 QA 2026-08-13). 메뉴와 주문 조건 여섯(알레르기·맵기·뼈/순살·
 * 먹고가기/포장·수량·예산)이 접힘 없이 전부 한 카드에 선다 — 메뉴에 관한 선택이
 * 한 번에 보여야 한다는 결정이다. 한때 기획 4행 + «다른 항목 수정» 접힘의 두 층이었고,
 * 접힘 안에 화면 보기 방식(글씨 크기·고대비·화면 안내)도 있었는데, 그 절은 이 결정으로
 * 통째로 없어졌다 — 화면 설정에 닿는 길은 프로필 3단계가 맡는다(verify-b C1).
 *
 * «수정»을 누르면 카드 바로 아래에서 그 항목의 선택지가 펴진다 — 질문 화면과 같은
 * 부품(ChoiceGrid·Stepper)이라 같은 값을 두 방법으로 고르게 되지 않는다.
 * 메뉴만 별도의 «메뉴 선택» 화면으로 간다(점수순 목록).
 *
 * 다 고치면 «수정 완료»가 재계산한다 — 확정 추천이면 장바구니 확인으로 직행하고,
 * 미확정이면 재확인(메뉴 확인 배너)·2회째 안전 중단의 기존 길을 탄다(flow.tsx).
 *
 * 고를 수 있는 메뉴는 STEP 4 를 통과한 **생존 후보뿐**이다(MenuSelect 참조).
 */

/** 한 카드에 서는 주문 조건 여섯 행 — 순서는 2차 QA 목업 그대로. */
const ROWS: {
  key: "allergies" | "spicyLevel" | "boneType" | "serviceType" | "quantity" | "budgetKrw";
  label: string;
}[] = [
  { key: "allergies", label: "알레르기" },
  { key: "spicyLevel", label: "맵기" },
  { key: "boneType", label: "뼈/순살 선택" },
  { key: "serviceType", label: "먹고가기/포장 선택" },
  { key: "quantity", label: "수량" },
  { key: "budgetKrw", label: "예산" },
];

export function CartEdit() {
  const {
    editOpen, setEditOpen, uiRec, fixture, answers, setAnswers, simple,
    applyEditAndRecommend, setStep,
  } = useFlow();

  const questionOf = (key: string) => QUESTIONS.find((x) => x.key === key)!;
  const openRow = ROWS.find(({ key }) => editOpen === key);

  /* 수량 상한은 매장 자료(candidates.json QUANTITY)다 — 사용자 확정 2026-08-13.
     담긴 메뉴가 있으면 그 메뉴의 상한, 저장본 수정처럼 메뉴가 없으면 판매 중 후보들의
     최대값. 자료가 없을 때만 QUANTITY_MAX 가 마지막 안전판이다. */
  const qtyMax = (fixture
    ? candidateMaxQty(fixture, uiRec?.rec.recommendedCandidateId ?? null) ?? fixtureMaxQty(fixture)
    : undefined) ?? QUANTITY_MAX;

  /* 이 화면에는 두 갈래로 들어온다 — 추천을 받은 뒤 «수정하기», 그리고 홈에서
     «저장된 내용 수정». 뒤로가 늘 추천으로 가면 추천을 받은 적 없는 사람이 빈 화면에
     떨어진다. 어디서 왔는지는 «추천이 있는가»가 말해 준다. */
  return (
    <Screen
      label="주문 조건 수정"
      onBack={() => setStep(uiRec ? "menuConfirm" : "start")}
      eyebrow="고객님,"
      /* 기획 목업은 한 문장이 통째로 같은 크기다 — 강조 분할을 쓰지 않는다. */
      title="어떤 항목을 수정하고 싶으신가요?"
      actions={(
        <>
          {/* 라벨은 기획의 «수정 완료». 확정 추천이면 장바구니로 직행한다(2차 QA). */}
          <Cta tone="primary" label="수정 완료" onClick={applyEditAndRecommend} />
        </>
      )}
    >
      {/* ── 한 카드 — SummaryCard(185:209) 문법: 라벨 · 값(Bold) · 주황 «수정» ──
          edit-stack 은 이 화면의 본문(인사말·제목·카드)을 세로 가운데로 모으는 CSS
          갈고리다(cart.css, 2차 QA 목업의 구도). */}
      <div className="edit-stack">
      <Card rows={[
        ...(uiRec && fixture && uiRec.rec.recommendedCandidateId ? [{
          label: "메뉴",
          value: candidateName(fixture, uiRec.rec.recommendedCandidateId),
          action: (
            /* 메뉴는 그 자리에서 펴지 않는다 — 점수순 목록을 가진 «메뉴 선택» 화면으로 간다 */
            <button type="button" className="p-edit" aria-label="메뉴 수정"
              onClick={() => setStep("menuSelect")}>
              수정
            </button>
          ),
        }] : []),
        ...ROWS.map(({ key, label }) => ({
          label,
          value: answerLabel(key, answers[key]),
          action: (
            <button type="button" className="p-edit" aria-expanded={editOpen === key}
              aria-label={`${label} 수정`}
              onClick={() => setEditOpen(editOpen === key ? null : key)}>
              수정
            </button>
          ),
        })),
      ]} />

      {/* «수정»을 누른 행의 선택지 — 카드 바로 아래에서 편다 (기획: 지금과 플로우 동일) */}
      {openRow && (
        <div className="editbody" role="group" aria-label={`${openRow.label} 선택`}>
          {openRow.key === "quantity" ? (
            /* 수량은 질문 화면과 같은 부품으로 고친다. 여기만 선택지 버튼으로 두면
               같은 값을 두 가지 방법으로 고르게 되고, 고칠 수 있는 범위도 달라진다. */
            <Stepper
              label="수량"
              value={typeof answers.quantity === "number" ? answers.quantity : undefined}
              onChange={(n) => setAnswers((p) => ({ ...p, quantity: n }))}
              max={qtyMax}
              atMaxNote={<>한 번에 {qtyMax}개까지 고르실 수 있어요. 더 필요하시면 매장 직원에게 말씀해 주세요.</>}
            />
          ) : (
            <>
              {questionOf(openRow.key).hint && !simple && <p className="hint">{questionOf(openRow.key).hint}</p>}
              <ChoiceGrid q={questionOf(openRow.key)} answers={answers} setAnswers={setAnswers}
                onPicked={() => setEditOpen(null)} />
            </>
          )}
        </div>
      )}
      </div>
    </Screen>
  );
}
