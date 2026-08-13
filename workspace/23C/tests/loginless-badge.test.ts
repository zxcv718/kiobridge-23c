/**
 * QA 1차 TC-CP-13 — 「무로그인 · 이 기기에만 임시 저장됨」 배지.
 *
 * 무로그인 가이드가 요구하는 «저장 방식의 고지»가 화면 글자로 없었다. 자리는 홈의
 * «저장된 내용 보기» 접힘 본문, 저장 기록 카드 **위**다(PO 확정 2026-08-13) —
 * 「설정 > 프로필 관리」를 새로 만들지 않고 조회·수정·삭제의 자리(시안 구조)를 지킨다.
 *
 * 실제 렌더링(펼침 → 배지 보임)은 e2e(loginless.spec.ts 4번)가 재고, 여기서는
 * a11y.test.ts 와 같은 문법으로 소스에 그 문구가 그 자리에 있는지를 못 박는다 —
 * 문구를 지우거나 카드 아래로 내리면 여기서 걸린다.
 */
import { describe, expect, it } from "vitest";
import { uiSources } from "./ui-source";

describe("무로그인 배지 (TC-CP-13)", () => {
  const home = uiSources().find((f) => f.name === "screens/Home.tsx");

  it("홈의 저장된 내용 본문에 배지 문구가 있다", () => {
    expect(home, "screens/Home.tsx 를 찾지 못했습니다").toBeDefined();
    expect(home!.text).toContain("무로그인 · 이 기기에만 임시 저장됨");
  });

  it("배지는 저장 기록 카드보다 위에 선다 — 내용보다 성격이 먼저다", () => {
    const 배지 = home!.text.indexOf("무로그인 · 이 기기에만 임시 저장됨");
    const 카드 = home!.text.indexOf("이 기기에 저장된 기록");
    expect(배지, "배지 문구가 없습니다").toBeGreaterThanOrEqual(0);
    expect(카드, "저장 기록 카드가 없습니다").toBeGreaterThanOrEqual(0);
    expect(배지, "배지가 카드 아래에 있습니다").toBeLessThan(카드);
  });
});
