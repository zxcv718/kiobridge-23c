import React from "react";
import { useFlow } from "../flow";
import { ChoiceGrid, Header } from "../components";
import { EDIT_LABELS, QUESTIONS, answerLabel, type Question } from "../model";
import "./question.css";

import safeIcon from "../assets/icons/safe.svg";
import hotIcon from "../assets/icons/hot.svg";
import boneIcon from "../assets/icons/bone.svg";
import bonelessIcon from "../assets/icons/boneless.svg";
import takeoutIcon from "../assets/icons/takeout.svg";
import hereIcon from "../assets/icons/here.svg";

/**
 * 선택지에 붙일 디자인 아이콘 — «질문 key + 선택지 value → 파일».
 *
 * QUESTIONS 는 이모지를 들고 있고 model.ts 는 이 레인이 고칠 수 없다. 그래서 바꿀 수
 * 있는 것만 화면에서 덮어쓰고, 여기 없는 선택지는 이모지가 그대로 남는다. 값(value)으로
 * 거는 이유는 순번으로 걸면 model.ts 에서 선택지 하나만 끼워 넣어도 전부 어긋나기 때문이다.
 *
 * 없는 것을 억지로 채우지 않았다:
 *  · 알레르기 개별 항목(땅콩·콩·우유…)은 에셋이 없다. 「있어요」에 붙는 danger 를
 *    항목마다 돌려 쓰면 방패 일곱 개가 같은 그림으로 늘어서기만 한다.
 *  · 「잘 모르겠어요」도 danger 를 쓰지 않는다. 그 그림은 디자인에서 「있어요」의 것이고,
 *    «모르겠다»에 붙이면 «고르면 위험한 답»으로 읽힌다. 그건 우리가 할 말이 아니다.
 *  · 수량·컵·예산은 디자인에 그림이 없다.
 */
const DESIGN_ICON: Record<string, Record<string, string>> = {
  allergies: { 없음: safeIcon },
  spicyLevel: { 매운맛: hotIcon },
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

/** 핵심 어절만 감싸 크게 보여 준다. 못 찾으면 문장을 통째로 둔다 — 문구가 바뀌어도 안 깨진다. */
function QuestionTitle({ q }: { q: Question }) {
  const key = EMPHASIS[q.key];
  const at = key ? q.title.indexOf(key) : -1;
  if (at < 0) return <h2 id="qtitle" className="qhead">{q.title}</h2>;
  return (
    <h2 id="qtitle" className="qhead">
      {q.title.slice(0, at)}<span className="qkey">{key}</span>{q.title.slice(at + key.length)}
    </h2>
  );
}

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
 * 그중 한 곳만 고쳐도 계약이 조용히 깨진다. 질문마다 달라지는 것(강조 어절·그림)은
 * 위의 표 두 개가 데이터로 들고 있다.
 */
export function QuestionScreen() {
  const {
    q, qIndex, setQIndex, answers, setAnswers, askPos, askTotal, carried,
    simple, a11y, answered, advance, setStep, setEditOpen, nextToAsk, staffBtn,
  } = useFlow();

  if (!q) return null;

  /* 선택지 순번 → 그림. CSS 는 «몇 번째»만 알고 어떤 그림인지는 여기서 내려보낸다
     (question.css 의 --qico-N 참고). 매핑에 없으면 클래스도 변수도 붙지 않는다. */
  const icons = q.options.map((o) => DESIGN_ICON[q.key]?.[String(o.value)]);
  const gridClass = ["qchoices", ...icons.map((src, i) => (src ? `qico-${i + 1}` : ""))]
    .filter(Boolean).join(" ");
  const iconVars: React.CSSProperties & Record<string, string> = {};
  icons.forEach((src, i) => { if (src) iconVars[`--qico-${i + 1}`] = `url(${src})`; });

  return (
    <section className="card" aria-labelledby="qtitle">
      {/* 디자인의 TopBar 뒤로가기. 화살표만 두지 않고 «뒤로» 글자를 함께 둔다(Header). */}
      <Header onBack={() => (qIndex === 0 ? setStep("start") : setQIndex(qIndex - 1))} />
      <p className="stepmeta">질문 {askPos + 1} / {askTotal}</p>
      <p className="qgreet">고객님,</p>
      <QuestionTitle q={q} />
      {q.hint && !simple && <p className="hint">{q.hint}</p>}
      {carried.includes(q.key) && (
        <p className="hint">지난번 설정에서 불러온 값입니다. 바꾸셔도 됩니다.</p>
      )}
      <div className={gridClass} style={iconVars}>
        <ChoiceGrid q={q} answers={answers} setAnswers={setAnswers} showIcons={a11y.visualGuidance} />
      </div>
      <div className="btnrow">
        <button type="button" className="btn primary" disabled={!answered} onClick={advance}>
          {nextToAsk(qIndex + 1) < QUESTIONS.length ? "다음 →" : "추천 보기"}
        </button>
        {staffBtn()}
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
    </section>
  );
}
