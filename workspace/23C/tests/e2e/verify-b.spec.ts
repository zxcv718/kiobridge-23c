/**
 * B·C계열 — 화면 동작 검증.
 *
 * 실행: npx playwright test -c workspace/23C/tests/e2e/playwright.config.ts verify-b
 * 시나리오 정의: `키오브릿지-검증-시나리오.md`
 *
 * keyboard.spec.ts 가 접근성 실측을 맡고, 여기서는 **여러 화면이 상태로 얽히는 경로**와
 * **participant-ux.json 선언이 화면에서 실제로 동작하는지**를 본다.
 * 단위 테스트로는 잡히지 않는 회귀(저장본 마이그레이션·재확인 카운터·선언 일치)가 대상이다.
 */
import { expect, test, type Page } from "@playwright/test";

const start = async (page: Page) => {
  await page.goto("http://localhost:5173/");
  await expect(page.getByRole("heading", { name: /닭강정 가게 주문/ })).toBeVisible();
};

/**
 * 7문항을 끝까지 답한다 (알레르기 땅콩·콩 → 매운맛 → 뼈 → 나머지는 첫 선택지).
 * 질문은 고정이므로 어떤 조합이든 추천 화면에 닿으려면 전부 답해야 한다.
 */
async function answerAll(page: Page) {
  await page.getByRole("button", { name: /시작하기/ }).click();
  await page.getByRole("button", { name: "땅콩", exact: true }).click();
  await page.getByRole("button", { name: "콩(대두)" }).click();
  await page.getByRole("button", { name: /다음/ }).click();
  await page.getByRole("button", { name: "매운맛", exact: true }).click();
  await page.getByRole("button", { name: /다음/ }).click();
  await page.getByRole("button", { name: "뼈", exact: true }).click();
  await page.getByRole("button", { name: /다음/ }).click();
  for (let i = 0; i < 4; i++) {
    if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
    await page.locator(".choices .choice").first().click();
    await page.getByRole("button", { name: /다음|추천 보기/ }).click();
  }
}

test.describe("B계열 — 신규 동작", () => {
  test("B1 질문은 7개 고정이고 생략 고지가 없다", async ({ page }) => {
    await start(page);
    await answerAll(page);

    // 시스템이 먼저 끝내지 않으므로 "여쭤보지 않았습니다"가 나올 일이 없다
    await expect(page.getByText(/여쭤보지 않았습니다/)).toHaveCount(0);
    await expect(page.locator("#qtitle")).toHaveCount(0);

    await page.getByRole("button", { name: "네, 좋아요" }).click();
    await expect(page.getByRole("heading", { name: /마지막으로 확인/ })).toBeVisible();
    // 안 물어본 항목이 없으므로 그 사유 문구도 없다
    await expect(page.getByText(/여쭤보지 않아서/)).toHaveCount(0);
  });

  test("B2 전부 '상관없어요'면 끝까지 묻고 사유는 '상관없다고 하셔서'", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: /시작하기/ }).click();
    await page.getByRole("button", { name: "없어요", exact: true }).click(); // 알레르기 없음
    await page.getByRole("button", { name: /다음/ }).click();

    // 맵기·형태·이용방식은 상관없어요
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "상관없어요" }).click();
      await page.getByRole("button", { name: /다음/ }).click();
    }
    await page.getByRole("button", { name: "1개" }).click();
    await page.getByRole("button", { name: /다음/ }).click();
    await page.getByRole("button", { name: "상관없어요" }).click(); // 컵
    await page.getByRole("button", { name: /다음/ }).click();
    await page.getByRole("button", { name: "없어요", exact: true }).click(); // 예산
    await page.getByRole("button", { name: /추천 보기|다음/ }).click();

    // 전부 답했으므로 생략 고지가 없어야 한다
    await expect(page.getByText(/여쭤보지 않았습니다/)).toHaveCount(0);
    await page.getByRole("button", { name: "네, 좋아요" }).click();
    await expect(page.getByText(/상관없다고 하셔서 이 메뉴의 값으로 정했습니다/).first()).toBeVisible();
  });

  test("B4 재확인 2회째에 안전 중단 전용 화면", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: /시작하기/ }).click();
    await page.getByRole("button", { name: "잘 모르겠어요" }).click();
    await page.getByRole("button", { name: /다음/ }).click();

    // 남은 질문을 끝까지 답한다 (질문은 7개 고정)
    for (let i = 0; i < 6; i++) {
      if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
      await page.locator(".choices .choice").first().click();
      await page.getByRole("button", { name: /다음|추천 보기/ }).click();
    }

    // 1회차 — 경고는 뜨지만 중단 화면은 아니다
    await expect(page.getByText(/확실하지 않은 정보가 있어요/)).toBeVisible();
    await expect(page.getByRole("heading", { name: /확인이 어려워/ })).toHaveCount(0);

    // 조건 수정 → 그대로 다시 추천 → 2회차
    await page.getByRole("button", { name: "조건 수정" }).click();
    await page.getByRole("button", { name: /이 조건으로 추천 다시 받기/ }).click();
    await expect(page.getByRole("heading", { name: /확인이 어려워/ })).toBeVisible();
    await expect(page.getByText(/주문 준비는 시작되지 않았습니다/)).toBeVisible();
  });

  test("B5 화면 글씨 문답이 접근성 설정을 산출한다", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: "화면·안내 설정" }).click();
    await page.getByRole("button", { name: "화면 글씨 맞춰보기" }).click();
    await page.getByRole("button", { name: "조금 작아요" }).click();
    await page.getByRole("button", { name: "조금 작아요" }).click();
    await page.getByRole("button", { name: "잘 보여요" }).click();

    await expect(page.getByText(/큰 글씨·고대비·그림 안내를 켰습니다/)).toBeVisible();
    // 실제로 반영됐는지 — 루트 클래스로 확인
    await expect(page.locator(".app")).toHaveClass(/large/);
    await expect(page.locator(".app")).toHaveClass(/contrast/);
    await expect(page.locator(".app")).toHaveClass(/icons/);
  });

  test("B6 v3 저장본이 살아남고 v4 키로 옮겨진다", async ({ page }) => {
    await page.goto("http://localhost:5173/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("kb23c-saved-settings-v3", JSON.stringify({
        answers: { allergies: ["땅콩"], spicyLevel: "매운맛", boneType: "순살" },
        a11y: { largeText: true, highContrast: false },
        scope: "LASTING", savedAt: "2026-08-08T10:00:00.000Z",
      }));
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: /지난번 기록이 있어요/ })).toBeVisible();
    await expect(page.getByText(/땅콩/)).toBeVisible();

    const moved = await page.evaluate(() => ({
      v4: localStorage.getItem("kb23c-saved-settings-v4") !== null,
      v3: localStorage.getItem("kb23c-saved-settings-v3") === null,
    }));
    expect(moved.v4).toBe(true);
    expect(moved.v3).toBe(true);
  });

  test("B8 기기 간 인계 기능이 없으므로 관련 표현도 없다", async ({ page }) => {
    await start(page);
    await answerAll(page);
    await page.getByRole("button", { name: "네, 좋아요" }).click();
    await expect(page.getByRole("heading", { name: /마지막으로 확인/ })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/넘기기|다른 기기/);
  });

  test("B3 첫 질문은 항상 알레르기다 — 하드제약을 가장 먼저 확정한다", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: /시작하기/ }).click();
    await expect(page.locator("#qtitle")).toHaveText(/알레르기/);
  });

  test("B7 지난 주문 재현은 확인을 거쳐야 진행된다", async ({ page }) => {
    await page.goto("http://localhost:5173/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole("button", { name: /시작하기/ }).click();
    for (let i = 0; i < 7; i++) {
      if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
      await page.locator(".choices .choice").first().click();
      await page.getByRole("button", { name: /다음|추천 보기/ }).click();
    }
    await page.getByRole("button", { name: "네, 좋아요" }).click();

    // 확인 화면에는 저장 얘기가 없다 — 결제 직전에 다음 방문 판단을 시키지 않는다
    await expect(page.getByRole("heading", { name: /마지막으로 확인/ })).toBeVisible();
    await expect(page.getByText(/저장/)).toHaveCount(0);

    // 라이브(시뮬레이터 연결)면 "가상 키오스크에서 실행", 아니면 "주문 확정하기"
    const live = page.getByRole("button", { name: /가상 키오스크에서 실행/ });
    await ((await live.count()) > 0 ? live : page.getByRole("button", { name: /주문 확정하기/ })).click();

    // 주문이 끝난 뒤 결과 화면에서 한 번만 묻는다 (화면목록 S15)
    await expect(page.getByRole("heading", { name: /다음에도 쓰시게 저장할까요/ })).toBeVisible();
    await expect(page.getByRole("group", { name: "저장 범위" })).toHaveCount(0); // 범위는 묻지 않는다
    await page.getByRole("button", { name: /이 기기에 저장/ }).click();

    await page.getByRole("button", { name: "처음으로" }).first().click();
    await expect(page.getByRole("heading", { name: /지난번 기록이 있어요/ })).toBeVisible();

    // 저장된 것은 카드 하나에만 모인다 — "새로 시작"이 여러 곳에 흩어지지 않는다
    await expect(page.locator("section[aria-label='이 기기에 저장된 기록']")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /시작하기/ })).toHaveCount(1);

    await page.getByRole("button", { name: /지난번과 똑같이 주문하기/ }).click();
    // 실행으로 직행하지 않는다 — 확인을 거쳐야 한다
    await expect(page.getByRole("button", { name: "네, 좋아요" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /실행 결과|주문이 완성되었습니다/ })).toHaveCount(0);
  });

  /* C계열 — participant-ux.json 의 선언이 화면에서 실제로 동작하는가.
     수기 검토(MANUAL_REVIEW) 대상이라 선언과 화면이 어긋나면 그 자체가 감점이다. */
  test("C1 선언한 접근성 채널이 전부 화면을 실제로 바꾼다", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: "화면·안내 설정" }).click();

    // 상단바 토글과 이름이 겹치므로 설정 목록(.a11ylist) 안으로 범위를 좁힌다
    const app = page.locator(".app");
    const row = (name: string) => page.locator(".a11ylist .a11yrow", { hasText: name });

    // largeText 는 기본 켜짐 — 끄고 켜며 실제로 바뀌는지 확인
    await row("큰 글씨").click();
    await expect(app).not.toHaveClass(/large/);
    await row("큰 글씨").click();
    await expect(app).toHaveClass(/large/);

    await row("고대비").click();
    await expect(app).toHaveClass(/contrast/);

    await row("누르기 편하게").click();
    await expect(app).toHaveClass(/roomy/);   // LARGER_TOUCH_TARGETS

    await row("그림 함께 보기").click();
    await expect(app).toHaveClass(/icons/);   // VISUAL_GUIDANCE

    await row("직원 도움 먼저").click();
    await expect(page.locator(".staffbar")).toBeVisible(); // STAFF_HELP

    await row("소리 없이 보기").click();
    await page.getByRole("button", { name: "설정 마치기" }).click();
    await expect(page.getByText(/소리 안내를 사용하지 않습니다/)).toBeVisible(); // HEARING_SUPPORT
  });

  test("C3 QR 기능이 없으므로 화면에 QR 표현이 없다", async ({ page }) => {
    await start(page);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/QR|큐알/i);
  });

  test("B9 조건 수정의 메뉴 목록에 제외된 후보가 없다", async ({ page }) => {
    await start(page);
    await answerAll(page); // 땅콩·콩 알레르기 → 해당 후보 제외됨
    await page.getByRole("button", { name: "조건 수정" }).click();
    await page.getByRole("button", { name: /^메뉴/ }).click();

    const names = await page.locator(".editbody .choices .choice").allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    // 땅콩 토핑(PEANUT)·간장 순살(SOY)은 제외됐으므로 목록에 없어야 한다
    expect(names.join(" ")).not.toContain("땅콩 토핑");
    expect(names.join(" ")).not.toContain("간장 순살");
  });
});
