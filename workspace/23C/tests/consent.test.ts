/**
 * 동의 매핑 — docs/LOGINLESS_QR_PROFILE_GUIDE.md 7번의 표를 그대로 지킨다.
 *
 * | 사용자 선택 | retentionPolicy      | personalization |
 * | 이번만 사용 | SESSION_ONLY         | false           |
 * | 기기에 저장 | UNTIL_USER_DELETES   | true            |
 *
 * personalization 을 늘 true 로 두었던 자리다. 스키마가 boolean 이라고만 해서 계약
 * 위반은 아니었고, 그래서 **아무 검사도 걸리지 않았다.** 문서와 다른 값을 내보내면서도
 * 초록불이었다는 뜻이다. 계약이 안 잡는 것은 문서가 잡고, 문서가 말한 것은 검사가 잡는다.
 */
import { describe, expect, it } from "vitest";
import { buildProfile } from "../src/core/canonical";

const 답변 = { allergies: ["없음"], spicyLevel: "매운맛", language: "ko-KR", _collectedVia: "WEB_FORM" };

describe("저장 선택이 동의로 옮겨진다", () => {
  it("«이번만 사용»이면 SESSION_ONLY 이고 개인화 동의도 아니다", () => {
    const p = buildProfile({ ...답변, storeProfile: false });
    expect(p.consent.retentionPolicy).toBe("SESSION_ONLY");
    expect(p.consent.personalization).toBe(false);
  });

  it("«기기에 저장»이면 UNTIL_USER_DELETES 이고 개인화 동의다", () => {
    const p = buildProfile({ ...답변, storeProfile: true });
    expect(p.consent.retentionPolicy).toBe("UNTIL_USER_DELETES");
    expect(p.consent.personalization).toBe(true);
  });

  it("저장 여부를 말하지 않으면 «이번만 사용»으로 본다 — 저장은 명시적 선택이다", () => {
    const p = buildProfile({ ...답변 });
    expect(p.consent.retentionPolicy).toBe("SESSION_ONLY");
    expect(p.consent.personalization).toBe(false);
  });

  it("두 값은 늘 같이 움직인다 — 남기지 않는데 남겨서 하는 개인화는 없다", () => {
    for (const store of [true, false]) {
      const c = buildProfile({ ...답변, storeProfile: store }).consent;
      expect(c.personalization, `storeProfile=${store}`)
        .toBe(c.retentionPolicy === "UNTIL_USER_DELETES");
    }
  });
});
