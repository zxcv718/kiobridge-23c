/**
 * 「화면 글씨 맞춰보기」 — 보여준 크기가 곧 적용되는 크기여야 한다.
 *
 * 예전에는 예시를 «지금 크기의 1배·1.4배·1.9배»로 그렸다. 그런데 큰 글씨가 기본으로
 * 켜져 있어 지금 크기가 이미 20px 이었고, 적용할 수 있는 것은 17px 과 20px 뿐이었다.
 * 그래서 38px 짜리 문장을 보고 「잘 보여요」를 눌러도 화면은 그대로였고, 첫 단계에서
 * 「잘 보여요」를 누르면 방금 승인한 것보다 **작아졌다.**
 *
 * 눈으로는 «뭔가 안 바뀌네» 정도로만 보이고 원인을 알 수 없는 종류라, 픽셀로 잰다.
 */
import { expect, test, type Page } from "@playwright/test";
import { openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

const px = (s: string) => Number(s.replace("px", ""));
const 예시크기 = (page: Page) =>
  page.locator(".p-sample").evaluate((el) => getComputedStyle(el).fontSize);
const 화면크기 = (page: Page) =>
  page.locator(".app").evaluate((el) => getComputedStyle(el).fontSize);

async function 문답열기(page: Page): Promise<void> {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  await page.getByRole("button", { name: "화면 글씨 맞춰보기" }).click();
}

test("첫 단계에서 «잘 보여요» → 방금 본 크기가 그대로 적용된다", async ({ page }) => {
  await 문답열기(page);
  const 본크기 = px(await 예시크기(page));
  await page.getByRole("button", { name: "잘 보여요" }).click();
  expect(px(await 화면크기(page)), `${본크기}px 을 보고 골랐는데 화면은 다른 크기입니다`).toBe(본크기);
});

test("둘째 단계에서 «잘 보여요» → 방금 본 크기가 그대로 적용된다", async ({ page }) => {
  await 문답열기(page);
  await page.getByRole("button", { name: "조금 작아요" }).click();
  const 본크기 = px(await 예시크기(page));
  await page.getByRole("button", { name: "잘 보여요" }).click();
  expect(px(await 화면크기(page)), `${본크기}px 을 보고 골랐는데 화면은 다른 크기입니다`).toBe(본크기);
});

test("단계를 넘길수록 예시가 실제로 커진다 — 그리고 커지는 폭이 화면에도 그대로 온다", async ({ page }) => {
  await 문답열기(page);
  const 작은쪽 = px(await 예시크기(page));
  await page.getByRole("button", { name: "조금 작아요" }).click();
  const 큰쪽 = px(await 예시크기(page));
  expect(큰쪽, "다음 단계인데 예시가 커지지 않았습니다").toBeGreaterThan(작은쪽);

  await page.getByRole("button", { name: "잘 보여요" }).click();
  expect(px(await 화면크기(page))).toBe(큰쪽);
});

test("가장 큰 것도 부족하면 — 더 큰 척하지 않고, 대신 정해 버리지도 않는다", async ({ page }) => {
  await 문답열기(page);
  await page.getByRole("button", { name: "조금 작아요" }).click();

  // 마지막 단계에서는 «더 큰 것이 있다»는 인상을 주지 않는다
  await expect(page.getByRole("button", { name: "그래도 작아요" })).toBeVisible();
  await page.getByRole("button", { name: "그래도 작아요" }).click();

  const app = page.locator(".app");
  await expect(app, "가장 큰 글씨를 켜지 않았습니다").toHaveClass(/large/);
  await expect(app, "묻지도 않고 고대비를 켰습니다").not.toHaveClass(/contrast/);
  await expect(app, "묻지도 않고 화면 안내를 켰습니다").not.toHaveClass(/guide/);
  await expect(page.getByText(/다음 단계에서 고대비 화면/)).toBeVisible();
});

test("문답이 정하는 크기는 위 라디오가 정하는 크기와 같은 것이다", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();

  await page.getByRole("button", { name: /기본 크기/ }).click();
  const 라디오기본 = px(await 화면크기(page));
  await page.getByRole("button", { name: /큰 글씨/ }).click();
  const 라디오큰 = px(await 화면크기(page));

  await page.getByRole("button", { name: "화면 글씨 맞춰보기" }).click();
  const 문답첫 = px(await 예시크기(page));
  await page.getByRole("button", { name: "조금 작아요" }).click();
  const 문답둘 = px(await 예시크기(page));

  /* 같은 «글씨 크기»를 두 가지 방법으로 고르게 해 놓고 결과가 다르면, 사용자는 어느
     쪽이 진짜인지 알 수 없다. 두 길이 같은 곳으로 가는지 여기서 못 박는다. */
  expect(문답첫, "문답 1단계와 «기본 크기»가 다릅니다").toBe(라디오기본);
  expect(문답둘, "문답 2단계와 «큰 글씨»가 다릅니다").toBe(라디오큰);
});
