/**
 * 추천 화면(메뉴 확인)의 사유 정확도 — QA 1차 TC-CM-03 · TC-CM-04.
 *
 * 실행: npx playwright test -c workspace/23C/tests/e2e/playwright.config.ts reco-accuracy
 * 전제: 데모 UI 가 http://localhost:5173 에 떠 있어야 한다.
 *
 * 지키는 것 셋:
 *   ① [추천해요]에는 추천된 메뉴가 **실제로 만족하는** 조건만 적힌다 — 순한맛을 골랐는데
 *      매운맛 메뉴가 온 화면에 「순한맛이고」가 적히면 안 된다 (TC-CM-03)
 *   ② 선호와 어긋난 축(맵기·형태)은 [주의 필요]가 «무엇을 원했고 이 메뉴는 무엇인지»로
 *      말한다 — 직접 고른 메뉴도 같은 잣대다 (TC-CM-04)
 *   ③ 예산 초과는 «예산 {금액}원을 초과합니다» 형식으로 말한다. 예산은 상한이 아니라
 *      희망 금액이므로(엔진 계약) 초과 메뉴가 제외되는 게 아니라 이 문장이 남는 것이다.
 *
 * 조합: 순한맛·뼈·먹고 가기·예산 5,000원 → 엔진 1순위는 매운 뼈 닭강정(5,500원).
 * 맵기만 어긋나고 형태·이용 방식은 맞으며, 예산을 500원 넘는다.
 */
import { expect, test, type Page } from "@playwright/test";
import { answerWizard, enterWizard, openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

const 주의 = (page: Page) => page.getByRole("list", { name: "반영하지 못한 조건" });
const 추천 = (page: Page) => page.getByRole("list", { name: "추천 이유" });

/** 홈 → 순한맛·뼈·먹고 가기·예산 5,000원으로 답해 메뉴 확인까지. */
async function 순한맛뼈로추천받기(page: Page): Promise<void> {
  await openHome(page);
  await enterWizard(page);
  await answerWizard(page, [null, "순한맛", "뼈", "먹고 가기", null, "5,000원"]);
  await expect(page.getByRole("heading", { level: 2, name: /이 메뉴를 선택하시겠어요/ })).toBeVisible();
}

test("어긋난 맵기는 추천해요가 아니라 주의 필요가 말한다 (TC-CM-03①·04①)", async ({ page }) => {
  await 순한맛뼈로추천받기(page);
  await expect(page.locator(".cart-name")).toHaveText("매운 뼈 닭강정");

  // 어긋난 축 — 주의 필요가 «원한 것»과 «실제»를 함께 말한다
  await expect(주의(page)).toContainText("원하신 맵기는 순한맛인데, 이 메뉴는 매운맛입니다");
  // 추천해요에는 어긋난 맵기 이야기가 없다 — 맞은 형태(뼈)만 남는다
  await expect(추천(page)).not.toContainText("순한맛");
  await expect(추천(page)).toContainText("뼈");
});

test("예산 초과는 «예산 5,000원을 초과합니다» 형식으로 말한다 (TC-CM-04②)", async ({ page }) => {
  await 순한맛뼈로추천받기(page);
  await expect(주의(page)).toContainText("예산 5,000원을 초과합니다 — 이 메뉴는 5,500원입니다");
});

test("직접 고른 메뉴도 같은 잣대다 — 사유·주의 필요가 고른 메뉴 기준으로 바뀐다 (TC-CM-03②)", async ({ page }) => {
  await 순한맛뼈로추천받기(page);

  // 다른 메뉴 카드에서 순한 순살 닭강정(순한맛·순살·6,000원)을 직접 고른다
  // (메뉴 선택 화면은 QA 5차 후속으로 없어졌다 — 직접 선택은 이 카드의 몫이다)
  await page.locator(".mc-altcard", { hasText: "순한 순살 닭강정" }).click();

  await expect(page.locator(".cart-name")).toHaveText("순한 순살 닭강정");
  // 이제 맵기는 맞아서 추천해요로 돌아오고, 형태(뼈)는 어긋나서 주의 필요로 간다
  await expect(추천(page)).toContainText("순한맛");
  await expect(추천(page)).not.toContainText("뼈가 가능하며");
  await expect(주의(page)).toContainText("원하신 형태는 뼈인데, 이 메뉴는 순살입니다");
  await expect(주의(page)).not.toContainText("맵기");
  // 예산 문장도 고른 메뉴(6,000원)로 다시 잰다
  await expect(주의(page)).toContainText("예산 5,000원을 초과합니다 — 이 메뉴는 6,000원입니다");
});
