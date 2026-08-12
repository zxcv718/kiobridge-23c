import React from "react";
import type { Candidate } from "@kiobridge/participant-sdk";
import { useFlow } from "../flow";
import { Cta, Screen } from "../components";
import { GROUP_KO, OPTION_KO } from "../model";
import { buildExecutionPlanCore, explainSelections, type PlanSelection } from "../../../src/core/plan";
import { candidateName, candidatePrice } from "../logic";
import "./cart.css";

/**
 * 화면목록 S13 — 장바구니(최종) 확인 (Figma 99:1798 · 2026-08-12 시안 대조로 재정렬).
 *
 * 레이아웃은 시안 그대로다 — 매장 이름(캡션이자 화면 제목) → 메뉴 카드(수량·가격·
 * 성분·옵션) → 구분선 → 주문 방식(✓ 문장) → 구분선 → 총 가격 → 수정하기 → 주문하기.
 * 큰 제목 문장은 시안에 없다 — 매장 이름 줄이 이 화면의 제목을 겸한다(h2 는 유지 —
 * 화면 제목이 h2 하나라는 전제를 낭독기와 e2e 가 쓴다. 크기는 CSS 가 시안의 15px 로 내린다).
 *
 * 실제로 만들어질 실행계획을 그대로 읽어 보여준다 — 화면과 계획이 어긋날 수 없다.
 * 필수 옵션은 "상관없어요"여도 하나가 정해지므로 그 사실을 숨기지 않고,
 * 각 값이 어떻게 정해졌는지(USER·AUTO·SUBSTITUTED)를 구분해 밝힌다 —
 * 시안의 «✓ 포장해 갈게요» 줄은 전부 같은 모양이지만, 우리가 정했거나 바꾼 줄만
 * 상자로 띄우고 이유를 적는다. 그 줄들이 이 화면이 존재하는 이유다.
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

/** 시안(114:2117)의 주문 방식 문장 — 값이 곧 문장이 된다. 표에 없는 값은 이름만 적는다. */
const WAY_SENTENCE: Record<string, string> = {
  TAKE_OUT: "포장해 갈게요",
  DINE_IN: "매장에서 먹고 갈게요",
  PAPER: "종이컵을 사용할게요",
  REGULAR: "일반컵을 사용할게요",
  NONE: "컵은 사용하지 않을게요",
};

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
    setStep, openEdit, confirmOffline,
  } = useFlow();
  if (!uiRec || !fixture) return null;

  const id = uiRec.rec.recommendedCandidateId;
  const qty = Number(uiRec.engineCtx.preferences.quantity ?? 1);
  const unit = candidatePrice(fixture, id) ?? 0;

  const preview = buildExecutionPlanCore(
    { approved: true, decision: "APPROVE" }, uiRec.rec, fixture, uiRec.engineCtx,
  );

  /* 수량의 출처를 바로잡는다.
   *
   * core/plan.ts 의 preferenceByGroup 에는 QUANTITY 가 없어서, 사용자가 «2개»를 직접
   * 골랐어도 explainSelections 가 그 행을 AUTO(=상관없다고 하셔서)로 표시한다.
   * 값 자체는 맞지만 **사유가 사실이 아니다** — 고른 사람에게 "안 골랐다"고 말하는 꼴이다.
   * 계약 로직은 이 레인에서 고치지 않으므로, 화면에서 계획과 대조해 바로잡는다:
   * 계획이 고른 수량 옵션의 값이 사용자가 말한 수량과 같으면 USER, 다르면 대체다.
   * (근본 수정은 plan.ts 의 preferenceByGroup 에 QUANTITY 를 더하는 것이다.) */
  const wantedQty = uiRec.engineCtx.preferences.quantity;
  const qtyGroup = fixture.optionGroups.find((g) => g.groupId === "QUANTITY");
  const qtyValueOf = (optionId: string): number | undefined =>
    (qtyGroup?.options.find((o) => o.id === optionId) as { value?: number } | undefined)?.value;

  const sels: PlanSelection[] = explainSelections(fixture, preview, uiRec.engineCtx).map((x): PlanSelection => {
    if (x.groupId !== "QUANTITY" || x.origin !== "AUTO" || wantedQty === undefined) return x;
    return qtyValueOf(x.id) === wantedQty
      ? { ...x, origin: "USER" }
      : { ...x, origin: "SUBSTITUTED", wanted: `${wantedQty}개` };
  });

  const need = sels.filter((x) => x.origin !== "USER");
  const way = sels.filter((x) => WAY_GROUPS.has(x.groupId));
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

  return (
    <Screen
      label="장바구니 확인"
      /* 뒤로가기는 «메뉴 확인»으로 간다 — 메뉴 확인 → 장바구니 확인 순서의 한 칸 앞이다 */
      onBack={() => setStep("menuConfirm")}
      /* 시안(99:1798)의 이 화면 제목은 매장 이름 줄 하나다 — 큰 제목 문장이 없다.
         h2 는 유지하고 크기만 CSS(.cart-store 스코프)가 시안의 15px 로 내린다. */
      title={<span className="cart-store">{store}</span>}
      actions={(
        <>
          {/* 시안 버튼 순서 그대로 — 수정하기(흰) 위, 주문하기(주황) 아래 */}
          <Cta label="수정하기" onClick={openEdit} />
          <Cta tone="primary" disabled={blocked} label="주문하기"
            onClick={live ? runSimulation : confirmOffline} />
        </>
      )}
    >
      {blocked && (
        <p className="banner warn" role="alert">
          확실하지 않은 정보가 있어요. 임의로 판단하지 않습니다 — «수정하기»에서 조건을 확인해 주시거나, 직원 도움을 이용해 주세요.
        </p>
      )}

      <div className="cart-box">
        <p className="cart-cap">메뉴</p>
        <div className="cart-menuline">
          <span className="cart-name">{candidateName(fixture, id)}</span>
          <span className="cart-qty">x {qty}개</span>
          <span className="cart-price">{unit.toLocaleString()}원</span>
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
      {/* 줄마다 «고르신 대로»를 반복하는 대신, 한 번만 말한다. 상자로 띄운 줄이
          무엇인지 여기서 밝히므로 «강조된 것이 왜 강조됐는지»가 색에만 기대지 않는다. */}
      <p className="cart-legend">
        {need.length === 0
          ? "모두 고르신 그대로입니다."
          : "아래 강조된 항목은 저희가 정했거나 바꾼 것입니다 — 항목마다 이유를 적었습니다."}
      </p>
      {way.length > 0 && (
        <>
          <h3 className="cart-cap">주문 방식</h3>
          <ul className="sellist cart-sel">
            {way.map((x) => (
              <li key={x.groupId} data-origin={x.origin}>
                {/* 표식은 장식이다 — 누가 정했는지는 아래 문장이 말한다 */}
                <span className="cart-chk" aria-hidden="true">{x.origin === "USER" ? "✓" : "!"}</span>
                <p className="cart-selmain">
                  {/* 시안의 «✓ 포장해 갈게요» — 값이 곧 문장이다 */}
                  <b className="sv">{WAY_SENTENCE[x.id] ?? (OPTION_KO[x.id] ?? x.id)}</b>
                  {x.origin === "USER" && <span className="srline">고르신 대로</span>}
                </p>
                {x.origin !== "USER" && <p className="so">{originNote(x)}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
      {need.length > 0 && (
        /* 대안은 «메뉴 선택» 화면이 맡는다 — 점수순 목록에서 직접 고른다 (노션 기획). */
        <button type="button" className="btn ghost cart-alt" onClick={() => setStep("menuSelect")}>
          다른 메뉴 보기
        </button>
      )}

      <hr className="cart-div" />
      <div className="cart-total">
        <span>총 가격</span>
        <b>{(unit * qty).toLocaleString()}원</b>
      </div>

      {/* 시뮬레이션이라는 사실은 주문을 확정하기 직전에 말한다 — 그게 이 말이 필요한 자리다 */}
      <p className="hint cart-foot">장바구니 확인까지만 진행합니다 — 실제 결제·주문은 일어나지 않습니다.</p>

      {live && (
        <label className="field">공식 시뮬레이터 세션에 제출하기 (선택 — 시뮬레이터 화면의 세션 ID 입력)
          <input value={sessionInput} onChange={(e) => setSessionInput(e.target.value)} placeholder="예: SIM-20260806-003 (비우면 새 세션)" />
        </label>
      )}
    </Screen>
  );
}
