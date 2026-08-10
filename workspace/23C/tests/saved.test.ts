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
    expect(m!.v).toBe(SAVED_VERSION);
  });

  it("v3 에는 지난 메뉴 개념이 없으므로 lastCandidateId 는 비어 있다", () => {
    expect(migrateSaved(v3)!.lastCandidateId).toBeUndefined();
  });

  it("지난번에 고른 메뉴는 보존된다", () => {
    const m = migrateSaved({ ...v3, v: 4, lastCandidateId: "CHICKEN-001" });
    expect(m!.lastCandidateId).toBe("CHICKEN-001");
  });

  it("중간 형식(lastOrder 객체)에 남은 메뉴도 읽어 온다 — 형식이 바뀌어도 버리지 않는다", () => {
    const m = migrateSaved({
      ...v3, v: 4,
      lastOrder: { candidateId: "CHICKEN-003", answers: { spicyLevel: "매운맛" }, savedAt: "2026-08-09T00:00:00.000Z" },
    });
    expect(m!.lastCandidateId).toBe("CHICKEN-003");
  });

  it("옛 저장 범위(scope)는 읽지 않고 버린다 — 부분 저장 개념이 사라졌다", () => {
    const m = migrateSaved({ ...v3, scope: "EVERYTHING" }) as unknown as Record<string, unknown>;
    expect(m.scope).toBeUndefined();
  });

  it("부분 저장이던 옛 저장본의 답변은 있는 그대로 둔다 — 없는 답을 지어내지 않는다", () => {
    // v3 는 알레르기·맵기·형태만 저장했다. 화면이 나머지를 다시 여쭤보면 된다.
    const m = migrateSaved(v3)!;
    expect(Object.keys(m.answers).sort()).toEqual(["allergies", "boneType", "spicyLevel"]);
  });

  it("메뉴 ID 가 문자열이 아니면 버리되 나머지 설정은 살린다", () => {
    const m = migrateSaved({ ...v3, v: 4, lastCandidateId: 123 });
    expect(m!.lastCandidateId).toBeUndefined();
    expect(m!.answers).toEqual(v3.answers);
  });

  it("저장본이 아닌 값에는 throw 하지 않고 null 을 돌려준다", () => {
    for (const bad of [null, undefined, 42, "문자열", [], {}, { answers: "객체가 아님" }]) {
      expect(() => migrateSaved(bad)).not.toThrow();
      expect(migrateSaved(bad)).toBeNull();
    }
  });
});
