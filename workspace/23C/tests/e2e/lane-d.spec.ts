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
 * 질문 6개를 답해 추천 화면까지 간다.
 *
 * 예전에는 시연 프리셋 버튼 하나로 갔지만 그 카드를 없앴다. 이제는 사용자와 **같은 길**을
 * 걷는다 — 느리지만, 앞단이 깨지면 여기서도 깨지는 편이 낫다. 프리셋으로 건너뛰면
 * 「추천 이후는 멀쩡한데 거기 갈 수가 없는」 상태를 못 잡는다.
 */
const CASE = {
  /** 땅콩 알레르기 · 매운맛 · 순살 · 포장 · 1개 · 10,000원 — 정상 경로
      (예산 눈금이 셋으로 줄며 7,000원이 없어졌다 — 10,000원이어도 1위는 같다) */
  normal: ["땅콩", "매운맛", "순살", "포장하기", "1개", "10,000원"],
  /** 알레르기 없음 · 순한맛 · 순살 · 먹고 가기 · 2개 · 예산 상관없음 — 수량 2개 */
  twoQty: ["없어요", "순한맛", "순살", "먹고 가기", "2개", "상관없어요"],
} as const;

/**
 * 확정되지 않은 추천에 닿는 길 — **저장본에 남은 「모름」**.
 *
 * 한때는 예산 5,000원으로 «조건에 맞는 메뉴가 없어요»를 만들었다. 예산이 상한이 아니라
 * 희망 금액이 된 뒤로 가격은 후보를 빼지 않으므로 그 길은 없어졌다. 기획이 없애려 한
 * 것이 정확히 그 화면이다 — 조건이 조금 안 맞아도 가장 가까운 것을 권한다.
 *
 * 안전 중단(S12)은 그 화면과 다른 것이고 없어지지 않았다. 알레르기가 **미확인**이면
 * 임의로 판단하지 않고 재확인을 요구하며, 두 번째에도 확정되지 않으면 멈춘다. 「모름」은
 * 시안에 없어 화면에서 고를 수 없지만 값 자체는 살아 있다(model.ts) — 옛 저장본이나
 * 대리 입력으로 들어온다. 여기서 재는 것이 바로 그 경로다.
 */
const 모름저장본 = {
  answers: { allergies: ["모름"], spicyLevel: "매운맛", boneType: "순살", serviceType: "포장", quantity: 1, budgetKrw: "없음" },
  a11y: { largeText: true, highContrast: false, simpleSteps: true, visualGuidance: false,
          hearingSupport: false, mobilitySupport: false, staffAssistancePreferred: false, preferredInput: "TOUCH" },
  scope: "LASTING", savedAt: "2026-08-11T10:00:00.000Z",
};

/** 저장본을 심고 «지난번과 똑같이 주문하기»로 1회차 추천까지 간다 (아직 중단 화면이 아니다) */
async function 미확정추천까지(page: Page) {
  await page.goto("http://localhost:5173/");
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem("kb23c-saved-settings-v4", JSON.stringify(s));
  }, 모름저장본);
  await page.reload();
  await page.getByRole("button", { name: "QR 없이 계속하기" }).click(); // 연동 관문을 지나 재방문 홈으로
  await page.getByRole("button", { name: /지난번과 똑같이 주문하기/ }).click();
}

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

    /* 시안 재정렬(99:1798)로 목록에는 주문 방식(이용 방식)만 남고, 맵기·형태는 카드의
       «옵션:» 줄이, 수량은 «x N개»가 말한다. 컵 줄은 질문이 빠지면서 같이 사라졌다 —
       실행계획이 CUP 액션을 사용자가 컵을 말했을 때만 만든다(core/plan.ts). */
    const rows = page.locator(".sellist li[data-origin]");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(1);

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

    /* 순한맛 + 뼈 로 바꾸면 «간장 순살 닭강정»(6,500원)이 뽑힌다. 예산이 상한이 아니라
       **희망 금액**이라 10,000원에 가장 가까운 생존 후보가 위로 오는데(7,000원 땅콩
       토핑은 알레르기로 제외), 뼈를 내는 메뉴는 이 가게에서 5,500원짜리 하나뿐이라
       «뼈»가 밀린다. 그래서 못 맞추는 것은 형태다.

       이 자리는 두 번 옮겼다 — 처음엔 컵(질문이 없어짐), 다음엔 맵기(예산 방식이 바뀜).
       재는 대상은 세 번 다 같다: **못 맞춘 옵션을 사용자에게 밝히는가.** */
    // 뼈/순살은 기획 4행에서 바로, 맵기는 «다른 항목 수정» 접힘 안에서 고친다
    await page.getByRole("button", { name: /^뼈\/순살 선택/ }).click();
    await page.getByRole("button", { name: "뼈", exact: true }).click();
    await page.locator("details.home-saved > summary", { hasText: "다른 항목 수정" }).click();
    await page.getByRole("button", { name: /^맵기/ }).click();
    await page.getByRole("button", { name: "순한맛", exact: true }).click();
    await page.getByRole("button", { name: "수정 완료" }).click();
    await page.getByRole("button", { name: "선택하기", exact: true }).click();

    /* 형태는 시안 재정렬(99:1798) 뒤로 «주문 방식» 목록이 아니라 카드 관할이다 —
       대체 사실과 이유는 카드 보조줄이 말한다.
       조사가 앞말에 맞아야 한다 — 받침이 없는 «뼈» 는 «뼈는» 이다(«뼈은» 이 아니다). */
    const sub = page.locator(".cart-box .cart-sub", { hasText: "바꿨습니다" });
    await expect(sub).toHaveCount(1);
    await expect(sub).toContainText("형태");
    await expect(sub).toContainText("원하신 뼈는 이 메뉴에 없어 바꿨습니다");
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
    // 알레르기가 미확인이라 확정되지 않은 추천 — 여기서 빠져나갈 길이 없으면 막다른 길이 된다
    await 미확정추천까지(page);
    // 조건을 고치러 가는 길은 «다시 추천받기»다 — 합쳐진 메뉴 확인 화면의 라벨(기획 목업)
    await page.getByRole("button", { name: "다시 추천받기" }).click();

    /* 미확인을 «없음»으로 바로잡으면 확정된 추천으로 빠져나간다.
       재확인 경로라 «다른 항목 수정»(알레르기 포함)은 저절로 펴져서 온다.
       선택지 이름에는 그림이 함께 들어가므로(«✅ 없어요») 정확 일치로는 못 잡고,
       다른 행에도 같은 글자가 나올 수 있어 알레르기 행 안으로 범위를 좁힌다.
       행이 열려 있는지는 단정하지 않는다 — 열린 행을 한 번 더 누르면 도로 접혀
       선택지가 사라진다(실제로 그렇게 걸렸다). */
    const 알레르기행 = page.locator(".editrow", { hasText: "알레르기" });
    const 없어요 = 알레르기행.locator("button", { hasText: "없어요" });
    if (!(await 없어요.isVisible().catch(() => false))) {
      await 알레르기행.locator("button").first().click();
    }
    await 없어요.click();
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
    /* 첫 미확정에서는 멈추지 않는다 — 조건을 고칠 기회를 한 번 준다. 그대로 다시 받으면
       두 번째이고, 그때 멈춘다(core/ask.ts MAX_RECONFIRM_ATTEMPTS). */
    await 미확정추천까지(page);
    await page.getByRole("button", { name: "다시 추천받기" }).click();
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
