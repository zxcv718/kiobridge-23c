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
import { answerWizard, approveToCartReview, enterWizard, finishOrder as goFinish, openHome } from "./nav";

const start = openHome;

/**
 * 질문 7개를 답해 추천 화면까지 간다.
 *
 * 예전에는 시연 프리셋 버튼 하나로 갔지만 그 카드를 없앴다. 이제는 사용자와 **같은 길**을
 * 걷는다 — 느리지만, 앞단이 깨지면 여기서도 깨지는 편이 낫다. 프리셋으로 건너뛰면
 * 「추천 이후는 멀쩡한데 거기 갈 수가 없는」 상태를 못 잡는다.
 */
const CASE = {
  /** 땅콩 알레르기 · 매운맛 · 순살 · 포장 · 1개 · 종이컵 · 7,000원 — 정상 경로 */
  normal: ["땅콩", "매운맛", "순살", "포장하기", "1개", "종이컵", "7,000원"],
  /** 알레르기 없음 · 순한맛 · 순살 · 먹고 가기 · 2개 · 일반컵 · 예산 없음 — 수량 2개 */
  twoQty: ["없어요", "순한맛", "순살", "먹고 가기", "2개", "일반컵", "없어요"],
  /** 예산 5,000원 — 이 가게 최저가(5,500원)보다 낮아 조건에 맞는 메뉴가 없다 */
  noMatch: ["없어요", "매운맛", "순살", "포장하기", "1개", "상관없어요", "5,000원"],
} as const;

async function toRecommend(page: Page, picks: readonly string[]) {
  await enterWizard(page);
  await answerWizard(page, [...picks]);
}

async function toCartReview(page: Page) {
  await toRecommend(page, CASE.normal);
  await approveToCartReview(page);
}

const finishOrder = goFinish;

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
    await expect(page.locator(".reasons").first()).toContainText("땅콩이 들어간 메뉴");

    await page.getByRole("button", { name: "선택하기", exact: true }).click();
    await expect(page.getByRole("button", { name: "주문하기", exact: true })).toBeVisible();
  });

  test("D2 메뉴 확인에는 되돌아갈 길이 있다", async ({ page }) => {
    await start(page);
    await toCartReview(page);
    await page.getByRole("button", { name: "뒤로" }).click();

    // 추천을 받아들이지 않을 길 — «다시 추천받기»가 조건 수정 화면으로 잇는다
    await page.getByRole("button", { name: "다시 추천받기" }).click();
    await expect(page.getByRole("heading", { name: /어떤 항목을 수정하고 싶으신가요/ })).toBeVisible();
  });

  /* ───────── S13 장바구니 확인 (Figma 99:1798) ───────── */

  test("D3 장바구니 확인은 실행계획을 읽어 각 옵션의 출처를 구분해 밝힌다", async ({ page }) => {
    await start(page);
    await toCartReview(page);

    /* 시안 재정렬(99:1798)로 목록에는 주문 방식(이용 방식·컵) 두 줄만 남고,
       맵기·형태는 카드의 «옵션:» 줄이, 수량은 «x N개»가 말한다. */
    const rows = page.locator(".sellist li[data-origin]");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(2);

    // 출처는 세 가지뿐이며 전부 글자로 설명된다 (색만으로 말하지 않는다)
    for (const o of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-origin")))) {
      expect(["USER", "AUTO", "SUBSTITUTED"]).toContain(o);
    }
    await expect(page.locator('.sellist li[data-origin="USER"]').first()).toContainText("고르신 대로");

    /* 직접 고른 수량을 «상관없다고 하셔서»로 말하지 않는다 — 카드의 수량 보조줄은
       우리가 정했거나 바꿨을 때만 붙는다(이 흐름에서는 사용자가 골랐으므로 없어야 한다) */
    await expect(page.locator(".cart-box")).not.toContainText("수량:");
  });

  test("D4 장바구니 확인의 값이 실행계획과 어긋나지 않는다 (총 가격 = 단가 × 수량)", async ({ page }) => {
    await start(page);
    // 수량 2개인 프리셋 — 곱셈이 실제로 일어나는 경우로 잰다
    await toRecommend(page, CASE.twoQty);
    await page.getByRole("button", { name: "선택하기", exact: true }).click();
    await expect(page.getByRole("button", { name: "주문하기", exact: true })).toBeVisible();

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
    await toRecommend(page, CASE.normal);
    await page.getByRole("button", { name: "다시 추천받기" }).click();

    // 매운맛 + 뼈 로 바꾸면 «매운 뼈 닭강정»이 뽑히는데, 그 메뉴에는 일반컵이 없다
    await page.getByRole("button", { name: /^뼈\/순살 선택/ }).click();
    await page.getByRole("button", { name: "뼈", exact: true }).click();
    // 컵은 기획 4행 밖이라 «다른 항목 수정» 접힘 안에 있다
    await page.locator("details.home-saved > summary", { hasText: "다른 항목 수정" }).click();
    await page.getByRole("button", { name: /^컵/ }).click();
    await page.getByRole("button", { name: "일반컵" }).click();
    await page.getByRole("button", { name: "수정 완료" }).click();
    await page.getByRole("button", { name: "선택하기", exact: true }).click();

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
  });

  /* ───────── S14 수정 (Figma 114:2008) ───────── */

  test("D6 수정 화면에서 글씨 크기·고대비·화면 안내를 바로 바꿀 수 있다", async ({ page }) => {
    await start(page);
    await toRecommend(page, CASE.normal);
    await page.getByRole("button", { name: "다시 추천받기" }).click();

    const app = page.locator(".app");
    await expect(page.getByRole("heading", { name: /어떤 항목을 수정하고 싶으신가요/ })).toBeVisible();
    // 화면 보기 방식은 기획 4행 밖이라 «다른 항목 수정» 접힘 안으로 옮겨졌다
    await page.locator("details.home-saved > summary", { hasText: "다른 항목 수정" }).click();

    await page.getByRole("button", { name: "고대비 수정" }).click();
    await expect(app).toHaveClass(/contrast/);

    await page.getByRole("button", { name: "화면 안내 수정" }).click();
    await expect(app).toHaveClass(/guide/);

    await page.getByRole("button", { name: "글씨 크기 수정" }).click();
    await expect(app).not.toHaveClass(/large/);
  });

  test("D7 수정 화면에는 조건을 고쳐 다시 추천받는 길이 남아 있다", async ({ page }) => {
    await start(page);
    // 조건에 맞는 메뉴가 없는 경우 — 여기서 빠져나갈 길이 사라지면 막다른 길이 된다
    await toRecommend(page, CASE.noMatch);
    await expect(page.getByRole("heading", { name: /조건에 맞는 메뉴가 없어요/ })).toBeVisible();
    await page.getByRole("button", { name: /조건 수정/ }).click();

    // «조건에 맞는 메뉴 없음»으로 왔으므로 «다른 항목 수정»(예산 포함)이 저절로 펴져 있다
    await page.getByRole("button", { name: /^예산/ }).click();
    await page.getByRole("button", { name: "없어요", exact: true }).click();
    await page.getByRole("button", { name: "수정 완료" }).click();
    await expect(page.getByRole("button", { name: "선택하기", exact: true })).toBeVisible();
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
    await page.getByRole("button", { name: "이 기기에 저장하기" }).click();
    await expect(page.getByRole("heading", { name: "이 기기에 저장했습니다" })).toBeVisible();
    await expect(page.getByText(/저장할까요/)).toHaveCount(0);

    await page.getByRole("button", { name: /저장 지우기/ }).click();
    await expect(page.getByRole("heading", { name: "저장하지 않았습니다" })).toBeVisible();
  });

  test("D9 결과 화면은 무엇이 저장되는지를 항목으로 보여준다", async ({ page }) => {
    await start(page);
    await toCartReview(page);
    await finishOrder(page);
    await page.getByRole("button", { name: "이 기기에 저장하기" }).click();

    const box = page;
    await expect(box.getByText("메뉴명")).toBeVisible();
    await expect(box.getByText("알레르기")).toBeVisible();
    await expect(box.getByText("맵기 선호")).toBeVisible();
    await expect(box.getByText("수량")).toBeVisible();
  });


  test("D11 내려받기 두 파일의 방향 안내와 오류 주입 7종이 그대로 있다", async ({ page }) => {
    await start(page);
    await toCartReview(page);
    /* CTA 가 시안 라벨 «주문하기» 하나가 되면서, 라이브 여부는 라이브에서만 나오는
       세션 ID 입력칸으로 잰다. */
    const live = await page.getByText(/공식 시뮬레이터 세션에 제출하기/).count();
    /* 예전에는 여기서 test.skip 을 했다. 하지만 **스킵된 테스트는 증거가 아니다** —
       오류 주입 7종은 계약 시연의 핵심인데, API 가 꺼져 있다는 이유로 조용히 넘어가면
       그것이 사라져도 아무도 모른다. 공식 검증은 늘 API 를 띄운 채 돌리므로,
       안 떠 있으면 넘어가는 대신 이유와 해법을 말하며 멈춘다. */
    expect(live, "Simulation API(:4000)가 떠 있어야 이 검사를 할 수 있습니다 — `npm run start:api`")
      .toBeGreaterThan(0);

    await finishOrder(page);
    await expect(page.locator(".dlnote")).toContainText("서로 다른 파일입니다");

    /* 오류 주입 7종은 «정상 결과»를 먼저 읽은 사람이 스스로 여는 자리로 내려갔다
       (.errpanel → details.resmore). **없앤 것이 아니라 접은 것**이므로, 접혀 있다는
       이유로 세지 않고 끝내면 정말 사라진 날에도 통과한다. 열어서 일곱 개가
       실제로 눌리는 자리에 있는지까지 본다. */
    const inject = page.locator("details.resmore", {
      has: page.locator("summary", { hasText: "일부러 틀려 보기" }),
    });
    await expect(inject).toHaveCount(1);
    await inject.locator("summary").click();
    await expect(inject.locator(".choices .choice")).toHaveCount(7);
    await expect(inject.locator(".choices .choice").first()).toBeVisible();
  });

  /* ───────── S12 안전 중단 (Figma 99:1337) ───────── */

  test("D12 안전 중단은 시안 그대로 그리고, 빠져나갈 길을 하나 더 남긴다", async ({ page }) => {
    await start(page);
    await toRecommend(page, CASE.noMatch);
    await page.getByRole("button", { name: "조건 수정" }).click();
    await page.getByRole("button", { name: "수정 완료" }).click();

    /* 시안 99:1337 의 네 조각이 그 순서로 다 있다 — 에러 라벨 · 일러스트 · 타이틀 · 서브텍스트. */
    await expect(page.getByRole("heading", { name: /추천 메뉴를 찾지 못했습니다/ })).toBeVisible();
    await expect(page.locator(".stop-figma-label")).toHaveText("ERROR");
    await expect(page.locator(".stop-figma-illus img")).toHaveCount(1);

    /* 시안은 «매장 직원에게 말씀해 주세요»를 문장으로 두고 버튼은 하나뿐이다.
       직원 호출 버튼을 두지 않는다. 시안 버튼이 주 동작이고, 조건을 고쳐 빠져나갈 길은
       그 아래에 남긴다 — 없으면 두 번 답한 사람에게 이 화면이 막다른 길이 된다. */
    await expect(page.getByText(/매장 직원에게 말씀해 주세요/)).toBeVisible();
    await expect(page.getByRole("button", { name: "직원 도움" })).toHaveCount(0);
    const 버튼 = page.locator(".kb-actions button");
    await expect(버튼.first()).toHaveText("처음으로 돌아가기");
    await expect(버튼.nth(1)).toHaveText("조건 다시 보기");

    /* 일러스트는 고정 px 이라, 글자가 커지는 설정과 겹치면 화면을 밀어낸다.
       본문은 스크롤 상자라 CTA 가 밀려나지는 않지만, 세로 가운데 정렬은 넘칠 때
       **위쪽을 스크롤로 되돌아갈 수 없게** 자른다 — 실제로 360×640 에서 «ERROR» 가
       9px 잘렸다. 가장 불리한 조합(작은 화면 + 큰 글씨 + 누르기 편하게)에서 잰다. */
    await page.setViewportSize({ width: 360, height: 640 });
    await page.evaluate(() => document.querySelector(".app")?.classList.add("large", "roomy"));
    const 잘림 = await page.evaluate(() => {
      const b = document.querySelector(".kb-screen-body") as HTMLElement;
      const lab = document.querySelector(".stop-figma-label") as HTMLElement;
      return lab.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });
    expect(잘림, "머리말이 본문 상자 위로 잘렸습니다").toBeGreaterThanOrEqual(0);
    await expect(page.locator(".stop-figma-label")).toBeInViewport();
    await expect(버튼.first()).toBeInViewport();
  });
});
