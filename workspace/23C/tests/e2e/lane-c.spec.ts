/**
 * 레인 C — 질문 화면(S06~S10)과 계산 화면(S11).
 *
 * 실행: npx playwright test -c workspace/23C/tests/e2e/playwright.config.ts lane-c
 * 전제: 데모 UI 가 http://localhost:5173 에 떠 있어야 한다.
 *
 * verify-b.spec.ts 가 «흐름»(질문 7개 고정·첫 질문 알레르기·상관없어요)을 지키고,
 * 여기서는 그 흐름 위에 얹은 **디자인 반영이 접근성 계약을 깨지 않았는지**를 본다.
 * 두 가지가 대상이다.
 *
 *  ① 그림 아이콘을 이모지에서 디자인 에셋으로 바꾸면서 «아이콘 단독 금지»가 무너지지 않았는가.
 *    아이콘을 CSS 배경 그림으로 깔면 글자를 지우고 싶은 유혹이 생기고, 그 순간
 *    화면 낭독기에는 아무것도 남지 않는다. 그래서 그림이 붙은 자리마다 글자를 같이 잰다.
 *
 *  ② 제목을 «강조 어절 + 나머지»로 쪼갠 것이 문장을 깨뜨리지 않았는가.
 *    쪼갠 조각 사이에 공백이 끼면 B3(«첫 질문은 알레르기») 같은 검사는 정규식이라 통과하지만,
 *    낭독기에는 «알레르기 가 있으세요»처럼 끊겨 읽힌다. 전체 문장을 통째로 비교한다.
 */
import { expect, test, type Page } from "@playwright/test";

const HOME = "http://localhost:5173/";

/**
 * 화면 설정을 원하는 대로 켜고 첫 질문까지 간다.
 *
 * 홈에서 질문까지 가는 길에는 다른 갈래가 만드는 중인 화면 넷(S02~S05)이 끼어 있고,
 * 그 버튼 이름들은 아직 바뀐다. 이 레인이 검사할 것은 질문 화면이므로 그 길을 흉내 내는
 * 대신 **저장본으로 시작하는 길**을 쓴다 — 답변이 하나도 없는 저장본이면 화면 설정만
 * 실어 오고 첫 질문(알레르기)부터 그대로 묻는다. 이 길은 flow.tsx 의 startFromSaved
 * 하나만 지나므로 앞 화면이 어떻게 바뀌든 흔들리지 않는다.
 *
 * 빠뜨린 화면 설정은 A11Y_DEFAULT 가 채운다(model.ts 의 readSaved).
 */
const openWizard = async (page: Page, a11y: Record<string, boolean> = {}) => {
  await page.goto(HOME);
  await page.evaluate((flags) => {
    localStorage.clear();
    localStorage.setItem("kb23c-saved-settings-v4", JSON.stringify({
      v: 4, answers: {}, a11y: flags, savedAt: "2026-08-11T00:00:00.000Z",
    }));
  }, a11y);
  await page.reload();
  await page.getByRole("button", { name: "저장된 설정으로 시작하기" }).click();
  await expect(page.locator("#qtitle")).toBeVisible();
};

/** 지금 질문의 n번째(1부터) 선택지를 고르고 다음으로 넘어간다. */
const pick = async (page: Page, nth: number) => {
  await page.locator(".choices .choice").nth(nth - 1).click();
  await page.getByRole("button", { name: /다음|추천 보기/ }).click();
};

/** 선택지 n번째의 그림 자리에 깔린 배경 그림 URL (없으면 "none"). */
const iconOf = (page: Page, nth: number) =>
  page.locator(".choices .choice").nth(nth - 1).locator(".ico")
    .evaluate((el) => getComputedStyle(el).backgroundImage);

test.describe("레인 C — 질문 화면", () => {
  test("C-L1 제목을 강조 어절로 쪼개도 문장이 그대로 읽힌다", async ({ page }) => {
    await openWizard(page);
    // 조각 사이에 공백이 끼면 여기서 걸린다 (정규식이 아니라 문장 전체 비교)
    await expect(page.locator("#qtitle")).toHaveText("피해야 하는 알레르기가 있으세요?");
    // 강조 어절이 실제로 따로 그려진다
    await expect(page.locator("#qtitle .qkey")).toHaveText("알레르기");
  });

  test("C-L2 그림이 붙은 선택지에도 글자가 반드시 남는다", async ({ page }) => {
    await openWizard(page, { visualGuidance: true });

    // 「없어요」에는 디자인 아이콘(safe)이 깔린다
    expect(await iconOf(page, 1)).toMatch(/safe[-.\w]*\.svg/);
    // 그림만 두지 않는다 — 글자가 함께 있어야 한다
    await expect(page.locator(".choices .choice").nth(0)).toHaveText(/없어요/);
  });

  test("C-L3 매핑에 없는 선택지는 이모지를 그대로 쓴다", async ({ page }) => {
    await openWizard(page, { visualGuidance: true });

    // 「땅콩」은 디자인 에셋이 없으므로 배경 그림이 깔리지 않고 이모지가 남는다
    expect(await iconOf(page, 2)).toBe("none");
    await expect(page.locator(".choices .choice").nth(1).locator(".ico")).toHaveText("🥜");
  });

  test("C-L4 뼈·순살·포장·매장·매운맛에 디자인 아이콘이 붙는다", async ({ page }) => {
    await openWizard(page, { visualGuidance: true });

    await pick(page, 1); // 알레르기 없어요
    // 맵기 — 매운맛(3번째)
    await expect(page.locator("#qtitle")).toHaveText(/맵기/);
    expect(await iconOf(page, 3)).toMatch(/hot[-.\w]*\.svg/);
    await pick(page, 3);

    // 형태 — 순살(1번째) · 뼈(2번째)
    await expect(page.locator("#qtitle")).toHaveText(/뼈와 순살/);
    expect(await iconOf(page, 1)).toMatch(/boneless[-.\w]*\.svg/);
    const bone = await iconOf(page, 2);
    expect(bone).toMatch(/bone[-.\w]*\.svg/);
    expect(bone).not.toMatch(/boneless/); // 뼈와 순살이 같은 그림을 쓰면 구분이 사라진다
    await pick(page, 1);

    // 이용 방식 — 포장하기(1번째) · 먹고 가기(2번째)
    await expect(page.locator("#qtitle")).toHaveText(/어떻게/);
    expect(await iconOf(page, 1)).toMatch(/takeout[-.\w]*\.svg/);
    expect(await iconOf(page, 2)).toMatch(/here[-.\w]*\.svg/);
  });

  test("C-L5 7문항 어디에도 글자 없는 선택지가 없다", async ({ page }) => {
    await openWizard(page, { visualGuidance: true });

    for (let i = 0; i < 7; i++) {
      await expect(page.locator("#qtitle")).toBeVisible();
      const labels = await page.locator(".choices .choice").allInnerTexts();
      expect(labels.length, `${i + 1}번째 질문에 선택지가 없습니다`).toBeGreaterThan(1);
      for (const l of labels) {
        expect(l.trim().length, `${i + 1}번째 질문에 글자 없는 선택지가 있습니다`).toBeGreaterThan(0);
      }
      await pick(page, 1);
    }
    await expect(page.locator("#qtitle")).toHaveCount(0);
    // verify-b B1 과 같은 자리 — 시스템이 먼저 끝내지 않으므로 생략 고지가 나올 일이 없다
    await expect(page.getByText(/여쭤보지 않았습니다/)).toHaveCount(0);
  });

  test("C-L6 고른 것은 색 말고 기호로도 읽힌다", async ({ page }) => {
    await openWizard(page);
    await page.locator(".choices .choice").nth(1).click(); // 땅콩

    const chosen = page.locator('.choices .choice[aria-pressed="true"]');
    await expect(chosen).toHaveCount(1);
    const mark = await chosen.evaluate((el) => getComputedStyle(el, "::after").content);
    expect(mark, "선택 표식이 색뿐입니다 — 기호가 없습니다").toContain("✓");
  });

  test("C-L7 뒤로가기가 첫 질문에서는 홈으로, 그 뒤에는 앞 질문으로 간다", async ({ page }) => {
    await openWizard(page);
    await pick(page, 1); // 알레르기 → 맵기

    await expect(page.locator("#qtitle")).toHaveText(/맵기/);
    await page.getByRole("button", { name: "뒤로" }).click();
    await expect(page.locator("#qtitle")).toHaveText(/알레르기/);

    await page.getByRole("button", { name: "뒤로" }).click();
    await expect(page.getByRole("heading", { name: /닭강정 가게 주문/ })).toBeVisible();
  });

  test("C-L8 계산 화면에 진행 표시와 직원 도움이 함께 있다", async ({ page }) => {
    await openWizard(page);
    for (let i = 0; i < 7; i++) await pick(page, 1);

    // 결과는 이미 계산돼 있고 화면만 거친다 — 짧게 지나가므로 바로 잡는다
    await expect(page.locator(".calcspin")).toBeVisible();
    await expect(page.getByRole("heading", { name: /메뉴를 찾고 있어요/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "직원 도움" })).toBeVisible();

    const anim = await page.locator(".calcspin").evaluate((el) => getComputedStyle(el).animationName);
    expect(anim, "진행 표시가 돌지 않습니다").not.toBe("none");
  });

  test("C-L9 큰 글씨·누르기 편하게를 켜도 가로로 넘치지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWizard(page, { largeText: true, mobilitySupport: true, visualGuidance: true });
    await expect(page.locator(".app")).toHaveClass(/large/);
    await expect(page.locator(".app")).toHaveClass(/roomy/);

    // 선택지가 가장 많은 질문(알레르기 8개)에서 잰다
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `가로로 ${over}px 넘칩니다`).toBeLessThanOrEqual(1);

    // 그림이 붙어 선택지가 커져도, 뒤로가기가 늘어도 타깃 기준은 그대로다
    const small = await page.locator("button").evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({ h: e.getBoundingClientRect().height, t: (e as HTMLElement).innerText.slice(0, 12) }))
        .filter((b) => b.h < 48));
    expect(small, `48px 미만인 버튼: ${JSON.stringify(small)}`).toEqual([]);
  });

  test("C-L10 질문 화면에 생략·조기 종료를 권하는 자리가 없다", async ({ page }) => {
    await openWizard(page);
    const body = await page.locator("section.card").first().innerText();
    expect(body).not.toMatch(/생략|건너뛰|바로 추천|그만 묻/);
    await pick(page, 1);
    // 「상관없어요」는 없애지 않는다 — NO_PREFERENCE 로 계약에 들어간다
    await expect(page.getByRole("button", { name: "상관없어요" })).toBeVisible();
  });
});

test.describe("레인 C — 움직임 줄이기", () => {
  // 1.62 의 타입에는 최상위 reducedMotion 이 없다 — 컨텍스트 옵션으로 건다.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("C-L11 움직임을 줄이면 계산 화면을 아예 거치지 않는다", async ({ page }) => {
    await openWizard(page);
    // 흉내가 실제로 걸렸는지 먼저 확인한다 — 안 걸렸으면 아래 단정이 공짜로 통과한다
    const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    expect(reduced, "브라우저에 «움직임 줄이기»가 걸리지 않았습니다").toBe(true);

    for (let i = 0; i < 7; i++) await pick(page, 1);

    // 도는 표시를 멈추는 데서 그치지 않고 지연 자체를 없앤다.
    // 기다리면 어차피 사라지므로 마지막 답 직후 그 자리에서 잰다(재시도 없는 count).
    expect(await page.locator(".calcspin").count(), "계산 화면을 거쳤습니다").toBe(0);
    await expect(page.getByRole("heading", { name: /이런 메뉴는|조건에 맞는 메뉴가 없습니다/ })).toBeVisible();
  });
});
