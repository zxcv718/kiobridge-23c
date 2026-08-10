/**
 * D계열 — 확인·수정·결과 화면 (S12·메뉴확인·S13·S14·S15).
 *
 * 실행: npx playwright test -c workspace/23C/tests/e2e/playwright.config.ts lane-d
 *
 * verify-b.spec.ts 가 «흐름이 이어지는가»를 보는 자리라면, 여기서는 그 흐름의 끝
 * 네 화면이 **무엇을 사실대로 말하는가**를 본다. 값이 아니라 «그 값이 어떻게 정해졌는지»,
 * 판정이 아니라 «판정을 낼 수 없다는 사실»이 화면에 남아 있는지가 검사 대상이다.
 */
import { expect, test, type Page } from "@playwright/test";

const start = async (page: Page) => {
  await page.goto("http://localhost:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: /닭강정 가게 주문/ })).toBeVisible();
};

/**
 * 시연 프리셋으로 추천 화면까지 간다.
 *
 * 마법사를 한 문항씩 누르지 않는 이유는 «빠르니까»가 아니다. 이 레인이 검사하는 것은
 * 추천 **이후**의 네 화면인데, 앞단(홈·프로필·질문)은 다른 레인이 동시에 고치고 있어
 * 거기서 나는 실패가 이 화면들의 실패로 보이게 된다. 프리셋은 입력만 채우고 추천은
 * 같은 엔진이 그 자리에서 계산하므로, 여기 도달한 뒤의 화면은 마법사 경로와 같다.
 */
async function toRecommend(page: Page, preset: RegExp) {
  await page.getByRole("button", { name: preset }).click();
}

/** 추천 → 장바구니 확인(S13). 프리셋 «박순자»는 조건을 전부 말한 정상 경로다. */
async function toCartReview(page: Page) {
  await toRecommend(page, /박순자/);
  // 추천 → 메뉴 확인 → 장바구니 확인 (통합에서 앞으로 가는 길이 이어졌다)
  await page.getByRole("button", { name: "네, 좋아요" }).click();
  await page.getByRole("button", { name: "이대로 담기" }).click();
  await expect(page.getByRole("heading", { name: /마지막으로 확인/ })).toBeVisible();
}

/** 주문을 확정해 결과 화면까지 간다 (라이브면 실행, 아니면 체험 모드 확정). */
async function finishOrder(page: Page) {
  const live = page.getByRole("button", { name: /가상 키오스크에서 실행/ });
  await ((await live.count()) > 0 ? live : page.getByRole("button", { name: /주문 확정하기/ })).click();
  await expect(page.getByRole("heading", { name: /실행 결과|주문이 완성되었습니다/ })).toBeVisible({ timeout: 20_000 });
}

test.describe("D계열 — 확인·수정·결과", () => {
  /* ───────── 메뉴 확인 (신규 · Figma 99:1762) ───────── */

  test("D1 장바구니 확인의 뒤로가기가 «메뉴 확인» 단계로 가고, 거기서 다시 담을 수 있다", async ({ page }) => {
    await start(page);
    await toCartReview(page);

    await page.getByRole("button", { name: "뒤로" }).click();
    await expect(page.getByRole("heading", { name: /이 메뉴를 선택하시겠어요/ })).toBeVisible();

    // 추천 화면에서 본 것과 같은 메뉴여야 한다 — 화면마다 다른 값을 적지 않는다
    await expect(page.getByText("매운 순살 닭강정").first()).toBeVisible();
    // 조건 문장의 조사가 앞말에 맞는다 — «땅콩가» 가 아니라 «땅콩이»
    await expect(page.locator(".mc-why")).toContainText("땅콩이 없는 메뉴 중");

    await page.getByRole("button", { name: "이대로 담기" }).click();
    await expect(page.getByRole("heading", { name: /마지막으로 확인/ })).toBeVisible();
  });

  test("D2 메뉴 확인에는 되돌아갈 길과 직원 도움이 있다", async ({ page }) => {
    await start(page);
    await toCartReview(page);
    await page.getByRole("button", { name: "뒤로" }).click();

    await expect(page.getByRole("button", { name: "직원 도움" }).first()).toBeVisible();
    await page.getByRole("button", { name: "다른 메뉴 볼게요" }).click();
    await expect(page.getByRole("button", { name: "네, 좋아요" })).toBeVisible();
  });

  /* ───────── S13 장바구니 확인 (Figma 99:1798) ───────── */

  test("D3 장바구니 확인은 실행계획을 읽어 각 옵션의 출처를 구분해 밝힌다", async ({ page }) => {
    await start(page);
    await toCartReview(page);

    const rows = page.locator(".sellist li[data-origin]");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(2);

    // 출처는 세 가지뿐이며 전부 글자로 설명된다 (색만으로 말하지 않는다)
    for (const o of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-origin")))) {
      expect(["USER", "AUTO", "SUBSTITUTED"]).toContain(o);
    }
    await expect(page.locator('.sellist li[data-origin="USER"]').first()).toContainText("고르신 대로");

    // 직접 고른 수량을 «상관없다고 하셔서»로 말하지 않는다
    const qty = page.locator(".sellist li", { hasText: "수량" });
    await expect(qty).toHaveAttribute("data-origin", "USER");
  });

  test("D4 장바구니 확인의 값이 실행계획과 어긋나지 않는다 (총 가격 = 단가 × 수량)", async ({ page }) => {
    await start(page);
    // 수량 2개인 프리셋 — 곱셈이 실제로 일어나는 경우로 잰다
    await toRecommend(page, /김영호/);
    await page.getByRole("button", { name: "네, 좋아요" }).click();
    await page.getByRole("button", { name: "이대로 담기" }).click();
    await expect(page.getByRole("heading", { name: /마지막으로 확인/ })).toBeVisible();

    const won = (s: string) => Number(s.replace(/[^\d]/g, ""));
    const unit = won(await page.locator(".cart-price").innerText());
    const qty = won(await page.locator(".cart-qty").innerText());
    const total = won(await page.locator(".cart-total b").innerText());
    expect(unit).toBeGreaterThan(0);
    expect(qty).toBe(2);
    expect(total).toBe(unit * qty);
  });

  test("D4b 원한 값을 못 맞춘 옵션은 대체했다고 밝힌다", async ({ page }) => {
    await start(page);
    await toRecommend(page, /박순자/);
    await page.getByRole("button", { name: "조건 수정" }).click();

    // 매운맛 + 뼈 로 바꾸면 «매운 뼈 닭강정»이 뽑히는데, 그 메뉴에는 일반컵이 없다
    await page.getByRole("button", { name: /^형태/ }).click();
    await page.getByRole("button", { name: "뼈", exact: true }).click();
    await page.getByRole("button", { name: /^컵/ }).click();
    await page.getByRole("button", { name: "일반컵" }).click();
    await page.getByRole("button", { name: /이 조건으로 추천 다시 받기/ }).click();
    await page.getByRole("button", { name: "네, 좋아요" }).click();
    await page.getByRole("button", { name: "이대로 담기" }).click();

    const sub = page.locator('.sellist li[data-origin="SUBSTITUTED"]');
    await expect(sub).toHaveCount(1);
    // 조사가 앞말에 맞아야 한다 — «일반컵는» 이 아니라 «일반컵은»
    await expect(sub).toContainText("원하신 일반컵은 이 메뉴에 없어 바꿨습니다");
    // 대체가 있으면 다른 메뉴를 볼 길을 함께 준다
    await expect(page.getByRole("button", { name: "다른 메뉴 보기" })).toBeVisible();
  });

  test("D5 장바구니 확인은 결제가 일어나지 않는다는 사실을 밝힌다", async ({ page }) => {
    await start(page);
    await toCartReview(page);
    await expect(page.getByText(/실제 결제·주문은 일어나지 않습니다/)).toBeVisible();
    await expect(page.getByRole("button", { name: "직원 도움" }).first()).toBeVisible();
  });

  /* ───────── S14 수정 (Figma 114:2008) ───────── */

  test("D6 수정 화면에서 글씨 크기·고대비·화면 안내를 바로 바꿀 수 있다", async ({ page }) => {
    await start(page);
    await toRecommend(page, /박순자/);
    await page.getByRole("button", { name: "조건 수정" }).click();

    const app = page.locator(".app");
    await expect(page.getByRole("heading", { name: /어떤 항목을 수정하고 싶으신가요/ })).toBeVisible();

    await page.getByRole("button", { name: "고대비 수정" }).click();
    await expect(app).toHaveClass(/contrast/);

    await page.getByRole("button", { name: "화면 안내 수정" }).click();
    await expect(app).toHaveClass(/icons/);

    await page.getByRole("button", { name: "글씨 크기 수정" }).click();
    await expect(app).not.toHaveClass(/large/);
  });

  test("D7 수정 화면에는 조건을 고쳐 다시 추천받는 길이 남아 있다", async ({ page }) => {
    await start(page);
    // 조건에 맞는 메뉴가 없는 경우 — 여기서 빠져나갈 길이 사라지면 막다른 길이 된다
    await toRecommend(page, /예산 5,000원/);
    await expect(page.getByRole("heading", { name: /조건에 맞는 메뉴가 없습니다/ })).toBeVisible();
    await page.getByRole("button", { name: "조건 수정하기" }).click();

    await page.getByRole("button", { name: /^예산/ }).click();
    await page.getByRole("button", { name: "없어요", exact: true }).click();
    await page.getByRole("button", { name: /이 조건으로 추천 다시 받기/ }).click();
    await expect(page.getByRole("button", { name: "네, 좋아요" })).toBeVisible();
  });

  /* ───────── S15 안내 (Figma 99:1830) ───────── */

  test("D8 결과 화면은 저장을 다시 «묻지» 않고 결과를 알린다", async ({ page }) => {
    await start(page);
    await toCartReview(page);
    await finishOrder(page);

    // 프로필 단계에서 이미 물었으므로 여기서 또 묻지 않는다
    await expect(page.getByText(/저장할까요/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "저장하지 않았습니다" })).toBeVisible();

    // 마음을 바꿀 길은 남아 있다 — 새 질문이 아니라 뒤집기 버튼 하나
    await page.getByRole("button", { name: /이 기기에 저장/ }).click();
    await expect(page.getByRole("heading", { name: "이 기기에 저장했습니다" })).toBeVisible();
    await expect(page.getByText(/저장할까요/)).toHaveCount(0);

    await page.getByRole("button", { name: /저장 지우기/ }).click();
    await expect(page.getByRole("heading", { name: "저장하지 않았습니다" })).toBeVisible();
  });

  test("D9 결과 화면은 무엇이 저장되는지를 항목으로 보여준다", async ({ page }) => {
    await start(page);
    await toCartReview(page);
    await finishOrder(page);
    await page.getByRole("button", { name: /이 기기에 저장/ }).click();

    const box = page.locator("section.savebox");
    await expect(box.getByText("메뉴명")).toBeVisible();
    await expect(box.getByText("알레르기")).toBeVisible();
    await expect(box.getByText("맵기 선호")).toBeVisible();
    await expect(box.getByText("수량")).toBeVisible();
  });

  test("D10 결과 화면의 직원 도움이 화면 끝까지 내려가지 않아도 닿는다", async ({ page }) => {
    await start(page);
    await toCartReview(page);
    await finishOrder(page);

    const staff = page.getByRole("button", { name: "직원 도움" }).first();
    await expect(staff).toBeVisible();
    const s = await staff.boundingBox();
    const save = await page.locator("section.savebox").boundingBox();
    expect(s).not.toBeNull();
    expect(save).not.toBeNull();
    // 저장 안내 카드보다 위에 있어야 한다 — 예전에 화면 맨 아래로 밀려난 회귀가 있었다
    expect(s!.y).toBeLessThan(save!.y);
  });

  test("D11 내려받기 두 파일의 방향 안내와 오류 주입 7종이 그대로 있다", async ({ page }) => {
    await start(page);
    await toCartReview(page);
    const live = await page.getByRole("button", { name: /가상 키오스크에서 실행/ }).count();
    /* 예전에는 여기서 test.skip 을 했다. 하지만 **스킵된 테스트는 증거가 아니다** —
       오류 주입 7종은 계약 시연의 핵심인데, API 가 꺼져 있다는 이유로 조용히 넘어가면
       그것이 사라져도 아무도 모른다. 공식 검증은 늘 API 를 띄운 채 돌리므로,
       안 떠 있으면 넘어가는 대신 이유와 해법을 말하며 멈춘다. */
    expect(live, "Simulation API(:4000)가 떠 있어야 이 검사를 할 수 있습니다 — `npm run start:api`")
      .toBeGreaterThan(0);

    await finishOrder(page);
    await expect(page.locator(".dlnote")).toContainText("서로 다른 파일입니다");
    await expect(page.locator(".errpanel .choice")).toHaveCount(7);
  });

  /* ───────── S12 안전 중단 (Figma 99:1337) ───────── */

  test("D12 안전 중단 화면은 직원 도움이 첫 번째 버튼이다", async ({ page }) => {
    await start(page);
    await toRecommend(page, /알레르기를 모르는 경우/);
    await expect(page.getByText(/확실하지 않은 정보가 있어요/)).toBeVisible();

    await page.getByRole("button", { name: "조건 수정" }).click();
    await page.getByRole("button", { name: /이 조건으로 추천 다시 받기/ }).click();

    await expect(page.getByRole("heading", { name: /확인이 어려워/ })).toBeVisible();
    await expect(page.getByText(/주문 준비는 시작되지 않았습니다/)).toBeVisible();

    const first = page.locator(".btnrow button").first();
    await expect(first).toHaveText("직원 도움");
  });
});
