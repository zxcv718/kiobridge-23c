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
  /** 알레르기를 «잘 모르겠어요» — 임의로 판단하지 않고 재확인을 요구한다 */
  unknown: ["잘 모르겠어요", "매운맛", "순살", "포장하기", "1개", "상관없어요", "없어요"],
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
    await toRecommend(page, CASE.twoQty);
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
    await toRecommend(page, CASE.normal);
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
    await toRecommend(page, CASE.normal);
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
    await toRecommend(page, CASE.noMatch);
    await expect(page.getByRole("heading", { name: /조건에 맞는 메뉴가 없어요/ })).toBeVisible();
    await page.getByRole("button", { name: /조건 수정/ }).click();

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

    const box = page;
    await expect(box.getByText("메뉴명")).toBeVisible();
    await expect(box.getByText("알레르기")).toBeVisible();
    await expect(box.getByText("맵기 선호")).toBeVisible();
    await expect(box.getByText("수량")).toBeVisible();
  });

  test("D10 결과 화면의 직원 도움이 화면 끝까지 내려가지 않아도 닿는다", async ({ page }) => {
    await start(page);
    await toCartReview(page);
    await finishOrder(page);

    /* 예전에는 «저장 안내 카드(section.savebox)보다 위인가»로 쟀다. 결과 화면이 카드를
       쌓지 않게 되면서 그 기준점 자체가 없어졌다 — 저장 결과는 이제 본문에 한 줄로
       녹아 있다. 지키려던 것은 «어느 카드보다 위»가 아니라 **끝까지 내려가지 않아도
       닿는다**였으므로, 이제 그것을 직접 잰다. 직원 도움은 화면 아래 CTA(.kb-actions)에
       있고 그 바깥에서 본문만 스크롤하므로, 내용이 아무리 길어도 첫 화면 안에 남는다.

       재는 대상이 문서에서 **본문(.kb-screen-body)**으로 바뀌었다. 문서 전체를 스크롤
       시키면 내용이 CTA 밑으로 지나가 «보이는데 안 눌리는» 버튼이 생겨서, 높이를 화면에
       못 박고 본문만 스크롤하도록 바꿨다(tap-target.spec.ts). 그래서 문서 스크롤은 늘 0
       이고, 여기서 «내용이 한 화면을 넘는가»는 본문 상자에게 물어야 한다. */
    const view = page.viewportSize()!;
    const scroll = await page.evaluate(() => {
      const body = document.querySelector(".kb-screen-body");
      return {
        over: body ? body.scrollHeight - body.clientHeight : -1,
        y: body ? body.scrollTop : -1,
      };
    });
    expect(scroll.y, "이 검사는 스크롤하지 않은 상태에서 재야 합니다").toBe(0);
    expect(scroll.over, "결과 화면이 한 화면에 들어와 이 검사가 무의미합니다").toBeGreaterThan(0);

    const staff = page.getByRole("button", { name: "직원 도움" }).first();
    await expect(staff).toBeVisible();
    const s = await staff.boundingBox();
    expect(s).not.toBeNull();
    expect(s!.y, "직원 도움이 첫 화면 위로 넘어갔습니다").toBeGreaterThanOrEqual(0);
    expect(s!.y + s!.height, `직원 도움이 첫 화면(${view.height}px) 밖으로 밀렸습니다 — 끝까지 내려가야 닿습니다`)
      .toBeLessThanOrEqual(view.height);
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

  test("D12 안전 중단 화면은 직원 도움이 첫 번째 버튼이다", async ({ page }) => {
    await start(page);
    await toRecommend(page, CASE.unknown);
    await expect(page.getByText(/확실하지 않은 정보가 있어요/)).toBeVisible();

    await page.getByRole("button", { name: "조건 수정" }).click();
    await page.getByRole("button", { name: /이 조건으로 추천 다시 받기/ }).click();

    await expect(page.getByRole("heading", { name: /확인이 어려워/ })).toBeVisible();
    /* «아무 준비도 시작되지 않았다»를 두 군데서 두 번 하던 말이 한 덩어리(.stopalert)로
       합쳐졌다. 문구가 옮겨 간 자리에서 같은 사실을 잰다. */
    await expect(page.locator(".stopalert"))
      .toContainText("실행 계획이 만들어지지 않았고, 장바구니에도 아무것도 담기지 않았습니다");

    /* 버튼은 .btnrow 가 아니라 화면 아래 붙는 CTA(.kb-actions)에 있다 — 자리만 옮겼을 뿐
       «직원 도움이 첫 번째»라는 이 화면의 존재 이유는 그대로 검사한다. */
    const first = page.locator(".kb-actions button").first();
    await expect(first).toHaveText("직원 도움");
  });
});
