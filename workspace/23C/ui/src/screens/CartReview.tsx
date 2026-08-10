import React from "react";
import type { Candidate } from "@kiobridge/participant-sdk";
import { useFlow } from "../flow";
import { Header } from "../components";
import { GROUP_KO, OPTION_KO } from "../model";
import { buildExecutionPlanCore, explainSelections, type PlanSelection } from "../../../src/core/plan";
import { candidateName, candidatePrice } from "../logic";
import "./cart.css";

/**
 * 화면목록 S13 — 장바구니(최종) 확인 (Figma 99:1798).
 *
 * 실제로 만들어질 실행계획을 그대로 읽어 보여준다 — 화면과 계획이 어긋날 수 없다.
 * 필수 옵션은 "상관없어요"여도 하나가 정해지므로 그 사실을 숨기지 않고,
 * 각 값이 어떻게 정해졌는지(USER·AUTO·SUBSTITUTED)를 구분해 밝힌다.
 *
 * 디자인의 값(매운맛 닭강정 · 17,800원 · "옵션: 매운맛, 뼈")은 목업이라 쓰지 않는다.
 * 메뉴·가격은 fixture 에서, 옵션 목록은 **실행계획에서** 읽는다.
 *
 * 이 화면에서는 주문만 확인한다. 저장 얘기는 여기 없다 — 뒷사람 눈치가 최고조인
 * 순간에 다음 방문에 관한 판단을 시키지 않는다(저장 여부는 프로필 단계에서 물었고,
 * 그 결과는 주문이 끝난 뒤 S15 에서 알린다).
 */

/**
 * 알레르기 코드의 한국어 이름.
 *
 * core/engine.ts 에 같은 표가 있지만 내보내지 않으므로 여기서 다시 적는다.
 * (계약 로직 파일이라 이 레인에서 고치지 않았다 — model.ts 로 올리는 편이 낫고,
 *  그건 화면 밖의 결정이라 통합 담당에게 남긴다.)
 */
export const ALLERGEN_KO: Record<string, string> = {
  PEANUT: "땅콩", SOY: "콩(대두)", MILK: "우유", EGG: "계란", WHEAT: "밀", SHRIMP: "새우",
};

/**
 * 앞말의 받침에 맞는 조사를 고른다 — «일반컵는», «땅콩가» 를 화면에 내보내지 않으려고.
 *
 * 값이 fixture 와 사용자의 답에서 오므로 조사를 문장에 박아 둘 수 없다. 받침 여부는
 * 한글 음절 코드로 판정하고, **마지막 한글 음절**을 찾는다 — "콩(대두)" 처럼
 * 괄호로 끝나는 이름이 있어서 문자열의 마지막 글자를 그냥 보면 어긋난다.
 */
export function josa(word: string, withJong: string, withoutJong: string): string {
  const syllables = [...word].filter((c) => c >= "가" && c <= "힣");
  const last = syllables[syllables.length - 1];
  if (!last) return withoutJong; // 한글이 없으면 판정할 근거가 없다
  return (last.charCodeAt(0) - 0xac00) % 28 === 0 ? withoutJong : withJong;
}

/** 디자인의 «주문 방식» 절에 들어가는 그룹. 나머지는 «메뉴 옵션»이다. */
const WAY_GROUPS = new Set(["SERVICE_TYPE", "CUP"]);

function SelList({ title, items }: { title: string; items: PlanSelection[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="selhead">{title}</h3>
      <ul className="sellist cart-sel">
        {items.map((x) => (
          <li key={x.groupId} data-origin={x.origin}>
            {/* 표식은 장식이다 — 누가 정했는지는 아래 문장이 말한다 */}
            <span className="cart-chk" aria-hidden="true">{x.origin === "USER" ? "✓" : "!"}</span>
            <span className="sg">{GROUP_KO[x.groupId] ?? x.groupId}</span>
            <span className="sv">{OPTION_KO[x.id] ?? x.id}</span>
            <span className="so">
              {x.origin === "USER" && "고르신 대로"}
              {x.origin === "AUTO" && "상관없다고 하셔서 이 메뉴의 값으로 정했습니다"}
              {x.origin === "SUBSTITUTED" && (() => {
                const want = OPTION_KO[x.wanted!] ?? x.wanted ?? "";
                return `원하신 ${want}${josa(want, "은", "는")} 이 메뉴에 없어 바꿨습니다`;
              })()}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CartReview() {
  const {
    uiRec, fixture, live, sessionInput, setSessionInput, runSimulation,
    setStep, openEdit, confirmOffline, staffBtn, simple,
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

  return (
    <section className="card">
      {/* 뒤로가기는 «메뉴 확인»으로 간다 — 추천 → 메뉴 확인 → 장바구니 확인 순서의 한 칸 앞이다 */}
      <Header title="마지막으로 확인해 주세요" onBack={() => setStep("menuConfirm")} backLabel="뒤로" />
      <p className="cart-cap">{(fixture.manifest as { displayName?: string }).displayName ?? fixture.manifest.environmentId}</p>

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
      <SelList title="주문 방식" items={way} />
      <SelList title="메뉴 옵션" items={opt} />
      {need.length > 0 && (
        <div className="btnrow" style={{ marginTop: 4 }}>
          <button type="button" className="btn ghost" onClick={() => setStep("recommend")}>다른 메뉴 보기</button>
        </div>
      )}

      <hr className="cart-div" />
      <div className="cart-total">
        <span>총 가격</span>
        <b>{(unit * qty).toLocaleString()}원</b>
      </div>

      <div className="banner ok">가상 키오스크에서 장바구니 확인까지만 진행합니다. <b>실제 결제·주문은 일어나지 않습니다.</b></div>
      {live && (
        <label className="field">공식 시뮬레이터 세션에 제출하기 (선택 — 시뮬레이터 화면의 세션 ID 입력)
          <input value={sessionInput} onChange={(e) => setSessionInput(e.target.value)} placeholder="예: SIM-20260806-003 (비우면 새 세션)" />
        </label>
      )}
      {!simple && !live && (
        <p className="hint">주문을 확정하면 키오스크에서 밟게 될 단계를 계획으로 만들어 보여드립니다.</p>
      )}
      <div className="btnrow">
        <button type="button" className="btn ghost" onClick={openEdit}>수정하기</button>
        {/* 체험 모드에서도 주문은 끝까지 간다 — 계획을 만들어 보관하고 결과 화면에서 그 결말을 보여준다. */}
        <button type="button" className="btn primary" onClick={live ? runSimulation : confirmOffline}>
          {live ? "가상 키오스크에서 실행" : "주문 확정하기"}
        </button>
        {staffBtn()}
      </div>
    </section>
  );
}
