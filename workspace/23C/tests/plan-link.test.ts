/**
 * 주문 계획 URL 인계 — 계약 조건 검사.
 *
 * 이 파일의 테스트는 UX 취향이 아니라 **계약 조건**이다. 서버가 없으므로 모바일에서 확정한
 * 주문 계획을 URL(또는 QR)에 실어 매장 키오스크로 넘긴다. 이 통로가 지켜야 할 두 가지는:
 *   ① 개인정보가 실릴 자리가 아예 없어야 한다 (링크는 캡처·로그·화면 너머로 새어나갈 수 있다)
 *   ② 사용자가 손상되었거나 오래된 링크를 열어도 화면이 절대 죽지 않아야 한다
 * 둘 다 타입만으로는 강제되지 않으므로(런타임에 임의의 문자열이 들어온다) 이 테스트가
 * 유일한 방어선이다.
 */
import { describe, expect, it } from "vitest";
import { encodePlanLink, decodePlanLink, type PlanLinkPayload } from "../src/core/plan-link";

/** 실제 마법사 7문항 + 접근성 8플래그 — ui/src/App.tsx DEMO_SCENARIOS 와 같은 형식. */
const FULL_ANSWERS = {
  serviceType: "포장",
  spicyLevel: "매운맛",
  boneType: "순살",
  cupOption: "종이컵",
  quantity: 2,
  allergies: ["땅콩", "계란"],
  budgetKrw: 10000,
};
const FULL_A11Y = {
  largeText: true,
  simpleSteps: true,
  visualGuidance: false,
  hearingSupport: false,
  mobilitySupport: false,
  highContrast: false,
  staffAssistancePreferred: false,
  preferredInput: "TOUCH",
};
const FULL_PAYLOAD: PlanLinkPayload = { v: 1, answers: FULL_ANSWERS, a11y: FULL_A11Y };

/**
 * 테스트 전용 — "구조가 손상된 링크"를 인위적으로 만들 때만 쓴다(예: 다른 버전, 최상위가 배열).
 * ASCII 문자열만 다루므로 btoa 로 충분하다. 모듈 본체는 한국어(비 ASCII)를 다뤄야 해서
 * TextEncoder 기반 직접 구현을 쓰지만, 여기서는 실제 코덱 로직을 재구현하지 않기 위해
 * 별도로 base64url 변환만 맞춰 준다.
 */
function fakeEncode(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("encodePlanLink/decodePlanLink — 라운드트립", () => {
  it("답변 7문항 + 접근성 8플래그를 그대로 복원한다", () => {
    const encoded = encodePlanLink(FULL_PAYLOAD);
    expect(decodePlanLink(encoded)).toEqual(FULL_PAYLOAD);
  });

  it("한국어가 든 답변(맵기·형태·알레르기 라벨)이 깨지지 않고 왕복한다", () => {
    const payload: PlanLinkPayload = {
      v: 1,
      answers: { spicyLevel: "매운맛", boneType: "순살", allergies: ["새우", "계란"] },
      a11y: { largeText: true },
    };
    const decoded = decodePlanLink(encodePlanLink(payload));
    expect(decoded?.answers.spicyLevel).toBe("매운맛");
    expect(decoded?.answers.boneType).toBe("순살");
    expect(decoded?.answers.allergies).toEqual(["새우", "계란"]);
  });

  it("빈 payload(답변을 하나도 안 한 상태)도 왕복한다", () => {
    const payload: PlanLinkPayload = { v: 1, answers: {}, a11y: {} };
    expect(decodePlanLink(encodePlanLink(payload))).toEqual(payload);
  });
});

describe("encodePlanLink — 개인정보 화이트리스트", () => {
  it("answers 에 섞여 들어온 이름·전화번호·주소는 인코딩 결과에 없다", () => {
    const withPii = {
      ...FULL_ANSWERS,
      name: "홍길동",
      phone: "010-1234-5678",
      address: "서울시 강남구 ...",
    };
    const encoded = encodePlanLink({ v: 1, answers: withPii, a11y: FULL_A11Y } as PlanLinkPayload);

    // 링크 자체(디코딩 없이 문자열로도)에 개인정보 원문이 실리지 않는다.
    expect(encoded).not.toContain("홍길동");

    const decoded = decodePlanLink(encoded);
    expect(decoded?.answers).toEqual(FULL_ANSWERS); // 화이트키만 남고 나머지는 사라짐
    expect(decoded?.answers).not.toHaveProperty("name");
    expect(decoded?.answers).not.toHaveProperty("phone");
    expect(decoded?.answers).not.toHaveProperty("address");
  });

  it("a11y 에 섞여 들어온 임의의 키(예: customerName)도 버려진다", () => {
    const withExtra = { ...FULL_A11Y, customerName: "홍길동" };
    const decoded = decodePlanLink(
      encodePlanLink({ v: 1, answers: {}, a11y: withExtra } as unknown as PlanLinkPayload),
    );
    expect(decoded?.a11y).toEqual(FULL_A11Y);
    expect(decoded?.a11y).not.toHaveProperty("customerName");
  });

  it("a11y.preferredInput 이 알려진 값이 아니면 버려진다 (임의 문자열 주입 방지)", () => {
    const decoded = decodePlanLink(
      encodePlanLink({ v: 1, answers: {}, a11y: { preferredInput: "<script>" } } as PlanLinkPayload),
    );
    expect(decoded?.a11y).not.toHaveProperty("preferredInput");
  });

  it("a11y 의 불리언 자리에 문자열이 들어와도(타입 위반) 통과시키지 않는다", () => {
    const decoded = decodePlanLink(
      encodePlanLink({ v: 1, answers: {}, a11y: { largeText: "yes" } } as unknown as PlanLinkPayload),
    );
    expect(decoded?.a11y).not.toHaveProperty("largeText");
  });
});

describe("decodePlanLink — 깨진 입력에도 절대 throw 하지 않는다", () => {
  it("빈 문자열 → null", () => {
    expect(() => decodePlanLink("")).not.toThrow();
    expect(decodePlanLink("")).toBeNull();
  });

  it("base64 가 아닌 문자열 → null", () => {
    const broken = "!!!not-base64!!!";
    expect(() => decodePlanLink(broken)).not.toThrow();
    expect(decodePlanLink(broken)).toBeNull();
  });

  it("길이가 base64 로 불가능한 문자열(4로 나눈 나머지가 1) → null", () => {
    const broken = "A"; // 1글자 — 유효한 base64url 길이가 아니다
    expect(() => decodePlanLink(broken)).not.toThrow();
    expect(decodePlanLink(broken)).toBeNull();
  });

  it("유효한 base64url 이지만 내용이 JSON 이 아님 → null", () => {
    const notJson = "aGVsbG8"; // "hello" 를 base64url 로 인코딩한 것 — 유효한 base64, JSON 아님
    expect(() => decodePlanLink(notJson)).not.toThrow();
    expect(decodePlanLink(notJson)).toBeNull();
  });

  it("스키마 버전이 다름(v:2) → null", () => {
    const futureVersion = fakeEncode({ v: 2, answers: {}, a11y: {} });
    expect(() => decodePlanLink(futureVersion)).not.toThrow();
    expect(decodePlanLink(futureVersion)).toBeNull();
  });

  it("최상위가 배열 → null", () => {
    const arr = fakeEncode(["v", 1, "answers"]);
    expect(() => decodePlanLink(arr)).not.toThrow();
    expect(decodePlanLink(arr)).toBeNull();
  });

  it("최상위가 문자열 → null", () => {
    // fakeEncode 는 btoa 기반(ASCII 전용)이라 여기서는 ASCII 문자열로 검사한다.
    const str = fakeEncode("just a string");
    expect(() => decodePlanLink(str)).not.toThrow();
    expect(decodePlanLink(str)).toBeNull();
  });

  it("answers/a11y 필드가 아예 없음 → null", () => {
    const missing = fakeEncode({ v: 1 });
    expect(() => decodePlanLink(missing)).not.toThrow();
    expect(decodePlanLink(missing)).toBeNull();
  });
});

describe("encodePlanLink — URL-safe 출력", () => {
  it("결과 문자열에 URL 예약 문자(+ / = ? # &)가 없다", () => {
    const encoded = encodePlanLink(FULL_PAYLOAD);
    expect(encoded).not.toMatch(/[+/=?#&]/);
  });

  it("encodeURIComponent 없이도 쿼리스트링에 그대로 실을 수 있다(왕복 결과가 같다)", () => {
    const encoded = encodePlanLink(FULL_PAYLOAD);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });
});

describe("encodePlanLink — 길이", () => {
  it("실제 7문항 답변 + 접근성 8플래그를 인코딩해도 2000자 미만이다 (QR 용량 고려)", () => {
    const encoded = encodePlanLink(FULL_PAYLOAD);
    expect(encoded.length).toBeLessThan(2000);
  });
});
