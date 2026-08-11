/**
 * 「화면 안내」가 시안이 적은 그 일을 하는가 (Figma 150:509).
 *
 * 시안의 설명은 «다음에 누를 버튼을 테두리와 화살표로 강조해서 알려드려요»다.
 * 우리는 그 자리에 오랫동안 다른 기능(«선택지에 그림 병기»)을 넣어 두었고, 시안에 적힌
 * 기능은 만들지 않았다. 그러면 화면이 제 설명과 다른 말을 하게 된다 — 설정 이름을 읽고
 * 켠 사람이 기대한 것이 나오지 않는다는 뜻이고, 이 서비스에서는 그게 가장 큰 결함이다.
 *
 * 그래서 두 가지를 못 박는다:
 *  ① 켜면 실제로 아래 주 버튼이 강조된다 (테두리 + 화살표)
 *  ② 선택지 그림은 이 설정과 **무관하게 늘 있다** — 시안에서 그림은 토글 대상이 아니다
 */
import { expect, test, type Page } from "@playwright/test";
import { openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/** 프로필 3/3 까지 가서 「안내 켜짐」을 고르고, 질문 화면 직전까지 간다. */
async function 안내켜고(page: Page, 켤까: boolean): Promise<void> {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  if (켤까) await page.getByRole("button", { name: "안내 켜짐" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용" }).click();
  await page.getByRole("button", { name: "QR 없이 계속하기" }).click();
  await page.getByRole("button", { name: /^(주문 시작하기|아니오)$/ }).click();
  await expect(page.locator("#qtitle")).toBeVisible();
}

/** 아래 버튼바에 화살표가 실제로 «보이는가» — 자리는 늘 있으므로 투명도로 잰다. */
const 화살표보임 = (page: Page) =>
  page.locator(".kb-actions").evaluate((el) => {
    const s = getComputedStyle(el, "::after");
    return s.content !== "none" && Number(s.opacity) > 0.5;
  });

test("안내를 켜면 다음 버튼이 테두리와 화살표로 강조된다", async ({ page }) => {
  await 안내켜고(page, true);
  await expect(page.locator(".app")).toHaveClass(/guide/);

  // 답을 고르기 전에는 «다음»을 누를 수 없으므로 가리키지 않는다
  expect(await 화살표보임(page), "누를 수 없는 버튼을 다음에 누를 버튼이라고 가리킵니다").toBe(false);

  await page.getByRole("button", { name: "없어요", exact: true }).click();
  expect(await 화살표보임(page), "안내를 켰는데 화살표가 없습니다").toBe(true);

  /* 테두리 — 시안의 «테두리»에 해당하는 고리다. 초점 테두리(outline)와 다른 수단을 쓰는
     이유는 같은 자리에 겹치면 «지금 초점이 어디인가»가 안내에 묻히기 때문이다. */
  const 고리 = await page.getByRole("button", { name: "다음", exact: true })
    .evaluate((el) => getComputedStyle(el).boxShadow);
  expect(고리, "다음 버튼에 강조 테두리가 없습니다").toMatch(/0px 0px 0px 7px|0 0 0 7px/);
});

test("안내를 끄면 강조가 없다 — 켜지도 않은 것이 화면에 나오지 않는다", async ({ page }) => {
  await 안내켜고(page, false);
  await expect(page.locator(".app")).not.toHaveClass(/guide/);
  await page.getByRole("button", { name: "없어요", exact: true }).click();
  expect(await 화살표보임(page), "묻지도 않고 안내를 켰습니다").toBe(false);
});

test("선택지 그림은 안내를 끄든 켜든 늘 있다 — 시안에서 그림은 토글 대상이 아니다", async ({ page }) => {
  for (const 켤까 of [false, true]) {
    await 안내켜고(page, 켤까);
    const 그림 = await page.locator(".q-choices .choice .ico").count();
    expect(그림, `안내 ${켤까 ? "켬" : "끔"} 에서 선택지 그림이 사라졌습니다`).toBeGreaterThan(0);
  }
});
