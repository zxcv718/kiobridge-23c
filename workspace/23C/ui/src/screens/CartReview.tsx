import React from "react";
import type { Candidate } from "@kiobridge/participant-sdk";
import { useFlow } from "../flow";
import { Cta, Screen } from "../components";
import { ChoiceGrid } from "../components/ChoiceGrid";
import { Stepper } from "../components/Stepper";
import { GROUP_KO, OPTION_KO, QUANTITY_MAX, QUESTIONS } from "../model";
import { buildExecutionPlanCore, explainSelections, type PlanSelection } from "../../../src/core/plan";
import { candidateName, candidatePrice } from "../logic";
import "./cart.css";

/**
 * 화면목록 S13 — 장바구니(최종) 확인 (Figma 99:1798 · 2026-08-12 시안 대조로 재정렬).
 *
 * 레이아웃 — 매장 이름(캡션이자 화면 제목) → 메뉴 카드(수량 스테퍼·가격·성분·옵션) →
 * 구분선 → 주문 방식(선택 버튼) → 구분선 → 총 가격 → 주문하기.
 *
 * 시안의 [수정하기] 버튼은 없어졌다(QA 1차 TC-CM-08) — 수량·주문 방식이 그 자리에서
 * 고쳐지는 지금, 조건 수정 화면(S14)으로 가는 이 진입은 인라인 수정과 겹치는 중복
 * 입구였다. 메뉴·다른 조건을 다시 고치는 길은 뒤로가기 → 메뉴 확인의 «다시 추천받기»다
 * (S14 자체는 남는다 — 그 길과 홈 «저장된 내용 수정»의 유일한 입구다).
 * 큰 제목 문장은 시안에 없다 — 매장 이름 줄이 이 화면의 제목을 겸한다(h2 는 유지 —
 * 화면 제목이 h2 하나라는 전제를 낭독기와 e2e 가 쓴다. 크기는 CSS 가 시안의 15px 로 내린다).
 *
 * 실제로 만들어질 실행계획을 그대로 읽어 보여준다 — 화면과 계획이 어긋날 수 없다.
 * 필수 옵션은 "상관없어요"여도 하나가 정해지므로 그 사실을 숨기지 않고,
 * 각 값이 어떻게 정해졌는지(USER·AUTO·SUBSTITUTED)를 구분해 밝힌다 — 우리가 정했거나
 * 바꾼 값은 보조줄이 이유를 적는다.
 *
 * **수량과 주문 방식은 그 자리에서 고칠 수 있다**(기획 2026-08-13). 시안의
 * «✓ 포장해 갈게요» 문장 줄과 «x 1개» 글자가 질문 화면과 같은 부품(선택 버튼·스테퍼)이
 * 됐고, 안내 문구(«강조된 항목은…»·«결제는 일어나지 않습니다»)와 «다른 메뉴 보기»
 * 버튼은 같은 기획으로 없어졌다. 고쳐도 **확정한 메뉴는 바뀌지 않는다**
 * (flow.applyCartAnswers → logic.recommendKeeping) — 주문 방식은 엔진 점수에 들어가는
 * 값이라, 그냥 다시 계산하면 최종 확인 화면에서 메뉴가 갑자기 바뀔 수 있다.
 *
 * 시안의 값(매운맛 닭강정 · 17,800원 · "옵션: 매운맛, 뼈" · «Chicken Order»)은 목업이라
 * 쓰지 않는다. 메뉴·가격은 fixture 에서, 옵션·주문 방식은 **실행계획에서** 읽는다.
 *
 * 이 화면에서는 주문만 확인한다. 저장 얘기는 여기 없다 — 뒷사람 눈치가 최고조인
 * 순간에 다음 방문에 관한 판단을 시키지 않는다(저장 여부는 프로필 단계에서 물었고,
 * 그 결과는 주문이 끝난 뒤 S15 에서 알린다).
 */

/**
 * 알레르기 코드의 한국어 이름.
 *
 * 표기는 시안 99:1246 을 따른다 — 「콩(대두)」가 아니라 「대두」다.
 *
 * core/engine.ts 에 같은 표가 있지만 내보내지 않으므로 여기서 다시 적는다.
 * **두 표는 반드시 같은 이름을 써야 한다** — 한쪽만 고치면 제외 사유에는 「대두」,
 * 장바구니에는 「콩(대두)」가 나와 같은 알레르겐을 두 이름으로 부르게 된다.
 * (계약 로직 파일이라 이 레인에서 고치지 않았다 — model.ts 로 올려 한 벌로 두는 편이
 *  낫고, 그건 화면 밖의 결정이라 통합 담당에게 남긴다.)
 */
export const ALLERGEN_KO: Record<string, string> = {
  PEANUT: "땅콩", SOY: "대두", MILK: "우유", EGG: "계란", WHEAT: "밀", SHRIMP: "새우",
};

/**
 * 앞말의 받침에 맞는 조사를 고른다 — «일반컵는», «땅콩가» 를 화면에 내보내지 않으려고.
 *
 * 값이 fixture 와 사용자의 답에서 오므로 조사를 문장에 박아 둘 수 없다. 받침 여부는
 * 한글 음절 코드로 판정하고, **마지막 한글 음절**을 찾는다 — 이름이 늘 한글로 끝나지는
 * 않는다. 표에 없는 옵션은 «REGULAR» 처럼 원본 id 가 그대로 실리고, fixture 가 주는
 * 이름에 괄호나 단위가 붙으면 마지막 글자를 그냥 보는 것으로는 어긋난다.
 */
export function josa(word: string, withJong: string, withoutJong: string): string {
  const syllables = [...word].filter((c) => c >= "가" && c <= "힣");
  const last = syllables[syllables.length - 1];
  if (!last) return withoutJong; // 한글이 없으면 판정할 근거가 없다
  return (last.charCodeAt(0) - 0xac00) % 28 === 0 ? withoutJong : withJong;
}

/** 디자인의 «주문 방식» 절에 들어가는 그룹. 나머지는 카드의 «옵션:» 줄이 맡는다.
 *
 * CUP 을 지우지 않는다 — 화면은 이제 컵을 묻지 않아(질문 6개) UI 흐름의 실행계획에는
 * CUP 액션이 실리지 않지만, 계약은 CUP 을 유지한다(core/plan.ts — CLI raw input 의
 * cupOption 을 존중한다). 이 화면은 계획을 읽는 쪽이므로, 계획에 있을 수 있는 값을
 * 읽는 능력도 같이 남긴다. */
const WAY_GROUPS = new Set(["SERVICE_TYPE", "CUP"]);

/** 컵 값의 문장(시안 114:2117 문법) — 화면이 컵을 묻지 않으므로 계획에 실려 온 값을
 *  읽어 보여주기만 한다. 표에 없는 값은 이름만 적는다. 주문 방식(TAKE_OUT·DINE_IN)의
 *  문장은 없어졌다 — 그 자리가 선택 버튼이 되면서 값이 문장이 아니라 눌림이 됐다. */
const CUP_SENTENCE: Record<string, string> = {
  PAPER: "종이컵을 사용할게요",
  REGULAR: "일반컵을 사용할게요",
  NONE: "컵은 사용하지 않을게요",
};

/** 주문 방식 질문 — 마법사(S08)와 같은 질문·같은 부품으로 그 자리에서 고친다. */
const SERVICE_Q = QUESTIONS.find((x) => x.key === "serviceType")!;

/**
 * 수량 행의 출처를 바로잡는다 (QA 1차 TC-CM-06).
 *
 * core/plan.ts 의 preferenceByGroup 에는 QUANTITY 가 없어서, 사용자가 «5개»를 직접
 * 골랐어도 explainSelections 가 그 행을 AUTO(=상관없다고 하셔서)로 표시한다.
 * 한때는 계획이 고른 수량 옵션의 값과 대조해 다르면 «대체»로 표시했는데, 그러면
 * 눈금(1·2·3) 밖의 수량 5에 «원하신 5개는 이 메뉴에 없어 바꿨습니다»가 떴다 —
 * 계약의 수량은 자유 정수(integer ≥ 1)이고 화면의 수량·가격·제출이 전부 사용자의
 * 수를 그대로 쓰므로, 옵션 눈금은 키오스크 조작의 사정이지 주문의 사실이 아니다.
 * 그래서 수량을 말한 사람의 행은 언제나 USER 다. 말한 적 없으면 AUTO 그대로 둔다 —
 * 우리가 1로 정했다는 사실은 숨기지 않는다.
 * (근본 수정은 plan.ts 의 preferenceByGroup 에 QUANTITY 를 더하는 것이다.)
 */
export function fixQuantityOrigin(sels: PlanSelection[], wantedQty: number | undefined): PlanSelection[] {
  return sels.map((x) =>
    x.groupId === "QUANTITY" && x.origin === "AUTO" && wantedQty !== undefined
      ? { ...x, origin: "USER" as const }
      : x,
  );
}

/** 우리가 정했거나 바꾼 값의 사유 한 문장 — 주문 방식 줄과 카드 보조줄이 같이 쓴다. */
function originNote(x: PlanSelection): string | null {
  if (x.origin === "AUTO") return "상관없다고 하셔서 이 메뉴의 값으로 정했습니다";
  if (x.origin === "SUBSTITUTED") {
    const want = OPTION_KO[x.wanted ?? ""] ?? x.wanted ?? "";
    return `원하신 ${want}${josa(want, "은", "는")} 이 메뉴에 없어 바꿨습니다`;
  }
  return null;
}

export function CartReview() {
  const {
    uiRec, fixture, live, sessionInput, setSessionInput, runSimulation,
    setStep, confirmOffline, answers, applyCartAnswers,
  } = useFlow();
  if (!uiRec || !fixture) return null;

  const id = uiRec.rec.recommendedCandidateId;
  const qty = Number(uiRec.engineCtx.preferences.quantity ?? 1);
  const unit = candidatePrice(fixture, id) ?? 0;

  const preview = buildExecutionPlanCore(
    { approved: true, decision: "APPROVE" }, uiRec.rec, fixture, uiRec.engineCtx,
  );

  // 수량 행의 출처 보정 — 왜 이렇게 하는지는 fixQuantityOrigin 머리주석에 있다 (TC-CM-06)
  const sels: PlanSelection[] = fixQuantityOrigin(
    explainSelections(fixture, preview, uiRec.engineCtx),
    uiRec.engineCtx.preferences.quantity,
  );

  const need = sels.filter((x) => x.origin !== "USER");
  /* 주문 방식 절 — SERVICE_TYPE 은 그 자리에서 고치는 버튼이 됐고, CUP 은 화면이 묻지
     않는 값이라(질문 6개) 계획에 실려 있을 때만 문장으로 보여준다. */
  const waySel = sels.find((x) => x.groupId === "SERVICE_TYPE");
  const cupSel = sels.find((x) => x.groupId === "CUP");
  /* 카드의 «옵션:» 줄 (시안) — 주문 방식·수량을 뺀 메뉴 옵션 값들. 수량은 메뉴 줄의
     «x N개»가 이미 말하므로 두 번 적지 않는다. */
  const opt = sels.filter((x) => !WAY_GROUPS.has(x.groupId) && x.groupId !== "QUANTITY");
  /* 옵션 값 중 우리가 정했거나 바꾼 것 — 시안에는 없는 정보지만, 카드 보조줄로 이유를
     밝힌다. 화면이 «고르신 대로»가 아닌 것을 고른 것처럼 말하면 안 된다. */
  const optNeed = need.filter((x) => !WAY_GROUPS.has(x.groupId));

  // 성분 — 등록하신 알레르기가 이 메뉴에 들어 있지 않다는 사실 (fixture 의 후보 속성에서 읽는다)
  const declared = uiRec.engineCtx.hardConstraints.allergenIds ?? [];
  const unsure = declared.includes("UNKNOWN");
  const candidate = fixture.candidates.find((c) => c.candidateId === id) as
    (Candidate & { attributes?: { allergenIds?: string[] } }) | undefined;
  const inMenu = candidate?.attributes?.allergenIds ?? [];
  const free = declared.filter((a) => ALLERGEN_KO[a] && !inMenu.includes(a)).map((a) => ALLERGEN_KO[a]);

  const store = (fixture.manifest as { displayName?: string }).displayName ?? fixture.manifest.environmentId;
  /* 확실하지 않은 정보가 남아 있으면 여기서도 확정할 수 없다 — 메뉴 확인 화면과 같은 계약이다.
     이 화면만 빠져나가는 길이 되면 «임의로 판단하지 않는다»는 선언이 거짓이 된다. */
  const blocked = uiRec.rec.requiresReconfirmation;

  /* ChoiceGrid 는 setAnswers(함수 갱신) 문법을 쓴다 — 여기서는 고른 즉시 메뉴를 고정한
     재계산이 따라와야 하므로, 갱신값을 여기서 셈해 applyCartAnswers 로 넘긴다. */
  const pickAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>> = (updater) =>
    applyCartAnswers(typeof updater === "function" ? updater(answers) : updater);

  return (
    <Screen
      label="장바구니 확인"
      /* 뒤로가기는 «메뉴 확인»으로 간다 — 메뉴 확인 → 장바구니 확인 순서의 한 칸 앞이다 */
      onBack={() => setStep("menuConfirm")}
      /* 시안(99:1798)의 이 화면 제목은 매장 이름 줄 하나다 — 큰 제목 문장이 없다.
         h2 는 유지하고 크기만 CSS(.cart-store 스코프)가 시안의 15px 로 내린다. */
      title={<span className="cart-store">{store}</span>}
      actions={(
        /* [수정하기]는 없어졌다(파일머리 주석 · QA 1차 TC-CM-08) — 주 버튼 하나만 남는다 */
        <Cta tone="primary" disabled={blocked} label="주문하기"
          onClick={live ? runSimulation : confirmOffline} />
      )}
    >
      {blocked && (
        <p className="banner warn" role="alert">
          확실하지 않은 정보가 있어요. 임의로 판단하지 않습니다 — 뒤로 가서 조건을 다시 확인해 주시거나, 직원 도움을 이용해 주세요.
        </p>
      )}

      <div className="cart-box">
        <p className="cart-cap">메뉴</p>
        <div className="cart-menuline">
          <span className="cart-name">{candidateName(fixture, id)}</span>
          <span className="cart-price">{unit.toLocaleString()}원</span>
        </div>
        {/* «x 1개» 글자였던 자리 — 질문 화면(S10)과 같은 스테퍼로 그 자리에서 고친다 */}
        <div className="cart-qtyrow">
          <span className="cart-cap">수량</span>
          <Stepper label="수량" value={qty} max={QUANTITY_MAX}
            onChange={(n) => { if (n !== qty) applyCartAnswers({ ...answers, quantity: n }); }}
            atMaxNote={<>한 번에 {QUANTITY_MAX}개까지 고르실 수 있어요.</>} />
        </div>
        {free.length > 0 && <p className="cart-sub">성분: <b>{free.join(", ")}</b> 없음</p>}
        {unsure && (
          <p className="cart-sub">
            알레르기를 «잘 모르겠어요»로 답하셔서 <b>성분은 확인해 드리지 못했습니다.</b>
          </p>
        )}
        {/* 시안의 «옵션: 매운맛, 뼈» 줄 — 값은 실행계획에서 읽는다 */}
        {opt.length > 0 && (
          <p className="cart-sub">옵션: {opt.map((x) => OPTION_KO[x.id] ?? x.id).join(", ")}</p>
        )}
        {/* 옵션 값 중 우리가 정했거나 바꾼 것은 이유를 함께 밝힌다 (시안에 없는 상태 — 정직이 우선) */}
        {optNeed.map((x) => (
          <p className="cart-sub" key={x.groupId}>
            {GROUP_KO[x.groupId] ?? x.groupId}: {originNote(x)}
          </p>
        ))}
      </div>

      <hr className="cart-div" />
      <h3 className="cart-cap">주문 방식</h3>
      {/* 눌린 값은 사용자의 답이다. 메뉴가 그 방식을 지원하지 않으면 아래 보조줄이
          실제로 어떻게 되는지 밝힌다 — 고른 것처럼 꾸미지 않는 선이 이 화면의 계약이다. */}
      <ChoiceGrid q={SERVICE_Q} answers={answers} setAnswers={pickAnswers} />
      {waySel && waySel.origin !== "USER" && (
        <p className="cart-sub">{GROUP_KO[waySel.groupId] ?? waySel.groupId}: {originNote(waySel)}</p>
      )}
      {cupSel && (
        <p className="cart-sub">
          {CUP_SENTENCE[cupSel.id] ?? (OPTION_KO[cupSel.id] ?? cupSel.id)}
          {cupSel.origin !== "USER" && <> — {originNote(cupSel)}</>}
        </p>
      )}

      <hr className="cart-div" />
      <div className="cart-total">
        <span>총 가격</span>
        <b>{(unit * qty).toLocaleString()}원</b>
      </div>

      {live && (
        <label className="field">공식 시뮬레이터 세션에 제출하기 (선택 — 시뮬레이터 화면의 세션 ID 입력)
          <input value={sessionInput} onChange={(e) => setSessionInput(e.target.value)} placeholder="예: SIM-20260806-003 (비우면 새 세션)" />
        </label>
      )}
    </Screen>
  );
}
