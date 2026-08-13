/**
 * 알레르기 질문 둘째 걸음(항목 목록)의 선택지 (QA 1차 TC-CM-01 · PO 확정 2026-08-13).
 *
 * 안전 중단(S12)은 알레르기 «미확인»(UNKNOWN)일 때 열리는데, 「잘 모르겠어요」가
 * 화면에 없으면 사용자가 그 상태를 만들 수 없다 — 모르는 사람이 «있어요/없어요» 중
 * 하나를 지어내야 했다. 그래서 목록 걸음에 「잘 모르겠어요」를 더한다.
 * 첫 걸음(타일 두 장)은 시안 99:1228 그대로 두고 **목록에만** 더한다.
 */
import { describe, it, expect } from "vitest";
import { ALLERGY_ITEMS, ALLERGY_UNKNOWN_VALUE, allergyListOptions } from "../ui/src/model";

describe("알레르기 목록 걸음의 선택지", () => {
  it("6종 + 「잘 모르겠어요」 — 값은 기존 ALLERGY_UNKNOWN_VALUE 그대로다", () => {
    const options = allergyListOptions();
    expect(options.map((o) => o.value)).toEqual([...ALLERGY_ITEMS, ALLERGY_UNKNOWN_VALUE]);
    expect(options.find((o) => o.value === ALLERGY_UNKNOWN_VALUE)?.label).toBe("잘 모르겠어요");
  });

  it("「없어요」는 목록에 없다 — 첫 걸음(타일)의 답이다", () => {
    expect(allergyListOptions().map((o) => o.value)).not.toContain("없음");
  });
});
