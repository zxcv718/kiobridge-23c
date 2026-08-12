/**
 * 매장 QR 로 들어온 방문 — 주소에 실려 온 매장 코드를 홈이 확인한다.
 *
 * QR 걸음(S04)은 기획(2026-08-12)으로 흐름에서 빠졌다. QR 은 앱 **밖**에서 폰 기본
 * 카메라로 찍는 행위이고, 찍으면 매장 코드(?env=)가 주소에 실려 **연동 관문을 건너뛴
 * 홈**이 열린다. 코드 없이 열면 관문이 먼저다(lane-b.spec.ts).
 *
 * 다만 **자동으로 진행하지 않는다** — 어느 매장으로 도울지 문장으로 밝히고,
 * 진행은 여느 방문과 같이 «시작하기»가 한다(무로그인 가이드 8번).
 */
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

/** 주소를 달고 홈을 연다 (저장본은 비운다) */
async function 홈으로(page: import("@playwright/test").Page, 주소: string): Promise<void> {
  await page.goto(주소);
  await page.evaluate(() => localStorage.clear());
  await page.goto(주소);
  await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요/ })).toBeVisible();
}

test("주소에 매장 코드가 있으면 홈이 어느 매장인지 밝힌다", async ({ page }) => {
  await 홈으로(page, "http://localhost:5173/?env=chicken-store");

  const 배너 = page.getByRole("status");
  await expect(배너).toContainText("매장 QR로 들어오셨어요");
  await expect(배너).toContainText("닭강정 가게");
});

test("자동으로 넘어가지 않는다 — 진행은 시작하기가 한다", async ({ page }) => {
  await 홈으로(page, "http://localhost:5173/?env=chicken-store");

  /* 여기서 저절로 다음 화면으로 가면 «자동으로 불러온 정보를 확인받는다»가 깨진다.
     공용 기기에서 앞사람이 남긴 주소일 수도 있다. */
  await expect(page.getByRole("button", { name: "시작하기" })).toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByRole("heading", { name: "더 읽기 편한 크기를 선택해주세요" })).toBeVisible();
});

test("다른 매장 코드면 아는 척하지 않는다", async ({ page }) => {
  await 홈으로(page, "http://localhost:5173/?env=coffee-shop");

  const 배너 = page.getByRole("status");
  await expect(배너).toContainText("아직 없습니다");
  await expect(배너).toContainText("coffee-shop");   // 무엇을 읽었는지 밝힌다
  await expect(배너).toContainText("닭강정 가게");    // 그래도 막다른 길이 아니다
});

test("주소에 아무것도 없으면 연동 관문이 먼저 나온다 — 홈에는 배너가 없다", async ({ page }) => {
  await page.goto("http://localhost:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // 헤드리스에는 카메라가 없어 제목이 «읽을 수 없습니다»로 바뀔 수 있다 — 어느 쪽이든 관문이다
  await expect(page.getByRole("heading", { name: /매장 QR|QR을 읽을 수 없습니다/ })).toBeVisible();
  await page.getByRole("button", { name: /QR 없이 계속하기/ }).click();
  await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요/ })).toBeVisible();
  await expect(page.getByText(/매장 QR로 들어오셨어요/)).toHaveCount(0);
});
