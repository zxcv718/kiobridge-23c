/**
 * 기기 저장본 마이그레이션 검사.
 *
 * 저장 형식을 바꿀 때 기존 사용자의 설정이 조용히 사라지면 안 된다.
 * guide.txt §5 의 기기 저장 요건("저장된 내용 확인·수정·삭제")은 저장본이 살아 있어야 성립한다.
 */
import { describe, expect, it } from "vitest";
import {
  migrateProfile, migrateSaved, migrateSession, splitSaved,
  PROFILE_VERSION, SAVED_VERSION, SESSION_VERSION,
} from "../src/core/saved";

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

/* ───────── 프로필·세션 분리 (QA 1차 — 2026-08-13) ─────────
 *
 * 프로필(화면 설정)과 세션(답변·확정 메뉴)은 저장·삭제가 따로 논다.
 * 한 덩어리였던 옛 저장본(v3/v4)은 읽는 순간 둘로 쪼개 옮긴다 — 어느 쪽도 잃지 않는다. */

const combined = {
  v: 4,
  answers: { allergies: ["땅콩"], spicyLevel: "매운맛", boneType: "순살" },
  a11y: { largeText: true, highContrast: false },
  savedAt: "2026-08-08T10:00:00.000Z",
  lastCandidateId: "CHICKEN-001",
};

describe("옛 통합 저장본을 둘로 쪼갠다", () => {
  it("화면 설정은 프로필로, 답변·확정 메뉴는 세션으로 간다", () => {
    const { profile, session } = splitSaved(migrateSaved(combined)!);
    expect(profile).not.toBeNull();
    expect(profile.a11y).toEqual(combined.a11y);
    expect(profile.savedAt).toBe(combined.savedAt);
    expect(session).not.toBeNull();
    expect(session!.answers).toEqual(combined.answers);
    expect(session!.lastCandidateId).toBe("CHICKEN-001");
    expect(session!.savedAt).toBe(combined.savedAt);
  });

  it("답변이 비어 있으면 세션은 만들지 않는다 — 없는 기록을 지어내지 않는다", () => {
    const { profile, session } = splitSaved(migrateSaved({ ...combined, answers: {}, lastCandidateId: undefined })!);
    expect(profile.a11y).toEqual(combined.a11y);
    expect(session).toBeNull();
  });
});

describe("프로필 저장본 해석", () => {
  it("정상 저장본은 그대로 살아난다", () => {
    const m = migrateProfile({ v: PROFILE_VERSION, a11y: { largeText: true }, savedAt: "2026-08-13T00:00:00.000Z" });
    expect(m).not.toBeNull();
    expect(m!.a11y).toEqual({ largeText: true });
    expect(m!.v).toBe(PROFILE_VERSION);
  });

  it("저장본이 아닌 값에는 throw 하지 않고 null 을 돌려준다", () => {
    for (const bad of [null, undefined, 42, "문자열", [], {}, { a11y: "객체가 아님" }]) {
      expect(() => migrateProfile(bad)).not.toThrow();
      expect(migrateProfile(bad)).toBeNull();
    }
  });
});

describe("세션 저장본 해석", () => {
  it("정상 저장본은 답변과 확정 메뉴가 그대로 살아난다", () => {
    const m = migrateSession({
      v: SESSION_VERSION, answers: combined.answers,
      savedAt: "2026-08-13T00:00:00.000Z", lastCandidateId: "CHICKEN-003",
    });
    expect(m).not.toBeNull();
    expect(m!.answers).toEqual(combined.answers);
    expect(m!.lastCandidateId).toBe("CHICKEN-003");
    expect(m!.v).toBe(SESSION_VERSION);
  });

  it("메뉴 ID 가 문자열이 아니면 버리되 답변은 살린다", () => {
    const m = migrateSession({ v: SESSION_VERSION, answers: combined.answers, savedAt: "", lastCandidateId: 123 });
    expect(m!.lastCandidateId).toBeUndefined();
    expect(m!.answers).toEqual(combined.answers);
  });

  it("저장본이 아닌 값에는 throw 하지 않고 null 을 돌려준다", () => {
    for (const bad of [null, undefined, 42, "문자열", [], {}, { answers: "객체가 아님" }]) {
      expect(() => migrateSession(bad)).not.toThrow();
      expect(migrateSession(bad)).toBeNull();
    }
  });
});
