/**
 * 시연용 QR 에 무엇을 담아야 하는가 — 실제 파서로 확인한다.
 *
 * QR 은 한 번 인쇄하면 시연 도중에 못 고친다. «아마 될 것»으로 두지 않고,
 * 화면이 쓰는 바로 그 함수에 넣어 본다.
 */
import { describe, expect, it } from "vitest";
import { parseStoreCode } from "../ui/src/logic";

const ENV = "chicken-store";

describe("시연용 QR 내용", () => {
  it("URL 형태로 담아도 매장 코드를 뽑아낸다", () => {
    expect(parseStoreCode(`https://kiobridge-23c-demo.vercel.app/?env=${ENV}`)).toBe(ENV);
    expect(parseStoreCode(`https://kiobridge-23c-demo.vercel.app/?environmentId=${ENV}`)).toBe(ENV);
  });

  it("코드만 담아도 된다", () => {
    expect(parseStoreCode(ENV)).toBe(ENV);
  });

  it("파라미터를 빠뜨린 URL 은 매장 코드가 아니다 — 조용히 통과시키지 않는다", () => {
    // 마지막 경로 조각도 없으면 호스트명이 남는다. 그건 chicken-store 가 아니므로
    // 화면은 «다른 매장의 코드»로 판정하고 멈춘다. 이게 맞다 — 틀린 QR 을 맞다고
    // 하면 시연에서 «연결됐다»고 말해 놓고 실제로는 아무것도 맞춰 보지 않은 게 된다.
    expect(parseStoreCode("https://kiobridge-23c-demo.vercel.app/")).not.toBe(ENV);
  });
});
