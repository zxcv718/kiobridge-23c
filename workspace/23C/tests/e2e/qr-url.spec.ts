/**
 * 폰 기본 카메라 앱으로 QR 을 찍은 경우 — 주소에 실려 온 매장 코드를 쓴다.
 *
 * iOS 에는 QR 을 해독하는 웹 API 가 없다(BarcodeDetector). 그런데 아이폰 카메라 앱은
 * 이미 해독기이므로, QR 을 링크로 만들면 그 해독기가 우리 대신 읽어 준다. 해독기를
 * 우리가 들고 다니지 않아도 되는 길이다.
 *
 * 다만 **자동으로 연결하지 않는다** — 읽은 것을 보여주고 확인받는다(무로그인 가이드 8번).
 */
import { expect, test, type Page } from "@playwright/test";
import { openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/** 주소를 달고 들어와 QR 걸음까지 간다 */
async function QR까지(page: Page, 주소: string): Promise<void> {
  await page.goto(주소);
  await page.evaluate(() => localStorage.clear());
  await page.goto(주소);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용" }).click();
}

test("주소에 매장 코드가 있으면 카메라 없이도 매장을 맞춰 본다", async ({ page }) => {
  await QR까지(page, "http://localhost:5173/?env=chicken-store");

  await expect(page.getByRole("heading", { name: /연결되었습니다/ })).toBeVisible();
  await expect(page.getByText("chicken-store")).toBeVisible();
  // 어떻게 알았는지를 숨기지 않는다
  await expect(page.getByText(/폰 카메라로 QR을 찍어 열린 주소/)).toBeVisible();
});

test("자동으로 넘어가지 않는다 — 보여주고 확인받는다", async ({ page }) => {
  await QR까지(page, "http://localhost:5173/?env=chicken-store");

  /* 여기서 저절로 다음 화면으로 가면 «자동으로 불러온 정보를 확인받는다»가 깨진다.
     공용 기기에서 앞사람이 남긴 주소일 수도 있다. */
  await expect(page.getByRole("button", { name: "이 매장으로 계속하기" })).toBeVisible();
  await page.getByRole("button", { name: "이 매장으로 계속하기" }).click();
  await expect(page.getByRole("heading", { name: /이제 주문을 시작할게요|이전 주문과 동일하게/ })).toBeVisible();
});

test("다른 매장 코드면 아는 척하지 않는다", async ({ page }) => {
  await QR까지(page, "http://localhost:5173/?env=coffee-shop");
  await expect(page.getByRole("heading", { name: /이 매장 정보는 아직 없습니다/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "이대로 계속하기" })).toBeVisible();
});

test("주소에 아무것도 없으면 예전 그대로 카메라 화면이다", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용" }).click();
  await expect(page.getByRole("heading", { name: /연결되었습니다/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "QR 없이 계속하기" })).toBeVisible();
});
