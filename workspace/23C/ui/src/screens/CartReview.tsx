import React from "react";
import type { Candidate } from "@kiobridge/participant-sdk";
import { useFlow } from "../flow";
import { Cta, Emphasize, Screen } from "../components";
import { GROUP_KO, OPTION_KO } from "../model";
import { buildExecutionPlanCore, explainSelections, type PlanSelection } from "../../../src/core/plan";
import { candidateName, candidatePrice } from "../logic";
import "./cart.css";

/**
 * 화면목록 S13 — 장바구니(최종) 확인 (Figma 99:1798).
 *
 * 레이아웃은 디자인 그대로다 — 매장 이름(캡션) → 메뉴 카드 → 구분선 → 주문 방식 →
 * 구분선 → 총 가격 → 넓은 여백 → 화면 아래 CTA. 그 뼈대는 `Screen` 이 들고 있으므로
 * 이 파일은 **무엇을 담을지만** 정한다.
 *
 * 실제로 만들어질 실행계획을 그대로 읽어 보여준다 — 화면과 계획이 어긋날 수 없다.
 * 필수 옵션은 "상관없어요"여도 하나가 정해지므로 그 사실을 숨기지 않고,
 * 각 값이 어떻게 정해졌는지(USER·AUTO·SUBSTITUTED)를 구분해 밝힌다.
 *
 * 디자인의 값(매운맛 닭강정 · 17,800원 · "옵션: 매운맛, 뼈")은 목업이라 쓰지 않는다.
 * 메뉴·가격은 fixture 에서, 옵션 목록은 **실행계획에서** 읽는다.
 *
 * 디자인은 메뉴 카드 안에 "옵션: 매운맛, 뼈" 한 줄을 넣었지만 우리는 넣지 않는다.
 * 그 한 줄로는 «누가 정했는가»를 말할 수 없고, 아래 목록과 값이 두 벌이 되어
 * 어느 쪽이 진짜인지 모르게 된다. 카드는 메뉴와 성분만 말하고, 옵션은 목록이 맡는다.
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

/** 디자인의 «주문 방식» 절에 들어가는 그룹. 나머지는 «메뉴 옵션»이다. */
const WAY_GROUPS = new Set(["SERVICE_TYPE", "CUP"]);

/**
 * 선택 한 절 — 디자인의 «✓ 포장해 갈게요» 줄(114:2117)에 출처 한 줄을 더한 것.
 *
 * 고른 대로인 줄은 디자인처럼 테두리 없이 흐른다. 우리가 정했거나 바꾼 줄만
 * 상자가 되어 눈에 걸린다 — 이 화면이 존재하는 이유가 그 줄들이기 때문이다.
 */
function SelList({ title, items }: { title: string; items: PlanSelection[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="cart-cap">{title}</h3>
      <ul className="sellist cart-sel">
        {items.map((x) => (
          <li key={x.groupId} data-origin={x.origin}>
            {/* 표식은 장식이다 — 누가 정했는지는 아래 문장이 말한다 */}
            <span className="cart-chk" aria-hidden="true">{x.origin === "USER" ? "✓" : "!"}</span>
            <p className="cart-selmain">
              <span className="sg">{GROUP_KO[x.groupId] ?? x.groupId}</span>
              <b className="sv">{OPTION_KO[x.id] ?? x.id}</b>
              {/* 고른 대로인 줄은 «고르신 대로»를 눈에 보이게 반복하지 않는다 — 다섯 줄이
                  같은 말을 하면 정작 다른 줄(우리가 정한 것)이 묻힌다. 눈으로는 상자가
                  없다는 것이 신호이고, 화면 낭독기에는 줄마다 이 문장이 그대로 나간다. */}
              {x.origin === "USER" && <span className="srline">고르신 대로</span>}
            </p>
            {x.origin !== "USER" && (
              <p className="so">
                {x.origin === "AUTO" && "상관없다고 하셔서 이 메뉴의 값으로 정했습니다"}
                {x.origin === "SUBSTITUTED" && (() => {
                  const want = OPTION_KO[x.wanted!] ?? x.wanted ?? "";
                  return `원하신 ${want}${josa(want, "은", "는")} 이 메뉴에 없어 바꿨습니다`;
                })()}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function CartReview() {
  const {
    uiRec, fixture, live, sessionInput, setSessionInput, runSimulation,
    setStep, setEditOpen, openEdit, confirmOffline, simple,
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
  const opt = sels.filter((x) => !WAY_GROUPS.has(x.groupId));

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
      /* 뒤로가기는 «메뉴 확인»으로 간다 — 추천 → 메뉴 확인 → 장바구니 확인 순서의 한 칸 앞이다 */
      onBack={() => setStep("menuConfirm")}
      /* 시안의 매장 이름 줄은 공용 «고객님,» 줄과 크기·굵기·색이 다르다.
         공용 클래스를 고치면 열여섯 화면이 따라 바뀌므로, 이 화면만 걸리는
         스코프를 안쪽에 씌운다 (cart.css 의 .kb-eyebrow .cart-store). */
      eyebrow={<span className="cart-store">{store}</span>}
      title={<Emphasize text="마지막으로 확인해 주세요" word="확인" />}
      /* 디자인에는 부제가 없다. 대신 우리는 예전에 카드 하나를 통째로 쓰던 «결제는
         일어나지 않습니다» 안내를 여기에 녹였다 — 화면 한 장이 한 가지를 말하려면
         같은 뜻의 덩어리를 여러 개 쌓지 않아야 한다. */
      subtitle="장바구니 확인까지만 진행합니다 — 실제 결제·주문은 일어나지 않습니다."
      actions={(
        <>
          {/* 체험 모드에서도 주문은 끝까지 간다 — 계획을 만들어 보관하고 결과 화면에서 그 결말을 보여준다. */}
          <Cta tone="primary" disabled={blocked}
            label={live ? "가상 키오스크에서 실행" : "주문 확정하기"}
            onClick={live ? runSimulation : confirmOffline} />
          <Cta label="수정하기" onClick={openEdit} />
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
      </div>

      <hr className="cart-div" />
      {/* 줄마다 «고르신 대로»를 반복하는 대신, 한 번만 말한다. 상자로 띄운 줄이
          무엇인지 여기서 밝히므로 «강조된 것이 왜 강조됐는지»가 색에만 기대지 않는다. */}
      <p className="cart-legend">
        {need.length === 0
          ? "모두 고르신 그대로입니다."
          : "아래 강조된 항목은 저희가 정했거나 바꾼 것입니다 — 항목마다 이유를 적었습니다."}
      </p>
      <SelList title="주문 방식" items={way} />
      <SelList title="메뉴 옵션" items={opt} />
      {need.length > 0 && (
        /* 대안 목록은 조건 수정 화면의 «메뉴» 행에 있다 — 그 행을 바로 펴서 보낸다.
           (추천 화면이 메뉴 확인과 합쳐지면서 대안이 그리로 옮겨졌다) */
        <button type="button" className="btn ghost cart-alt"
          onClick={() => { setEditOpen("__menu"); setStep("edit"); }}>
          다른 메뉴 보기
        </button>
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
      {!simple && !live && (
        <p className="hint cart-foot">주문을 확정하면 키오스크에서 밟게 될 단계를 계획으로 만들어 보여드립니다.</p>
      )}
    </Screen>
  );
}
