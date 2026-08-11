/**
 * 저장본을 잃지 않는다 — 그리고 두 버튼이 하는 일을 헷갈리지 않게 못 박는다.
 *
 * 「이 기록 지우기」와 「새로 설정하기」가 같은 일을 한다고 읽힌 적이 있다.
 * 실제로는 다르다: 앞의 것은 그 자리에서 지우고, 뒤의 것은 지우지 않고 화면만 옮긴다.
 * 둘이 같아 보인다는 것은 화면이 그렇게 말하고 있다는 뜻이므로, 무엇이 다른지를
 * 검사로 남긴다 — 나중에 누가 하나를 없애려 할 때 여기서 걸린다.
 *
 * 그 확인 과정에서 데이터 손실 하나가 드러났다. S03 에서 「이 기기에 저장하기」를
 * 고르는 순간 지난번 답변이 빈 값으로 덮이고 있었다. **저장을 고른 사람이 잃는다.**
 */
import { expect, test, type Page } from "@playwright/test";
import { 아무거나답하고다음, 저장된내용펼치기, HOME, approveToCartReview, enterWizard, finishOrder, openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/** «새로 설정하기» → 되묻기 확인까지. 지우기는 되돌릴 수 없어 한 번 되묻는다. */
async function 새로시작(page: Page): Promise<void> {
  await page.getByRole("button", { name: "새로 설정하기" }).click();
  await page.getByRole("button", { name: /네, 지우고 새로 시작할게요/ }).click();
}

const 저장본 = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("kb23c-saved-settings-v4");
    return raw ? (JSON.parse(raw) as { answers?: Record<string, unknown> }) : null;
  });

/** 저장하기를 고르고 주문을 끝까지 마쳐 저장본을 만든 뒤 홈으로 돌아온다 */
async function 저장본만들기(page: Page): Promise<void> {
  await openHome(page);
  await enterWizard(page, true);
  for (let i = 0; i < 7; i++) {
    if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
    await 아무거나답하고다음(page);
  }
  await approveToCartReview(page);
  await finishOrder(page);
  await page.goto(HOME);
  await expect(page.getByRole("heading", { name: /다시 오셨네요/ })).toBeVisible();
  expect((await 저장본(page))?.answers?.allergies, "저장본이 만들어지지 않았습니다").toBeDefined();
}

test("«새로 설정하기»는 이름 그대로 지운다 — 그리고 지웠다고 알린다", async ({ page }) => {
  await 저장본만들기(page);
  /* 한때 이 버튼은 지우지 않고 화면만 옮겼고, 지우기는 따로 한 장 더 있었다. 두 버튼이
     같은 뜻으로 읽힌다는 지적이 맞았다 — 이름이 하는 말과 코드가 하는 일이 달랐다. */
  await 새로시작(page);

  expect(await 저장본(page), "«새로 설정»인데 지난 기록이 남아 있습니다").toBeNull();
  // 무로그인 가이드 6번 — 지웠다고 알려줘야 한다. 화면이 바뀐 것으로 추측하게 두지 않는다.
  await expect(page.getByRole("status")).toContainText("지웠습니다");
});

test("되돌릴 수 없는 일이므로 한 번 되묻고, 아니라고 하면 그대로 둔다", async ({ page }) => {
  await 저장본만들기(page);
  const 원래 = await 저장본(page);

  await page.getByRole("button", { name: "새로 설정하기" }).click();
  /* 되묻는 자리에서만 이유를 말한다. 평소에 경고를 깔아 두면 지울 생각이 없는 사람까지
     매번 읽고, 정작 지우는 순간에는 새로울 것이 없어 그냥 지나친다. */
  await expect(page.getByRole("alert")).toContainText("되돌릴 수 없습니다");

  // 되돌릴 수 없는 쪽이 주 버튼이면 안 된다 — 습관적으로 첫 버튼을 누르는 사람이 있다
  const 아래 = await page.locator(".kb-actions button").allInnerTexts();
  expect(아래[0], "삭제가 첫 버튼입니다").toMatch(/아니요/);

  await page.getByRole("button", { name: /아니요/ }).click();
  expect(await 저장본(page), "«아니요»라고 했는데 지워졌습니다").toEqual(원래);
  await expect(page.getByRole("button", { name: "새로 설정하기" })).toBeVisible();
});

test("저장된 내용을 지우지 않고 고칠 수 있다 — 가이드 4번의 «수정»", async ({ page }) => {
  await 저장본만들기(page);
  const 원래 = (await 저장본(page))!.answers!;

  await 저장된내용펼치기(page);
  await page.getByRole("button", { name: /저장된 내용 수정/ }).click();
  await expect(page.getByRole("heading", { name: /어떤 항목을 수정하고 싶으신가요/ })).toBeVisible();

  // 고치러 왔는데 절반이 숨어 있으면 안 된다 — 일곱 항목이 전부 있어야 한다
  const 행 = await page.locator(".editrow .editlabel").allInnerTexts();
  expect(행.length, `수정 화면에 항목이 ${행.length}개뿐입니다`).toBeGreaterThanOrEqual(7);

  // 여는 것만으로는 아무것도 지워지지 않는다
  expect((await 저장본(page))!.answers).toEqual(원래);

  // 뒤로는 홈으로 — 추천을 받은 적이 없으므로 빈 추천 화면에 떨어지면 안 된다
  await page.getByRole("button", { name: /뒤로/ }).click();
  await expect(page.getByRole("heading", { name: /다시 오셨네요/ })).toBeVisible();
});

test("저장된 내용은 일부가 아니라 전부 보인다 — 가이드 4번의 «조회»", async ({ page }) => {
  await 저장본만들기(page);
  const 저장된답변 = Object.keys((await 저장본(page))!.answers!);
  await 저장된내용펼치기(page);
  const 보이는줄 = await page.locator(".kb-row .kb-rowlabel").allInnerTexts();
  /* 한때 알레르기와 맵기 둘만 보여줬다. 나머지 다섯은 저장되는데 확인할 방법이 없었고,
     어느 둘을 보여줄지 우리가 골랐던 것이다. */
  expect(보이는줄.length, `답변 ${저장된답변.length}개를 저장하면서 ${보이는줄.length}줄만 보여줍니다`)
    .toBeGreaterThanOrEqual(저장된답변.length);
});

test("«이번만 사용하기»는 지운다 — 그것이 사용자가 고른 뜻이다", async ({ page }) => {
  await 저장본만들기(page);
  await 새로시작(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용하기" }).click();
  expect(await 저장본(page), "«이번만 사용»인데 기기에 남아 있습니다").toBeNull();
});
