/**
 * 키보드 완주 · 확대 · 색상 비의존 실측.
 *
 * MANUAL_REVIEW_CHECKLIST 와 accessibilityEvidence 가 주장하는 것을 실제로 눌러서 확인한다.
 * 선언만 하고 재보지 않으면 "자기 선언만으로 UX PASS 가 되지 않는다"는 경고에 걸린다.
 *
 * 실행: npx playwright test --config workspace/23C/tests/e2e/playwright.config.ts
 * 전제: 데모 UI가 http://localhost:5173 에서 떠 있어야 한다.
 */
import { expect, test, type Page } from "@playwright/test";

/** 마우스를 쓰지 않는다. Tab 으로 이동해 라벨이 맞는 요소에서 Enter 를 누른다. */
async function tabTo(page: Page, name: RegExp | string, limit = 60): Promise<void> {
  for (let i = 0; i < limit; i++) {
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? (el.innerText || el.getAttribute("aria-label") || "").trim() : "";
    });
    if (typeof name === "string" ? label.includes(name) : name.test(label)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab ${limit}회 안에 "${name}" 에 도달하지 못했습니다`);
}

async function pressOn(page: Page, name: RegExp | string): Promise<void> {
  await tabTo(page, name);
  await page.keyboard.press("Enter");
}

test.describe("접근성 실측", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173/");
    await expect(page.getByRole("heading", { name: /닭강정 가게 주문/ })).toBeVisible();
  });

  test("마우스 없이 시작→질문→추천→최종확인까지 완주한다", async ({ page }) => {
    await page.keyboard.press("Tab"); // 문서 진입
    await pressOn(page, /시작하기/);

    // 질문 수는 답에 따라 달라진다(조기 종료) — 개수나 순서를 고정하지 않고,
    // 마법사 화면이 남아 있는 동안만 답한다.
    for (let q = 0; q < 7; q++) {
      if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
      const first = page.locator(".choices .choice").first();
      await first.focus();
      await page.keyboard.press("Enter");
      await pressOn(page, /다음|추천 보기/);
    }

    await expect(page.getByRole("heading", { name: /이런 메뉴는|조건에 맞는 메뉴가 없습니다/ })).toBeVisible();

    // 추천이 나왔으면 최종 확인까지 간다
    const approve = page.getByRole("button", { name: "네, 좋아요" });
    if (await approve.isVisible()) {
      await approve.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: /마지막으로 확인/ })).toBeVisible();
    }
  });

  /**
   * 질문은 7개 고정이다 — 시스템이 먼저 끝내지 않는다.
   *
   * 답이 충분해 보여도(추천 신뢰도가 높아도) 남은 질문을 생략하지 않는다.
   * confidence 가 재는 것은 "1위 메뉴가 더 안 바뀐다"이지 "남은 질문이 무의미하다"가
   * 아니기 때문이다 — 이용방식·수량·컵은 답에 따라 실행계획이 실제로 달라진다.
   * 무엇을 주문할지는 사용자가 정한다.
   */
  test("답이 충분해 보여도 7문항을 전부 묻는다", async ({ page }) => {
    await page.getByRole("button", { name: /시작하기/ }).click();

    // 예전에 3문항 만에 종료되던 조합
    await page.getByRole("button", { name: "땅콩", exact: true }).click();
    await page.getByRole("button", { name: "콩(대두)" }).click();
    await page.getByRole("button", { name: /다음/ }).click();

    await page.getByRole("button", { name: "매운맛", exact: true }).click();
    await page.getByRole("button", { name: /다음/ }).click();

    await page.getByRole("button", { name: "뼈", exact: true }).click();
    await page.getByRole("button", { name: /다음/ }).click();

    // 4번째 질문(이용 방식)이 그대로 나와야 한다
    await expect(page.locator("#qtitle")).toBeVisible();
    await expect(page.locator(".stepmeta")).toContainText("4 / 7");

    // 끝까지 답한다 — 총 7문항
    for (let i = 4; i <= 7; i++) {
      await expect(page.locator(".stepmeta")).toContainText(`${i} / 7`);
      await page.locator(".choices .choice").first().click();
      await page.getByRole("button", { name: /다음|추천 보기/ }).click();
    }

    await expect(page.locator("#qtitle")).toHaveCount(0);
    // 생략한 것이 없으므로 생략 고지도 없다
    await expect(page.getByText(/여쭤보지 않았습니다/)).toHaveCount(0);
  });

  test("포커스가 항상 눈에 보인다 (outline 이 none 이 아니다)", async ({ page }) => {
    await page.keyboard.press("Tab");
    for (let i = 0; i < 12; i++) {
      const ok = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return true;
        const s = getComputedStyle(el);
        const w = parseFloat(s.outlineWidth || "0");
        return s.outlineStyle !== "none" && w >= 2;
      });
      expect(ok, `${i}번째 포커스 요소에 보이는 아웃라인이 없습니다`).toBe(true);
      await page.keyboard.press("Tab");
    }
  });

  test("모든 조작 요소가 48px 이상이다", async ({ page }) => {
    const boxes = await page.locator("button, input, a[href]").evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({ h: e.getBoundingClientRect().height, t: (e as HTMLElement).innerText.slice(0, 20) })),
    );
    expect(boxes.length).toBeGreaterThan(3);
    for (const b of boxes) expect(b.h, `"${b.t}" 높이 ${b.h}px`).toBeGreaterThanOrEqual(48);
  });

  test("화면 확대 200%에서 가로 스크롤이 생기지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `가로로 ${overflow}px 넘칩니다`).toBeLessThanOrEqual(1);
  });

  test("상태를 색이 아니라 글자로도 알 수 있다", async ({ page }) => {
    await page.getByRole("button", { name: "화면·안내 설정" }).click();
    // 각 설정 행이 켬/끔을 글자로 표시한다
    const states = await page.locator(".astate").allInnerTexts();
    expect(states.length).toBeGreaterThan(4);
    for (const s of states) expect(["켬", "끔"]).toContain(s.trim());
    // 선택 상태가 aria-pressed 로도 노출된다 (색 의존 아님)
    const pressed = await page.locator(".a11yrow[aria-pressed]").count();
    expect(pressed).toBeGreaterThan(4);
  });

  test("모든 화면에서 직원 도움에 닿는다", async ({ page }) => {
    await expect(page.getByRole("button", { name: "직원 도움" })).toBeVisible();
    await page.getByRole("button", { name: /시작하기/ }).click();
    await expect(page.getByRole("button", { name: "직원 도움" })).toBeVisible();
  });
});
