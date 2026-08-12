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
import { 아무거나답하고다음, enterWizard, enterWizardByKeyboard } from "./nav";

/** 마우스를 쓰지 않는다. Tab 으로 이동해 라벨이 맞는 요소에서 Enter 를 누른다. */
async function tabTo(page: Page, name: RegExp | string, limit = 60): Promise<void> {
  for (let i = 0; i < limit; i++) {
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      /* 화면이 바뀌면 포커스가 <body> 로 돌아가는데, body 의 innerText 는 **페이지 전체 글자**다.
         그대로 비교하면 아직 누르지도 않은 버튼의 이름이 거기 들어 있어 «찾았다»가 되고,
         결국 body 에 Enter 를 눌러 아무 일도 일어나지 않는다. 컨테이너는 후보에서 뺀다. */
      if (!el || el === document.body || el === document.documentElement) return "";
      return (el.innerText || el.getAttribute("aria-label") || "").trim();
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
    await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요|다시 오셨네요/ })).toBeVisible();
  });

  test("마우스 없이 시작→질문→추천→최종확인까지 완주한다", async ({ page }) => {
    await page.keyboard.press("Tab"); // 문서 진입
    // 홈에서 질문까지 네 걸음이 늘었다 — 그 길도 마우스 없이 지나야 한다
    await enterWizardByKeyboard(page, pressOn);

    // 질문은 7개 고정이다. 개수를 여기서 다시 세지는 않고(그건 아래 전용 검사가 한다)
    // 마법사 화면이 남아 있는 동안만 답한다.
    for (let q = 0; q < 7; q++) {
      if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
      /* 수량은 «− 1 +» 증감이라 고를 선택지가 없다. 화면에 1이 떠 있고 그것이 곧
         답이므로, 마우스 없이도 아무것도 고르지 않고 다음으로 갈 수 있어야 한다. */
      if (!(await page.locator(".stepper").count())) {
        const first = page.locator(".choices .choice").first();
        await first.focus();
        await page.keyboard.press("Enter");
      }
      await pressOn(page, /다음|추천 보기/);
    }

    /* 화면 제목은 h2(.kb-title) 하나뿐이다 — 본문 소제목까지 걸리지 않도록 단계를
       지정한다. «없습니다»는 화면에 없는 문구라 실제 문구(«조건에 맞는 메뉴가
       없어요»)로 맞춘다. 추천·메뉴 확인은 «메뉴 확인» 한 화면으로 합쳐졌다. */
    await expect(page.getByRole("heading", { level: 2, name: /이 메뉴를 선택하시겠어요|조건에 맞는 메뉴가 없어요/ }))
      .toBeVisible();

    // 추천이 나왔으면 최종 확인까지 간다 — 여기도 마우스 없이 지나야 한다
    const approve = page.getByRole("button", { name: "선택하기", exact: true });
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
    await enterWizard(page);

    // 예전에 3문항 만에 종료되던 조합
    // 알레르기는 «있으신가요?» → 항목 목록 두 걸음이지만 질문은 하나다 (디자인 S06)
    await page.getByRole("button", { name: "있어요", exact: true }).click();
    await page.getByRole("button", { name: "땅콩", exact: true }).click();
    await page.getByRole("button", { name: "대두", exact: true }).click();
    await page.getByRole("button", { name: /다음/ }).click();

    await page.getByRole("button", { name: "매운맛", exact: true }).click();
    await page.getByRole("button", { name: /다음/ }).click();

    await page.getByRole("button", { name: "뼈", exact: true }).click();
    await page.getByRole("button", { name: /다음/ }).click();

    /* 4번째 질문(이용 방식)이 그대로 나와야 한다.
       «몇 번째 질문인가»는 .stepmeta 글자에서 진행 표시(.kb-steps.mini)로 옮겨 갔다.
       점만 찍는 표시라 눈에는 번호가 없지만, 색만으로 위치를 말하지 않도록 낭독기용
       문장(.srline)이 «질문 4 / 7» 을 그대로 들고 있다 — 세는 자리가 거기로 바뀌었을 뿐
       재는 것은 같다. */
    await expect(page.locator("#qtitle")).toBeVisible();
    const qcount = page.locator(".kb-steps.mini .srline");
    await expect(qcount).toContainText("질문 4 / 7");

    // 끝까지 답한다 — 총 7문항
    for (let i = 4; i <= 7; i++) {
      await expect(qcount).toContainText(`질문 ${i} / 7`);
      await 아무거나답하고다음(page);
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
    /* 화면이 비어 있지 않은지만 본다. 디자인대로 재배치한 뒤 홈의 조작 요소는
       [시작하기] 하나뿐이다 — 시안 150:162 가 그렇고, 직원 도움을 걷어내며 더 줄었다.
       이 가드는 «아무것도 못 찾았는데 통과»를 막으려는 것이다. */
    expect(boxes.length, "조작 요소를 하나도 못 찾았습니다").toBeGreaterThanOrEqual(1);
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
    await page.getByRole("button", { name: /^(시작하기|새로 설정하기)$/ }).click();
    /* 설정 목록은 프로필 3/3 의 «자세한 설정» 안으로 옮겨 갔다 — 걸음마다 붙여 두면
       고를 것 두 장 아래로 목록이 늘 따라붙어 화면이 무너지기 때문이다. 옮겨졌을 뿐
       접혀 있지도 사라지지도 않았으므로, 그 자리까지 가서 같은 것을 잰다. */
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "필요한 안내 방식을 선택해주세요" })).toBeVisible();

    // 각 설정 행이 켬/끔을 글자로 표시한다
    const states = await page.locator(".astate").allInnerTexts();
    expect(states.length).toBeGreaterThan(4);
    for (const s of states) expect(["켬", "끔"]).toContain(s.trim());
    // 선택 상태가 aria-pressed 로도 노출된다 (색 의존 아님)
    const pressed = await page.locator(".a11yrow[aria-pressed]").count();
    expect(pressed).toBeGreaterThan(4);
  });
});
