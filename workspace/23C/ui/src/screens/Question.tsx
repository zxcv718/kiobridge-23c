import React from "react";
import { useFlow } from "../flow";
import { ChoiceGrid, Cta, Emphasize, Screen } from "../components";
import { EDIT_LABELS, QUESTIONS, answerLabel } from "../model";
import hotIcon from "../assets/icons/hot.svg";
import "./question.css";

import boneIcon from "../assets/icons/bone.svg";
import bonelessIcon from "../assets/icons/boneless.svg";
import takeoutIcon from "../assets/icons/takeout.svg";
import hereIcon from "../assets/icons/here.svg";

/**
 * 선택지에 붙일 디자인 아이콘 — «질문 key + 선택지 value → 파일».
 *
 * QUESTIONS 는 이모지를 들고 있고, 여기 있는 선택지만 Figma 그림으로 덮어쓴다.
 * 없는 선택지는 이모지가 그대로 남는다. 값(value)으로 거는 이유는 순번으로 걸면
 * model.ts 에서 선택지 하나만 끼워 넣어도 전부 어긋나기 때문이다.
 *
 * 없는 것을 억지로 채우지 않았다:
 *  · 알레르기 개별 항목(땅콩·콩·우유…)은 에셋이 없다. 「있어요」에 붙는 danger 를
 *    항목마다 돌려 쓰면 방패 일곱 개가 같은 그림으로 늘어서기만 한다.
 *  · 「잘 모르겠어요」도 danger 를 쓰지 않는다. 그 그림은 디자인에서 「있어요」의 것이고,
 *    «모르겠다»에 붙이면 «고르면 위험한 답»으로 읽힌다. 그건 우리가 할 말이 아니다.
 *  · 「보통맛」에도 hot 을 붙이지 않는다. 디자인은 보통에 불꽃 하나, 매운맛에 셋을 두어
 *    **개수로** 구분하는데 ChoiceGrid 는 선택지당 그림 하나만 그린다. 같은 불꽃을 둘 다에
 *    붙이면 두 선택지가 똑같아 보여, 구분이 되던 것이 오히려 없어진다.
 *  · 수량·컵·예산은 디자인에 그림이 없다.
 */
/**
 * 정도를 «같은 표식의 개수»로 나타내는 자리 (Figma S07 99:1264).
 * 순한맛 0 · 보통맛 1 · 매운맛 3 — 디자인 그대로다.
 * 「상관없어요」는 디자인에 없는 우리 선택지이고, 고르는 «것»이 아니라 고르지 않겠다는
 * 답이므로 표식을 두지 않는다.
 */
const DESIGN_MARK: Record<string, Record<string, { src: string; count: number }>> = {
  spicyLevel: {
    순한맛: { src: hotIcon, count: 0 },
    보통: { src: hotIcon, count: 1 },
    매운맛: { src: hotIcon, count: 3 },
  },
};

const DESIGN_ICON: Record<string, Record<string, string>> = {
  /* 알레르기는 이모지로 둔다. 항목 하나하나가 서로 다른 음식이라 이모지가 실제로 구별을
     돕는데, 여기에 Figma 방패(safe)를 하나만 섞으면 «없어요»가 다른 종류처럼 보인다. */
  boneType: { 뼈: boneIcon, 순살: bonelessIcon },
  serviceType: { 포장: takeoutIcon, 매장: hereIcon },
};

/**
 * 제목에서 크게 보여 줄 어절 (Figma 는 한 문장 안에서 핵심만 28px, 나머지를 22px 로 둔다).
 * 문장 자체는 model.ts 것을 그대로 쓰고, 여기서는 **어디를 키울지만** 정한다.
 */
const EMPHASIS: Record<string, string> = {
  allergies: "알레르기",
  spicyLevel: "맵기",
  boneType: "뼈와 순살",
  serviceType: "어떻게",
  quantity: "몇 개",
  cupOption: "컵",
  budgetKrw: "예산",
};

/**
 * 디자인이 이 질문을 어떤 모양으로 그렸는가.
 *
 * 시안은 선택지를 두 가지로만 그린다:
 *  · **타일** — 그림을 위에, 글자를 아래에 둔 큰 사각형 두 개가 나란히
 *    (99:1270 뼈·순살 · 99:1281 포장·매장, 그리고 99:1228 알레르기 «기본»)
 *  · **목록** — 한 줄을 다 쓰는 버튼이 세로로 쌓인 것
 *    (99:1246 알레르기 «확장» · 99:1264 맵기)
 *
 * 알레르기를 목록으로 두는 이유: 시안은 «없어요/있어요»를 먼저 묻고 «있어요»를 누르면
 * 항목 목록으로 펼치는 두 걸음인데, 우리 QUESTIONS 의 알레르기는 「없어요」와 항목들이
 * 처음부터 한 목록에 있다. 두 걸음으로 쪼개려면 model.ts 와 흐름을 고쳐야 하고 그건
 * 이 레인의 파일이 아니다. 그래서 **시안의 «확장» 상태 모양**을 그대로 쓴다.
 */
const LAYOUT: Record<string, "tiles" | "rows"> = {
  boneType: "tiles",    // 99:1270
  serviceType: "tiles", // 99:1281
};

/**
 * 화면목록 S06~S10 — 질문 마법사.
 *
 * 질문은 7개 고정이고 시스템이 먼저 끝내지 않는다. 한때 «추천 신뢰도가 충분하면
 * 남은 질문을 생략»을 넣었다가 걷어냈다 — confidence 가 재는 것은 «1위 후보가 더
 * 바뀌지 않는다»이지 «남은 질문이 무의미하다»가 아니기 때문이다. 생략은 곧
 * 우리가 답을 대신 정하는 것이었고, 그 대상이 하필 키오스크 앞에서 통제권이
 * 가장 적은 사용자였다. 무엇을 주문할지는 사용자가 정한다.
 *
 * 디자인은 질문마다 화면을 따로 그렸지만(S06~S10), 여기서는 **한 화면이 QUESTIONS 를
 * 순회한다.** 화면으로 쪼개면 «질문 7개 고정»이라는 계약이 일곱 군데로 흩어지고,
 * 그중 한 곳만 고쳐도 계약이 조용히 깨진다. 질문마다 달라지는 것(강조 어절·그림·
 * 선택지 모양)은 위의 표 세 개가 데이터로 들고 있다.
 *
 * 화면의 뼈대는 `Screen` 이 쥔다 — 뒤로가기 → 진행 표시 → «고객님,» → 큰 제목 →
 * 부제 → 선택지 → 넓은 여백 → 화면 아래 붙는 «다음». 여기서 다시 카드로 감싸지 않는다.
 */
export function QuestionScreen() {
  const {
    q, qIndex, setQIndex, answers, setAnswers, askPos, askTotal, carried,
    simple, a11y, answered, advance, setStep, setEditOpen, nextToAsk, staffBtn,
  } = useFlow();

  if (!q) return null;

  const isLast = nextToAsk(qIndex + 1) >= QUESTIONS.length;
  const shape = LAYOUT[q.key] ?? "rows";

  return (
    <Screen
      label={q.title}
      onBack={() => (qIndex === 0 ? setStep("start") : setQIndex(qIndex - 1))}
      steps={{ total: askTotal, current: askPos + 1, srLabel: `질문 ${askPos + 1} / ${askTotal}` }}
      eyebrow="고객님,"
      titleId="qtitle"
      title={<Emphasize text={q.title} word={EMPHASIS[q.key]} />}
      subtitle={q.hint && !simple ? q.hint : undefined}
      actions={
        <>
          <Cta tone="primary" label={isLast ? "추천 보기" : "다음"} disabled={!answered} onClick={advance} />
          {staffBtn()}
        </>
      }
    >
      {carried.includes(q.key) && (
        <p className="hint">지난번 설정에서 불러온 값입니다. 바꾸셔도 됩니다.</p>
      )}

      <div className={`q-choices q-${shape}`}>
        <ChoiceGrid q={q} answers={answers} setAnswers={setAnswers}
          showIcons={a11y.visualGuidance} icons={DESIGN_ICON[q.key]} marks={DESIGN_MARK[q.key]} />
      </div>

      {carried.length > 0 && (
        <div className="carried">
          <b>지난번 설정에서 {carried.length}가지를 불러왔습니다</b> — 다시 여쭤보지 않습니다.
          <ul>
            {carried.map((k) => (
              <li key={k}>{EDIT_LABELS[k] ?? k} <span>{answerLabel(k, answers[k])}</span></li>
            ))}
          </ul>
          <button type="button" className="btn ghost" onClick={() => { setEditOpen(null); setStep("edit"); }}>
            불러온 값 확인·수정
          </button>
        </div>
      )}
    </Screen>
  );
}
