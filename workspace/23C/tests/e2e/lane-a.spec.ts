/**
 * A계열 — 프로필 흐름(S01 홈 · S02 프로필 생성 3단계 · S03 저장 방식 · S05 세션 시작).
 *
 * 실행: npx playwright test -c workspace/23C/tests/e2e/playwright.config.ts workspace/23C/tests/e2e/lane-a.spec.ts
 * 전제: 데모 UI가 http://localhost:5173 에 떠 있어야 한다.
 *
 * 이 파일이 지키는 것은 «디자인대로 그렸는가»가 아니라 **흐름과 접근성이 살아 있는가**다.
 * 화면을 넷으로 쪼개면서 잃기 쉬운 것 셋을 특히 붙잡는다 —
 *   ① 접근성 토글 7종이 3단계 라디오 뒤로 사라지지 않는다 (제출물이 채널 8종을 선언한다)
 *   ② 「화면 글씨 맞춰보기」 문답이 1단계에 남는다
 *   ③ S03 에서 정한 저장 의사가 세션 시작(startWizard)에서 지워지지 않는다
 */
import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "kb23c-saved-settings-v4";

/** 저장본 없는 «최초 방문» 홈에서 시작한다. */
async function home(page: Page) {
  await page.goto("http://localhost:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: /닭강정 가게 주문/ })).toBeVisible();
}

/** 홈 → 프로필 1/3. */
async function toProfile(page: Page) {
  await home(page);
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByRole("heading", { name: "더 읽기 편한 크기를 선택해주세요" })).toBeVisible();
}

/** 프로필 3단계를 그대로 통과해 S03 으로. */
async function toSaveChoice(page: Page) {
  await toProfile(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("heading", { name: "선택하신 내용을 확인해주세요" })).toBeVisible();
}

/** 지금 단계 이름 (5단계 인디케이터의 현재 라벨). */
const nowStep = (page: Page) => page.locator(".kb-steps:not(.mini) .kb-step.now .kb-steplabel");

/** 라디오 카드 하나 — 이름이 상단바 토글과 겹치므로 항상 카드 안으로 범위를 좁힌다. */
const radio = (page: Page, name: string) => page.locator(".kb-radio", { hasText: name });

test.describe("A계열 — 프로필 흐름", () => {
  test("A1 홈에 5단계 인디케이터가 있고, 시연 사례·저장본 카드는 그대로다", async ({ page }) => {
    await home(page);

    const steps = page.locator(".kb-steps:not(.mini)").first();
    await expect(steps).toContainText("홈");
    await expect(steps).toContainText("프로필 생성");
    await expect(steps).toContainText("저장 방식");
    await expect(steps).toContainText("세션 시작");
    await expect(nowStep(page)).toHaveText("홈");
    // 색만으로 현재 위치를 말하지 않는다 — 낭독기용 문장이 함께 있다
    await expect(steps.locator(".srline")).toContainText("5단계 중 1단계");

    // 심사 시연에 쓰는 카드 — 없애지 않는다
    await expect(page.locator("section[aria-label='시연 사례']")).toBeVisible();
    await expect(page.locator(".presetrow")).toHaveCount(5);
  });

  test("A2 홈 → 프로필 1/3 → 2/3 → 3/3 → 저장 방식으로 이어진다", async ({ page }) => {
    await toProfile(page);
    await expect(nowStep(page)).toHaveText("프로필 생성");
    // 작은 3단계 표시도 함께 (디자인 MiniStepIndicator)
    await expect(page.locator(".kb-steps.mini .kb-step.now .kb-dot")).toHaveText("1");

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "더 또렷하게 보이는 화면을 선택해주세요" })).toBeVisible();
    await expect(page.locator(".kb-steps.mini .kb-step.now .kb-dot")).toHaveText("2");

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "필요한 안내 방식을 선택해주세요" })).toBeVisible();
    await expect(page.locator(".kb-steps.mini .kb-step.now .kb-dot")).toHaveText("3");

    // 되돌아갈 수 있다
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await expect(page.getByRole("heading", { name: "더 또렷하게 보이는 화면을 선택해주세요" })).toBeVisible();
    await page.getByRole("button", { name: "다음", exact: true }).click();

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "선택하신 내용을 확인해주세요" })).toBeVisible();
    await expect(nowStep(page)).toHaveText("저장 방식");
  });

  test("A3 세 단계의 라디오가 실제로 화면을 바꾼다", async ({ page }) => {
    await toProfile(page);
    const app = page.locator(".app");

    // 1/3 글씨 크기 — 기본은 큰 글씨가 켜져 있다(A11Y_DEFAULT)
    await expect(app).toHaveClass(/large/);
    await radio(page, "기본 크기").click();
    await expect(app).not.toHaveClass(/large/);
    await radio(page, "큰 글씨").click();
    await expect(app).toHaveClass(/large/);
    // 선택 상태를 색이 아니라 글자로도 알 수 있다
    await expect(radio(page, "큰 글씨")).toContainText("선택됨");

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await radio(page, "고대비 화면").click();
    await expect(app).toHaveClass(/contrast/);

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await radio(page, "안내 켜짐").click();
    await expect(app).toHaveClass(/icons/);
  });

  test("A4 접근성 7종과 입력 방식이 프로필 화면에 그대로 남아 있다", async ({ page }) => {
    await toProfile(page);

    // 3단계 라디오 뒤에 «자세한 설정»으로 남긴다 — 채널을 선언만 하고 숨기지 않는다
    await expect(page.locator(".a11ylist .a11yrow")).toHaveCount(7);
    const input = page.getByRole("group", { name: "입력 방식" });
    await expect(input.locator("button")).toHaveCount(2);

    // 실제로 동작한다 (대표로 둘)
    const app = page.locator(".app");
    await page.locator(".a11ylist .a11yrow", { hasText: "누르기 편하게" }).click();
    await expect(app).toHaveClass(/roomy/);
    await page.locator(".a11ylist .a11yrow", { hasText: "직원 도움 먼저" }).click();
    await expect(page.locator(".staffbar")).toBeVisible();

    // 구현하지 않은 음성 입력을 선택지로 만들지 않는다
    await expect(page.getByRole("button", { name: /음성/ })).toHaveCount(0);
  });

  test("A5 「화면 글씨 맞춰보기」 문답이 1단계에 남아 있고 결과가 반영된다", async ({ page }) => {
    await toProfile(page);
    await page.getByRole("button", { name: "화면 글씨 맞춰보기" }).click();
    await page.getByRole("button", { name: "조금 작아요" }).click();
    await page.getByRole("button", { name: "조금 작아요" }).click();
    await page.getByRole("button", { name: "잘 보여요" }).click();

    await expect(page.getByText(/큰 글씨·고대비·그림 안내를 켰습니다/)).toBeVisible();
    const app = page.locator(".app");
    await expect(app).toHaveClass(/large/);
    await expect(app).toHaveClass(/contrast/);
    await expect(app).toHaveClass(/icons/);
    // 문답 결과가 1단계 라디오에도 그대로 비친다 (두 곳이 같은 값을 본다)
    await expect(radio(page, "큰 글씨")).toContainText("선택됨");
  });

  test("A6 S03 이 프로필 요약을 보여주고 저장 여부를 여기서 한 번만 묻는다", async ({ page }) => {
    await toSaveChoice(page);

    // 요약 세 줄 (디자인 SummaryCard)
    const summary = page.locator("section[aria-label='지금 화면 설정']");
    await expect(summary).toContainText("글씨 크기");
    await expect(summary).toContainText("고대비");
    await expect(summary).toContainText("화면 안내");

    // 기본은 «이번만 사용» — 공용 기기에서 조용히 저장하지 않는다
    await expect(radio(page, "이번만 사용")).toContainText("선택됨");
    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull();

    await radio(page, "이 기기에 저장하기").click();
    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).not.toBeNull();
    await radio(page, "이번만 사용").click();
    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
  });

  test("A7 S03 의 «다음»은 QR 로, «건너뛰기»는 세션 시작으로 간다", async ({ page }) => {
    await toSaveChoice(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "선택하신 내용을 확인해주세요" })).toHaveCount(0);

    // 매장 QR 이 없는 경우 — QR 을 건너뛰고 바로 세션 시작으로
    await toSaveChoice(page);
    await page.getByRole("button", { name: /매장 QR 없이 계속하기/ }).click();
    await expect(nowStep(page)).toHaveText("세션 시작");
  });

  test("A8 S03 의 «수정»이 해당 단계로 되돌려 준다", async ({ page }) => {
    await toSaveChoice(page);
    await page.locator(".kb-row", { hasText: "화면 안내" }).getByRole("button", { name: /수정/ }).click();
    await expect(page.getByRole("heading", { name: "필요한 안내 방식을 선택해주세요" })).toBeVisible();
  });

  test("A9 S05 에서 시작하면 마법사 첫 질문(알레르기)으로 간다", async ({ page }) => {
    await toSaveChoice(page);
    await page.getByRole("button", { name: /매장 QR 없이 계속하기/ }).click();
    await expect(nowStep(page)).toHaveText("세션 시작");

    await page.getByRole("button", { name: /주문 시작하기/ }).click();
    await expect(page.locator("#qtitle")).toHaveText(/알레르기/);
  });

  test("A10 S03 에서 정한 저장 의사가 주문 확정까지 살아남는다", async ({ page }) => {
    await toSaveChoice(page);
    await radio(page, "이 기기에 저장하기").click();
    await page.getByRole("button", { name: /매장 QR 없이 계속하기/ }).click();
    await page.getByRole("button", { name: /주문 시작하기/ }).click();

    // 7문항을 첫 선택지로 답한다
    for (let i = 0; i < 7; i++) {
      if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
      await page.locator(".choices .choice").first().click();
      await page.getByRole("button", { name: /다음|추천 보기/ }).click();
    }
    await page.getByRole("button", { name: "네, 좋아요" }).click();
    await expect(page.getByRole("heading", { name: /마지막으로 확인/ })).toBeVisible();

    const live = page.getByRole("button", { name: /가상 키오스크에서 실행/ });
    await ((await live.count()) > 0 ? live : page.getByRole("button", { name: /주문 확정하기/ })).click();
    await expect(page.getByRole("heading", { name: /실행 결과|주문이 완성되었습니다|주문 계획/ })).toBeVisible();

    // 답변까지 함께 남았는가 — startWizard 가 저장 의사를 지웠다면 여기서 걸린다
    const saved = await page.evaluate((k) => {
      const s = localStorage.getItem(k);
      return s ? (JSON.parse(s) as { answers?: Record<string, unknown> }) : null;
    }, STORAGE_KEY);
    expect(saved, "저장하기를 골랐는데 저장본이 없습니다").not.toBeNull();
    expect(saved!.answers?.allergies, "저장본에 이번 답변이 없습니다").toBeDefined();
  });

  test("A12 네 화면의 조작 요소가 전부 48px 이상이다 (고대비·큰 글씨 포함)", async ({ page }) => {
    /** 지금 화면의 보이는 버튼 높이를 전부 잰다 — CSS 선언이 아니라 실제 렌더 결과다. */
    const heights = () => page.locator("button, input, a[href]").evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({ h: e.getBoundingClientRect().height, t: (e as HTMLElement).innerText.slice(0, 24) })));
    const check = async (where: string) => {
      const boxes = await heights();
      expect(boxes.length, `${where} 에 조작 요소가 없습니다`).toBeGreaterThan(3);
      for (const b of boxes) expect(b.h, `${where} "${b.t}" 높이 ${b.h}px`).toBeGreaterThanOrEqual(48);
    };

    await toProfile(page);
    await radio(page, "기본 크기").click();        // 큰 글씨를 꺼도 (가장 불리한 쪽)
    await check("S02 1/3");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await radio(page, "고대비 화면").click();      // 고대비까지 켜고
    await check("S02 2/3");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await check("S02 3/3");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await check("S03");
    await page.getByRole("button", { name: /매장 QR 없이 계속하기/ }).click();
    await check("S05");
    await page.getByRole("button", { name: "처음으로" }).click();
    await check("S01");
  });

  test("A11 네 화면 모두에서 직원 도움에 닿는다", async ({ page }) => {
    const staff = page.getByRole("button", { name: "직원 도움" }).first();
    await home(page);
    await expect(staff).toBeVisible();
    await page.getByRole("button", { name: "시작하기" }).click();
    await expect(staff).toBeVisible();
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(staff).toBeVisible();                                   // S03
    await page.getByRole("button", { name: /매장 QR 없이 계속하기/ }).click();
    await expect(staff).toBeVisible();                                   // S05
  });
});
