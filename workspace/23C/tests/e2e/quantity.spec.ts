/**
 * 수량은 «− 1 +» 증감이다 — 디자인 S10(99:1292) 「얼마나 드실 건가요?」.
 *
 * 선택지 버튼 셋(1개·2개·3개)이던 자리다. 계약은 `quantity: integer, minimum 1` 로
 * 상한이 없는데 화면이 셋으로 좁히고 있었다.
 *
 * 스테퍼는 접근성에서 조심해야 하는 물건이라 모양만 맞추고 끝내지 않는다:
 *   ① 표적이 충분히 큰가 (48px 이상)
 *   ② 화면에 보이는 수가 실제로 기록되는 수와 같은가
 *   ③ 아래끝·위끝에서 막다른 길이 되지 않는가
 */
import { expect, test, type Page } from "@playwright/test";
import { enterWizard, openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/** 홈 → 수량 질문(5번째). 앞의 넷은 첫 선택지로 지나간다. */
async function 수량질문까지(page: Page): Promise<void> {
  await openHome(page);
  await enterWizard(page);
  // 알레르기·맵기·형태·이용방식을 첫 선택지로 지나간다 (answerWizard 는 7문항을 다 채운다)
  await page.getByRole("button", { name: "없어요", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.locator(".choices .choice").first().click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await expect(page.locator("#qtitle")).toHaveText(/얼마나 드실 건가요/);
}

const 지금값 = (page: Page) => page.locator(".stepval").innerText();

test("시안대로 «− 값 +» 이고, 선택지 버튼이 아니다", async ({ page }) => {
  await 수량질문까지(page);
  await expect(page.locator(".stepper")).toBeVisible();
  await expect(page.getByRole("button", { name: "1개", exact: true }),
    "수량이 아직 선택지 버튼으로 남아 있습니다").toHaveCount(0);
  expect(await 지금값(page)).toContain("1");
});

test("보이는 수가 곧 기록되는 수다 — 손대지 않아도 넘어갈 수 있다", async ({ page }) => {
  await 수량질문까지(page);
  /* 화면에 «1»이 떠 있는데 «다음»이 꺼져 있으면, 사용자는 무엇이 부족한지 알 수 없다.
     감춰진 기본값이 아니라 눈앞에 보이는 값이므로 그대로 답이 되는 것이 맞다. */
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeEnabled();
});

test("늘리고 줄이면 그대로 따라온다", async ({ page }) => {
  await 수량질문까지(page);
  const 늘리기 = page.getByRole("button", { name: "하나 늘리기" });
  const 줄이기 = page.getByRole("button", { name: "하나 줄이기" });

  await 늘리기.click();
  await 늘리기.click();
  expect(await 지금값(page)).toContain("3");
  await 줄이기.click();
  expect(await 지금값(page)).toContain("2");
});

test("1 아래로는 내려가지 않고, 그 사실을 색 말고도 알린다", async ({ page }) => {
  await 수량질문까지(page);
  const 줄이기 = page.getByRole("button", { name: "하나 줄이기" });
  await expect(줄이기).toBeDisabled();

  const 테두리 = await 줄이기.evaluate((el) => getComputedStyle(el).borderStyle);
  expect(테두리, "더 못 누르는 것을 색으로만 말하고 있습니다").toBe("dashed");
});

test("위끝에서 막다른 길을 만들지 않는다 — 왜 못 누르는지 말하고 길을 준다", async ({ page }) => {
  await 수량질문까지(page);
  const 늘리기 = page.getByRole("button", { name: "하나 늘리기" });
  for (let i = 0; i < 20; i++) {
    if (await 늘리기.isDisabled()) break;
    await 늘리기.click();
  }
  expect(await 지금값(page)).toContain("10");
  await expect(page.locator(".stepnote")).toContainText("매장 직원에게 말씀해 주세요");
});

test("누르는 자리가 48px 이상이고, 낭독기에는 수 입력 하나로 읽힌다", async ({ page }) => {
  await 수량질문까지(page);
  for (const name of ["하나 줄이기", "하나 늘리기"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box!.height, `«${name}» 타깃이 48px 미만입니다`).toBeGreaterThanOrEqual(48);
    expect(box!.width).toBeGreaterThanOrEqual(48);
  }
  const spin = page.getByRole("spinbutton", { name: "수량" });
  await expect(spin).toHaveAttribute("aria-valuenow", "1");
  /* 단위는 화면에도 낭독기에도 붙이지 않는다 — 시안(99:1292)은 주황 숫자 하나만 두고,
     무엇의 수인지는 제목(「얼마나 드실 건가요?」)과 이 입력의 이름이 이미 말한다. */
  await expect(spin).not.toHaveAttribute("aria-valuetext", /.*/);
});

test("키보드 방향키로도 바꿀 수 있다", async ({ page }) => {
  await 수량질문까지(page);
  await page.getByRole("spinbutton", { name: "수량" }).focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  expect(await 지금값(page)).toContain("3");
  await page.keyboard.press("ArrowDown");
  expect(await 지금값(page)).toContain("2");
});
