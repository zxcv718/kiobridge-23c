/**
 * 추천 사유의 정확도 (QA 1차 TC-CM-03).
 *
 * «추천해요»류 문장은 **추천된 메뉴가 실제로 만족하는 조건**만 말해야 한다.
 * 사용자 선호만 보고 만들면 두 가지 거짓이 실제로 나왔다 —
 *   ① 순한맛을 골랐는데 매운맛 메뉴가 추천된 화면에 「순한맛 메뉴를 보여드립니다」
 *   ② 순살 메뉴를 직접 골랐는데 「뼈가 가능하며」
 * 어긋난 축의 자리는 «주의 필요»(unmetConditions)다. 코어(engine.test.ts)가 축 판정을
 * 재고, 여기서는 **직접 선택 경로의 사유 문장**이 고른 메뉴를 따라오는지를 잰다.
 */
import { describe, it, expect } from "vitest";
import { computeRecommendation, withManualSelection } from "../ui/src/logic";
import { A11Y_DEFAULT, buildRawInput } from "../ui/src/model";
import { loadChickenFixture } from "./helpers";

const fx = loadChickenFixture();
const NOW = new Date("2026-08-11T15:00:00+09:00"); // 한산한 시간 — 시간대 보너스 배제

// 순한맛·뼈·매장 → 엔진 1순위는 매운 뼈 닭강정(CHICKEN-003 · 매운맛·뼈)
const raw = buildRawInput(
  { serviceType: "매장", spicyLevel: "순한맛", boneType: "뼈", quantity: 1, allergies: ["없음"], budgetKrw: 5000 },
  A11Y_DEFAULT, false, false,
);

describe("추천 사유 — 메뉴가 실제로 만족하는 축만 말한다", () => {
  it("엔진 1순위(매운맛·뼈): 어긋난 맵기 사유는 없고, 맞은 형태 사유는 있다", () => {
    const base = computeRecommendation(raw, fx, NOW);
    expect(base.rec.recommendedCandidateId).toBe("CHICKEN-003");
    const joined = base.rec.recommendationReasons.join(" ");
    expect(joined).not.toContain("순한맛을 선호하셔서");
    expect(joined).toContain("뼈을 선호하셔서");
    expect(base.rec.unmetConditions).toContain("원하신 맵기는 순한맛인데, 이 메뉴는 매운맛입니다");
  });

  it("직접 선택(순한맛·순살): 사유도 고른 메뉴 기준으로 다시 만든다", () => {
    const base = computeRecommendation(raw, fx, NOW);
    const picked = withManualSelection(base, fx, "CHICKEN-002"); // 순한 순살 닭강정
    const joined = picked.rec.recommendationReasons.join(" ");
    expect(picked.rec.recommendationReasons[0]).toContain("직접 고르신");
    // 고른 메뉴는 순한맛이다 — 이제 맵기 사유가 참이 되어 돌아온다
    expect(joined).toContain("순한맛을 선호하셔서");
    // 고른 메뉴는 순살이다 — 뼈 사유는 «주의 필요»의 몫이다
    expect(joined).not.toContain("뼈을 선호하셔서");
    expect(picked.rec.unmetConditions).toContain("원하신 형태는 뼈인데, 이 메뉴는 순살입니다");
  });
});

/**
 * 직접 선택이 «재확인»을 푸는 범위 (TC-CM-01 여파).
 *
 * 「잘 모르겠어요」가 화면에 들어오면서, 미확정 상태에서 «메뉴 수정 → 직접 선택»을
 * 지나는 길이 생겼다. 직접 선택은 **메뉴를 확인한 것**이지 자기 알레르기를 확인한 것이
 * 아니다 — 미확인 알레르기의 재확인이 여기서 풀리면, 알레르기를 모르는 채로 승인
 * 차단이 사라진다(안전 요건 위반). 반대로 신뢰 낮은 입력의 재확인은 화면에서 직접
 * 보고 골랐으므로 푸는 것이 맞다.
 */
describe("직접 선택과 재확인", () => {
  it("알레르기 «미확인»(모름)은 직접 선택으로 풀리지 않는다", () => {
    const raw모름 = buildRawInput(
      { serviceType: "매장", spicyLevel: "순한맛", boneType: "뼈", quantity: 1, allergies: ["모름"], budgetKrw: "없음" },
      A11Y_DEFAULT, false, false,
    );
    const base = computeRecommendation(raw모름, fx, NOW);
    expect(base.rec.requiresReconfirmation).toBe(true);
    const picked = withManualSelection(base, fx, "CHICKEN-002");
    expect(picked.rec.requiresReconfirmation).toBe(true); // 여전히 승인 차단
  });

  it("신뢰 낮은 입력의 재확인은 직접 선택이 푼다 — 화면에서 보고 골랐다", () => {
    const raw저신뢰 = {
      ...buildRawInput(
        { serviceType: "매장", spicyLevel: "순한맛", boneType: "뼈", quantity: 1, allergies: ["없음"], budgetKrw: "없음" },
        A11Y_DEFAULT, false, false,
      ),
      _confidence: 0.4, _confirmedByUser: false,
    };
    const base = computeRecommendation(raw저신뢰, fx, NOW);
    expect(base.rec.requiresReconfirmation).toBe(true);
    const picked = withManualSelection(base, fx, "CHICKEN-002");
    expect(picked.rec.requiresReconfirmation).toBe(false);
  });
});
