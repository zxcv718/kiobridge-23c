/**
 * 알레르기는 두 걸음이다 — 디자인 S06 기본(99:1228) / 확장(99:1246).
 *
 * 한 화면에 「없어요 + 6종 + 잘 모르겠어요」를 늘어놓았던 것을 시안대로 되돌렸다.
 * 여기서 지키는 것은 «시안과 같아 보이는가»가 아니라 다음 셋이다:
 *   ① 알레르기가 없는 사람은 항목 목록을 아예 보지 않는다
 *   ② 확실하지 않은 사람이 「있어요/없어요」 중 하나를 억지로 고르게 되지 않는다
 *   ③ 항목을 하나도 안 고른 채로는 넘어가지 못한다 (빈 답 ≠ 알레르기 없음)
 */
import { expect, test, type Page } from "@playwright/test";
import { openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/** 홈 → 첫 질문(알레르기)까지. 화면 설정은 기본값 그대로 지나간다. */
async function 알레르기질문까지(page: Page): Promise<void> {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용하기" }).click();
  await page.getByRole("button", { name: "QR 없이 계속하기" }).click();
  await page.getByRole("button", { name: /^(주문 시작하기|아니오, 새로 고를게요)$/ }).click();
  await expect(page.locator("#qtitle")).toHaveText(/알레르기가 있으신가요/);
}

test("첫 걸음은 있는지만 묻는다 — 항목 목록을 보여주지 않는다", async ({ page }) => {
  await 알레르기질문까지(page);

  await expect(page.getByRole("button", { name: "없어요", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "있어요", exact: true })).toBeVisible();
  for (const 항목 of ["땅콩", "우유", "계란", "밀", "새우"]) {
    await expect(page.getByRole("button", { name: 항목, exact: true }),
      `«${항목}»이 첫 걸음에 보이면 안 됩니다`).toHaveCount(0);
  }
});

test("«없어요»를 고르면 목록을 거치지 않고 다음 질문으로 간다", async ({ page }) => {
  await 알레르기질문까지(page);
  await page.getByRole("button", { name: "없어요", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("#qtitle")).toHaveText(/맵기/);
});

test("«있어요»를 고르면 6종 목록이 펼쳐지고, 하나도 안 고르면 넘어가지 못한다", async ({ page }) => {
  await 알레르기질문까지(page);
  await page.getByRole("button", { name: "있어요", exact: true }).click();

  await expect(page.getByText("보유하신 알레르기를 모두 선택해 주세요")).toBeVisible();
  for (const 항목 of ["땅콩", "콩(대두)", "우유", "계란", "밀", "새우"]) {
    await expect(page.getByRole("button", { name: 항목, exact: true })).toBeVisible();
  }
  // 첫 걸음의 답은 목록에 섞이지 않는다
  await expect(page.getByRole("button", { name: "없어요", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "잘 모르겠어요", exact: true })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "다음", exact: true }),
    "아무것도 안 골랐는데 넘어갈 수 있으면, 빈 답이 «알레르기 없음»과 구별되지 않습니다").toBeDisabled();

  await page.getByRole("button", { name: "새우", exact: true }).click();
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeEnabled();
});

test("목록에서 뒤로 가면 질문을 벗어나지 않고 «있으신가요?»로 돌아온다", async ({ page }) => {
  await 알레르기질문까지(page);
  await page.getByRole("button", { name: "있어요", exact: true }).click();
  await expect(page.getByText("보유하신 알레르기를 모두 선택해 주세요")).toBeVisible();

  await page.getByRole("button", { name: /뒤로|이전/ }).first().click();
  await expect(page.locator("#qtitle")).toHaveText(/알레르기가 있으신가요/);
  await expect(page.getByRole("button", { name: "있어요", exact: true })).toBeVisible();
});

test("«잘 모르겠어요»는 첫 걸음에 있고, 고르면 안전 확인으로 이어진다", async ({ page }) => {
  await 알레르기질문까지(page);
  const 모름 = page.getByRole("button", { name: /잘 모르겠어요/ });
  await expect(모름, "확실하지 않은 사람에게 둘 중 하나를 강요하면 안 됩니다").toBeVisible();

  await 모름.click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("#qtitle")).toHaveText(/맵기/);
});
