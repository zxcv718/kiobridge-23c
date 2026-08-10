import React from "react";
import { useFlow } from "../flow";
import { Badge, Cta, Emphasize, Screen } from "../components";
import { OPTION_KO } from "../model";
import { candidateName, candidatePrice } from "../logic";
import { ALLERGEN_KO, josa } from "./CartReview";
import "./cart.css";
import "./recommend.css";

/**
 * 메뉴 확인 (신규 · Figma 99:1762).
 *
 * 추천과 장바구니 확인 사이의 한 단계다. 추천 화면은 «왜 이것인가»(이유·대안·제외)를
 * 말하는 곳이고, 장바구니 확인은 «키오스크에서 무엇을 누르는가»를 말하는 곳이다.
 * 그 사이에서 이 화면이 하는 일은 하나뿐이다 — **고른 것이 이것이 맞는지** 묻는다.
 *
 * 디자인의 값(매운맛 닭강정 / 17,800원)은 목업이라 쓰지 않는다. 메뉴·가격은 fixture 에서,
 * 조건 문장은 이번 세션의 정규화된 선호·하드제약에서 그대로 읽는다 —
 * 화면이 자기 값을 따로 적으면 계획과 어긋날 수 있다.
 *
 */
/** 조건 절 하나 — «앞말 + 강조할 값 + 뒷말». 문장 조립은 화면이, 값은 코어가 준다. */
interface Clause { pre?: string; em: string; post: string }

/** 사용자가 고른 조건을 한 문장으로 — 값은 전부 정규화된 선호에서 읽는다. */
function whyClauses(
  prefs: Record<string, unknown>, allergens: string[],
): { lead: Clause | null; tail: Clause[] } {
  const ko = (v: unknown) => OPTION_KO[String(v)] ?? String(v);
  // NO_PREFERENCE·UNKNOWN 은 «말하지 않은 것»이라 문장에 넣지 않는다 (core/plan.ts definite 와 같은 기준)
  const definite = (v: unknown) => typeof v === "string" && v !== "NO_PREFERENCE" && v !== "UNKNOWN";

  const named = allergens.map((a) => ALLERGEN_KO[a]).filter(Boolean);
  const joined = named.join(", ");
  const lead: Clause | null = named.length > 0
    ? { em: joined, post: `${josa(joined, "이", "가")} 없는 메뉴 중 ` }
    : null;

  const tail: Clause[] = [];
  const add = (em: string, post: string, pre?: string) => tail.push({ pre, em, post });
  if (definite(prefs.spicyLevel)) add(ko(prefs.spicyLevel), "이고", "맵기는 ");
  if (definite(prefs.boneType)) add(ko(prefs.boneType), `${josa(ko(prefs.boneType), "이", "가")} 가능하며`);
  if (definite(prefs.serviceType)) add(ko(prefs.serviceType), `${josa(ko(prefs.serviceType), "이", "가")} 가능한`);
  return { lead, tail };
}

export function MenuConfirm() {
  const { uiRec, fixture, setStep, staffBtn, simple } = useFlow();
  if (!uiRec || !fixture) return null;

  const id = uiRec.rec.recommendedCandidateId;
  const blocked = uiRec.rec.requiresReconfirmation;
  const { lead, tail } = whyClauses(
    uiRec.engineCtx.preferences as unknown as Record<string, unknown>,
    uiRec.engineCtx.hardConstraints.allergenIds ?? [],
  );

  return (
    <Screen
      label="메뉴 확인"
      onBack={() => setStep("recommend")}
      eyebrow="고객님,"
      /* 디자인은 이 물음을 카드 아래 15px 캡션으로 두었지만, 화면이 묻는 것이 이것 하나뿐이라
         제목 자리로 올렸다. 나머지 화면들과 같은 문법(인사말 → 큰 제목 → 내용 → 아래 CTA)이
         유지되고, «무엇을 답해야 하는 화면인가»가 첫 줄에서 정해진다. */
      title={<Emphasize text="이 메뉴를 선택하시겠어요?" word="이 메뉴" />}
      actions={
        <>
          {/* 디자인은 «네 / 아니요» 두 버튼이다. 무엇에 대한 예인지가 버튼에 없으면
              화면을 처음부터 읽지 않은 사람에게 뜻이 서지 않아, 하는 일을 라벨에 적었다.
              또 디자인은 «아니요»를 위에 두지만 우리는 주 동작을 위에 둔다 — 열여섯 화면이
              모두 그 순서라, 이 화면만 뒤집으면 손이 기억한 자리가 어긋난다. */}
          <Cta tone="primary" label="이대로 담기" disabled={blocked} onClick={() => setStep("confirm")} />
          <div className="q-actrow">
            <button type="button" className="btn ghost" onClick={() => setStep("recommend")}>다른 메뉴 볼게요</button>
            {staffBtn()}
          </div>
        </>
      }
    >
      <div className="mc-flow">
        {/* 확실하지 않은 정보가 남아 있으면 여기서도 승인할 수 없다 —
            추천 화면과 같은 계약이며, 이 화면만 빠져나가는 길이 되면 안 된다. */}
        {blocked && (
          <div className="banner warn" role="alert">
            확실하지 않은 정보가 있어요. 임의로 판단하지 않습니다 — 조건을 다시 확인해 주시거나, 직원 도움을 이용해 주세요.
          </div>
        )}

        <p className="mc-badgeline"><Badge>✓ 추천해요</Badge></p>

        {(lead || tail.length > 0) && (
          <p className="mc-why">
            {lead && <><b>{lead.em}</b>{lead.post}</>}
            {tail.map((c, i) => (
              <React.Fragment key={i}>
                {c.pre}<b>{c.em}</b>{c.post}{i < tail.length - 1 ? ", " : " "}
              </React.Fragment>
            ))}
            메뉴를 추천드려요.
          </p>
        )}

        <div className="cart-box">
          <p className="cart-cap">추천 메뉴</p>
          <div className="cart-menuline">
            <span className="cart-name">{candidateName(fixture, id)}</span>
            <span className="cart-price">{candidatePrice(fixture, id)?.toLocaleString()}원</span>
          </div>
        </div>

        {!simple && (
          <p className="hint">
            담아도 결제는 일어나지 않습니다. 다음 화면에서 무엇을 주문하게 되는지 전부 보여드립니다.
          </p>
        )}
      </div>
    </Screen>
  );
}
