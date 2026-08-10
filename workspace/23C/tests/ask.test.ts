/**
 * 질문 흐름 검사.
 *
 * 질문은 7개 고정이고 시스템이 먼저 끝내지 않는다. 그래서 여기 남은 것은
 * ① 안전 중단 판정(화면목록 S12)
 * ② 알레르기를 묻지 않으면 무슨 일이 벌어지는가 — 질문 순서를 바꾸려는 사람에게 주는 경고
 *
 * ②는 UX 취향이 아니라 계약이다. guide.txt §5 «알레르기·품절·이용 불가 후보는
 * 제외해야 합니다» 위반이 **스키마 검증을 통과하면서 조용히** 일어나기 때문에,
 * 자동 검출 수단이 여기 말고는 없다.
 */
import { describe, expect, it } from "vitest";
import { loadChickenFixture } from "./helpers";
import { buildChickenContext } from "../src/core/canonical";
import { buildRecommendation } from "../src/core/engine";
import {
  allergensAnswered, isUnresolved, shouldSafetyStop, MAX_RECONFIRM_ATTEMPTS,
} from "../src/core/ask";

const fixture = loadChickenFixture();
/** 한산한 시간 — 시간대 보너스를 배제해 점수를 재현 가능하게 고정한다. */
const NOW = new Date("2026-08-11T15:00:00+09:00");

function recFor(raw: Record<string, unknown>) {
  const { engineCtx } = buildChickenContext(raw);
  engineCtx.now = NOW;
  return { rec: buildRecommendation(fixture.candidates, engineCtx), ctx: engineCtx };
}

describe("알레르기 답변 판정", () => {
  it("'알레르기 없음'도 답변이다 — 빈 배열과 미수집을 구분한다", () => {
    expect(allergensAnswered(recFor({ allergies: [] }).ctx)).toBe(true);
    expect(allergensAnswered(recFor({}).ctx)).toBe(false);
  });

  it("모른다고 답하면 재확인이 걸린다", () => {
    const { rec, ctx } = recFor({ allergies: ["모름"] });
    expect(allergensAnswered(ctx)).toBe(true);
    expect(rec.requiresReconfirmation).toBe(true);
  });
});

describe("조용한 실패 — 알레르기를 묻지 않으면 벌어지는 일", () => {
  /* 질문 순서를 바꾸거나 "이 질문은 건너뛰어도 되지 않나" 생각이 들면 이 절을 볼 것.
     알레르기를 묻지 않은 상태는 UNKNOWN 이 아니라 '미수집'이라 아무 경보도 울리지 않는다. */

  it("하드제약이 비어 알레르기 제외가 아예 일어나지 않는다", () => {
    const { rec, ctx } = recFor({ spicyLevel: "보통" });
    expect(ctx.hardConstraints.allergenIds).toBeUndefined();
    expect(rec.requiresReconfirmation).toBe(false);   // 안전 정지도 안 걸린다
    expect(rec.excludedCandidates.some((e) => e.reasonCode === "ALLERGEN_CONFLICT")).toBe(false);
    // 땅콩이 든 후보가 추천 대상에 그대로 살아 있다
    expect(Object.keys(rec.scoreBreakdown ?? {})).toContain("CHICKEN-005");
  });

  it("알레르기를 답하면 같은 입력에서 해당 후보가 제외된다", () => {
    const { rec } = recFor({ spicyLevel: "보통", allergies: ["땅콩"] });
    expect(rec.excludedCandidates.some((e) => e.reasonCode === "ALLERGEN_CONFLICT")).toBe(true);
    expect(Object.keys(rec.scoreBreakdown ?? {})).not.toContain("CHICKEN-005");
  });
});

describe("안전 중단 판정 — 화면목록 S12", () => {
  it("알레르기를 모른다고 답한 추천은 미확정으로 본다", () => {
    expect(isUnresolved(recFor({ allergies: ["모름"], spicyLevel: "매운맛" }).rec)).toBe(true);
  });

  it("조건에 맞는 후보가 아예 없는 추천도 미확정으로 본다", () => {
    const { rec } = recFor({ allergies: ["땅콩", "콩"], budgetKrw: 3000 });
    expect(rec.recommendedCandidateId).toBeNull();
    expect(isUnresolved(rec)).toBe(true);
  });

  it("첫 번째 미확정에서는 멈추지 않는다 — 고쳐볼 기회를 한 번 준다", () => {
    const { rec } = recFor({ allergies: ["모름"], spicyLevel: "매운맛" });
    expect(shouldSafetyStop(rec, 1)).toBe(false);
  });

  it("두 번째에도 확정되지 않으면 멈춘다", () => {
    const { rec } = recFor({ allergies: ["모름"], spicyLevel: "매운맛" });
    expect(shouldSafetyStop(rec, MAX_RECONFIRM_ATTEMPTS)).toBe(true);
  });

  it("확정된 추천은 시도 횟수와 무관하게 멈추지 않는다", () => {
    const { rec } = recFor({ allergies: [], spicyLevel: "매운맛", boneType: "뼈" });
    expect(isUnresolved(rec)).toBe(false);
    expect(shouldSafetyStop(rec, 99)).toBe(false);
  });
});
