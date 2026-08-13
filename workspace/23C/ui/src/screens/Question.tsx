import React from "react";
import { useFlow } from "../flow";
import { ChoiceGrid, Cta, Emphasize, Screen, Stepper } from "../components";
import { ALLERGY_GATE, EDIT_LABELS, QUANTITY_MAX, QUESTIONS, allergyListOptions, answerLabel } from "../model";
import { fixtureMaxQty } from "../logic";
import hotIcon from "../assets/icons/hot.svg";
import "./question.css";

import boneIcon from "../assets/icons/bone.svg";
import bonelessIcon from "../assets/icons/boneless.svg";
import takeoutIcon from "../assets/icons/takeout.svg";
import hereIcon from "../assets/icons/here.svg";
import safeIcon from "../assets/icons/safe.svg";
import dangerIcon from "../assets/icons/danger.svg";

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
 *  · 수량·예산은 디자인에 그림이 없다.
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
const EMPHASIS: Record<string, string | string[]> = {
  allergies: "알레르기",
  spicyLevel: "맵기",
  // 시안은 한 제목에서 둘을 키운다 — 99:1276 「뼈 있는 것 / 없는 것」, 99:1282 「드시고 / 포장」
  boneType: ["뼈 있는 것", "없는 것"],
  serviceType: ["드시고", "포장"],
  quantity: "얼마나",
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
 * 알레르기는 시안대로 **두 걸음**이다 — 첫 걸음은 타일 두 장(99:1228), 둘째 걸음은
 * 목록(99:1246). 한때 한 목록에 「없어요 + 6종 + 잘 모르겠어요」를 다 늘어놓았는데,
 * 그건 디자인 판단이 아니라 «두 걸음으로 쪼개려면 model.ts 와 흐름을 고쳐야 하는데
 * 그건 이 레인의 파일이 아니다»라는 **작업 분담의 자국**이었다. 그런 자국은 코드에
 * 남으면 안 된다 — 나중에 읽는 사람은 그게 설계였다고 믿는다.
 */
const LAYOUT: Record<string, "tiles" | "rows"> = {
  boneType: "tiles",    // 99:1270
  serviceType: "tiles", // 99:1281
};

/**
 * 화면목록 S06~S10 — 질문 마법사.
 *
 * 질문은 6개 고정이고 시스템이 먼저 끝내지 않는다. 한때 «추천 신뢰도가 충분하면
 * 남은 질문을 생략»을 넣었다가 걷어냈다 — confidence 가 재는 것은 «1위 후보가 더
 * 바뀌지 않는다»이지 «남은 질문이 무의미하다»가 아니기 때문이다. 생략은 곧
 * 우리가 답을 대신 정하는 것이었고, 그 대상이 하필 키오스크 앞에서 통제권이
 * 가장 적은 사용자였다. 무엇을 주문할지는 사용자가 정한다.
 *
 * 디자인은 질문마다 화면을 따로 그렸지만(S06~S10), 여기서는 **한 화면이 QUESTIONS 를
 * 순회한다.** 화면으로 쪼개면 «질문 6개 고정»이라는 계약이 여섯 군데로 흩어지고,
 * 그중 한 곳만 고쳐도 계약이 조용히 깨진다. 질문마다 달라지는 것(강조 어절·그림·
 * 선택지 모양)은 위의 표 세 개가 데이터로 들고 있다.
 *
 * 화면의 뼈대는 `Screen` 이 쥔다 — 뒤로가기 → 진행 표시 → «고객님,» → 큰 제목 →
 * 부제 → 선택지 → 넓은 여백 → 화면 아래 붙는 «다음». 여기서 다시 카드로 감싸지 않는다.
 */
export function QuestionScreen() {
  const {
    q, qIndex, setQIndex, answers, setAnswers, askPos, askTotal, carried, fixture,
    simple, answered, advance, setStep, setEditOpen, nextToAsk, allergyOpen, setAllergyOpen,
  } = useFlow();

  if (!q) return null;

  /* 수량 상한 — 화면이 정한 수가 아니라 매장 자료(candidates.json QUANTITY)다(사용자
     확정 2026-08-13). 메뉴가 정해지기 전이므로 판매 중 후보들의 최대값까지 열어 준다.
     자료가 없을 때만 QUANTITY_MAX 가 마지막 안전판이다. */
  const qtyMax = (fixture && fixtureMaxQty(fixture)) ?? QUANTITY_MAX;

  const isLast = nextToAsk(qIndex + 1) >= QUESTIONS.length;
  const shape = LAYOUT[q.key] ?? "rows";

  /* 알레르기 두 걸음은 시안에서 **제목이 같다** — 99:1228(기본)도 99:1246(확장)도
     「알레르기가 있으신가요?」이고, 걸음을 넘겨 달라지는 것은 부제뿐이다.
     확장 걸음만 model.ts 의 문장(「피해야 하는 알레르기가 있으세요?」)을 쓰고 있어서,
     항목을 고르는 순간 제목이 다른 질문처럼 바뀌었다. 문장 자체는 model.ts 의 몫이지만
     그 파일은 이 레인이 아니므로, 화면에 나갈 문장을 여기서 한 번만 정한다. */
  const 제목 = q.key === "allergies" ? "알레르기가 있으신가요?" : q.title;

  /* 알레르기는 «있으신가요?» → «모두 골라 주세요» 두 걸음이다(디자인 S06 기본/확장).
     지금 어느 걸음인지는 상태 하나로 정하지 않는다 — 질문을 되돌아왔을 때 이미 항목을
     골라 둔 사람에게 «있으신가요?»를 다시 묻는 것은, 방금 한 답을 못 본 척하는 일이다.
     고른 항목이 남아 있으면 목록을 편 채로 맞는다. 「모름」도 목록의 답이다(TC-CM-01) —
     첫 걸음의 답은 「없음」뿐이므로 그것만 뺀다. */
  const 고른항목 = Array.isArray(answers.allergies)
    ? (answers.allergies as unknown[]).filter((v) => v !== "없음")
    : [];
  const 알레르기목록 = q.key === "allergies" && (allergyOpen || 고른항목.length > 0);
  const 알레르기첫걸음 = q.key === "allergies" && !알레르기목록;

  /** 첫 걸음에서 하나를 고른다. «있어요»는 답이 아니라 목록을 여는 일이다. */
  const 알레르기선택 = (value: string) => {
    if (value === "있음") { setAnswers((p) => ({ ...p, allergies: [] })); setAllergyOpen(true); return; }
    setAnswers((p) => ({ ...p, allergies: [value] }));
    setAllergyOpen(false);
  };

  const 뒤로 = () => {
    // 목록에서 뒤로는 «있으신가요?»로 돌아간다 — 질문 자체를 벗어나지 않는다
    if (알레르기목록) { setAnswers((p) => ({ ...p, allergies: [] })); setAllergyOpen(false); return; }
    if (qIndex === 0) { setStep("start"); return; }
    setQIndex(qIndex - 1);
  };

  return (
    <Screen
      label={제목}
      onBack={뒤로}
      /* 위쪽 단계 점은 걷었다(기획 2026-08-12) — 진행 표시는 개인 설정(온보딩 5걸음)까지만
         쓰고, 주문(질문~장바구니)에서는 띄우지 않는다. «몇 번째 질문인가»는 아래 낭독기
         전용 문장이 그대로 든다 — 눈에 안 보인다고 낭독기 사용자까지 잃으면 안 된다. */
      eyebrow="고객님,"
      titleId="qtitle"
      title={<Emphasize text={제목} word={EMPHASIS[q.key]} />}
      subtitle={
        알레르기목록 ? "보유하신 알레르기를 모두 선택해 주세요."
        /* 첫 걸음(99:1228)에는 부제가 없다. 「점수를 깎지 않고 아예 뺀다」는 설명은
           시안에 없는 우리 요건이라 아래에서 접어 둔다(FIGMA_RULES §2.1). */
        : 알레르기첫걸음 ? undefined
        : q.hint && !simple ? q.hint : undefined
      }
      actions={
        <>
          <Cta tone="primary" label={isLast ? "추천 보기" : "다음"} disabled={!answered} onClick={advance} />
        </>
      }
    >
      {/* 낭독기 전용 진행 문장 — 단계 점을 걷은 뒤에도 «몇 번째 질문인가»는 남는다 */}
      <p className="srline q-progress">질문 {askPos + 1} / {askTotal}</p>

      {carried.includes(q.key) && (
        <p className="hint">지난번 설정에서 불러온 값입니다. 바꾸셔도 됩니다.</p>
      )}

      {알레르기첫걸음 ? (
        <>
          <div className="q-choices q-tiles">
            {/* 안쪽 .choices 는 ChoiceGrid 가 만드는 것과 같은 상자다 — 타일 모양을 정한
                CSS 가 그 이름에 걸려 있으므로, 직접 그릴 때도 같은 이름을 쓴다. */}
            <div className="choices" role="group" aria-label="알레르기 여부">
              {ALLERGY_GATE.map((o) => (
                <button key={o.value} type="button" className="choice"
                  aria-pressed={Array.isArray(answers.allergies) && answers.allergies[0] === o.value}
                  onClick={() => 알레르기선택(o.value)}>
                  {/* 시안 99:1228 은 타일 두 장에 방패 그림을 늘 그린다 — 설정과 무관하다 */}
                  <img className="ico" src={o.value === "없음" ? safeIcon : dangerIcon} alt="" aria-hidden="true" />
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* 시안의 첫 걸음은 제목과 타일 두 장뿐이다. 알레르기를 어떻게 반영하는지는
              없앨 수 없는 설명이라(빼는 것과 깎는 것은 결과가 다르다) 접어 둔다 —
              펴기 전 화면이 시안과 같아지고, 알고 싶은 사람은 한 번 눌러 읽는다.
              «쉬운 말»을 켠 사람에게는 접힌 줄도 남기지 않는다. */}
          {!simple && (
            <details className="home-saved">
              <summary>어떻게 반영되나요?<span aria-hidden="true">▾</span></summary>
              <p className="q-note">
                알레르기가 있는 메뉴는 점수를 깎는 게 아니라 아예 빼고 추천합니다.
              </p>
            </details>
          )}
        </>
      ) : q.key === "quantity" ? (
        <Stepper
          label="수량"
          value={typeof answers.quantity === "number" ? answers.quantity : undefined}
          onChange={(n) => setAnswers((p) => ({ ...p, quantity: n }))}
          max={qtyMax}
          atMaxNote={<>한 번에 {qtyMax}개까지 고르실 수 있어요. 더 필요하시면 매장 직원에게 말씀해 주세요.</>}
        />
      ) : (
        <div className={`q-choices q-${알레르기목록 ? "rows" : shape}`}>
          {/* 목록 걸음은 6종 + 「잘 모르겠어요」다(QA 1차 TC-CM-01) — 안전 중단(S12)의
              입구가 화면에 없으면 알레르기를 정말 모르는 사람이 «있음/없음»을 지어내야
              한다. 「없어요」는 첫 걸음의 답이라 여기 없다. 라벨과 이모지는 원래 선택지의
              것을 그대로 쓴다 — 같은 것을 두 곳에 적어 두면 언젠가 갈라진다. */}
          <ChoiceGrid
            q={알레르기목록 ? { ...q, options: allergyListOptions() } : q}
            answers={answers} setAnswers={setAnswers}
            icons={DESIGN_ICON[q.key]} marks={DESIGN_MARK[q.key]} />
        </div>
      )}

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
