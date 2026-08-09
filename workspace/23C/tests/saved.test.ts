/**
 * 기기 저장본 마이그레이션 검사.
 *
 * 저장 형식을 바꿀 때 기존 사용자의 설정이 조용히 사라지면 안 된다.
 * guide.txt §5 의 기기 저장 요건("저장된 내용 확인·수정·삭제")은 저장본이 살아 있어야 성립한다.
 */
import { describe, expect, it } from "vitest";
import { migrateSaved, SAVED_VERSION } from "../src/core/saved";

const v3 = {
  answers: { allergies: ["땅콩"], spicyLevel: "매운맛", boneType: "순살" },
  a11y: { largeText: true, highContrast: false },
  scope: "LASTING",
  savedAt: "2026-08-08T10:00:00.000Z",
};

describe("저장본 마이그레이션", () => {
  it("v3 저장본을 읽으면 기존 설정이 그대로 살아남는다", () => {
    const m = migrateSaved(v3);
    expect(m).not.toBeNull();
    expect(m!.answers).toEqual(v3.answers);
    expect(m!.a11y).toEqual(v3.a11y);
    expect(m!.scope).toBe("LASTING");
    expect(m!.v).toBe(SAVED_VERSION);
  });

  it("v3 에는 지난 주문이 없으므로 lastOrder 는 비어 있다", () => {
    expect(migrateSaved(v3)!.lastOrder).toBeUndefined();
  });

  it("v4 저장본의 지난 주문은 보존된다", () => {
    const m = migrateSaved({
      ...v3, v: 4,
      lastOrder: { candidateId: "CHICKEN-001", answers: { spicyLevel: "매운맛" }, savedAt: "2026-08-09T00:00:00.000Z" },
    });
    expect(m!.lastOrder?.candidateId).toBe("CHICKEN-001");
  });

  it("알 수 없는 scope 는 ALL 로 되돌린다 — 저장 범위를 임의로 넓히지 않는다", () => {
    expect(migrateSaved({ ...v3, scope: "EVERYTHING" })!.scope).toBe("ALL");
  });

  it("형태가 깨진 lastOrder 는 버리되 나머지 설정은 살린다", () => {
    const m = migrateSaved({ ...v3, v: 4, lastOrder: { candidateId: 123 } });
    expect(m!.lastOrder).toBeUndefined();
    expect(m!.answers).toEqual(v3.answers);
  });

  it("저장본이 아닌 값에는 throw 하지 않고 null 을 돌려준다", () => {
    for (const bad of [null, undefined, 42, "문자열", [], {}, { answers: "객체가 아님" }]) {
      expect(() => migrateSaved(bad)).not.toThrow();
      expect(migrateSaved(bad)).toBeNull();
    }
  });
});
