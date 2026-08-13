/**
 * QA 1차 TC-XC-04 — 강제 종료 후 다시 열면 QR 관문이 아니라 홈(S02a)부터.
 *
 * QR 연동에 성공한 매장 코드를 기기에 남긴다(localStorage "kb23c-store-v1").
 * 매장 코드는 개인정보가 아니라 **기기의 매장 설정**이므로 저장 정책(무로그인
 * 가이드)과 충돌하지 않고, 홈의 «새로 설정하기» 완전 초기화도 지우지 않는다 —
 * 그 버튼이 지우는 것은 사용자 기록(프로필·세션)이다.
 *
 * flow.tsx 의 첫 화면 판정이 이 값을 본다: 주소의 ?env= 또는 저장된 코드가 있으면
 * 홈, 둘 다 없으면 연동 관문. e2e(qr-url.spec.ts)가 화면 흐름을 재고, 여기서는
 * 저장 자체의 계약을 잰다 — localStorage 는 무엇이든 들어올 수 있고 없을 수도 있는 입구다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORE_KEY, readStoredStoreCode, rememberStoreCode } from "../ui/src/logic";

/** node 환경에는 localStorage 가 없다 — 화면과 같은 표면만 흉내 낸다 */
const mem = new Map<string, string>();
const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  mem.clear();
  g.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
  };
});
afterEach(() => { delete g.localStorage; });

describe("연동한 매장 코드를 기기에 남긴다 (TC-XC-04)", () => {
  it("키는 PO 가 정한 그대로다 — 다른 갈래·문서가 이 이름을 본다", () => {
    expect(STORE_KEY).toBe("kb23c-store-v1");
  });

  it("연동 성공을 기록하면 다음 방문이 그대로 읽는다", () => {
    rememberStoreCode("chicken-store");
    expect(readStoredStoreCode()).toBe("chicken-store");
    expect(mem.get(STORE_KEY)).toBe("chicken-store");
  });

  it("기록이 없으면 빈 문자열 — 그때는 관문부터 시작한다", () => {
    expect(readStoredStoreCode()).toBe("");
  });

  it("빈 코드는 기록하지 않는다 — «연동 성공»이 아닌 것을 성공처럼 남기지 않는다", () => {
    rememberStoreCode("   ");
    expect(readStoredStoreCode()).toBe("");
    expect(mem.has(STORE_KEY)).toBe(false);
  });

  it("저장이 안 되는 환경에서도 죽지 않는다 — 그 방문만 관문부터 간다", () => {
    g.localStorage = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
    };
    expect(() => rememberStoreCode("chicken-store")).not.toThrow();
    expect(readStoredStoreCode()).toBe("");
  });

  it("localStorage 자체가 없는 환경에서도 죽지 않는다", () => {
    delete g.localStorage;
    expect(() => rememberStoreCode("chicken-store")).not.toThrow();
    expect(readStoredStoreCode()).toBe("");
  });
});
