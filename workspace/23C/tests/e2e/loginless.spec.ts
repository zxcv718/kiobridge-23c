/**
 * 무로그인 가이드(docs/LOGINLESS_QR_PROFILE_GUIDE.md)가 요구하는 것을 화면에서 확인한다.
 *
 * «지켰다»고 문서에 적는 것과 화면이 실제로 그렇게 도는 것은 다르다. 특히 6번(삭제)은
 * 조용히 지우고 있었다 — 화면이 첫 방문 상태로 바뀌는 것만으로 사용자가 «지워진 건가»를
 * 추측해야 했다. 문서를 읽고 나서야 알았고, 읽지 않았으면 몰랐을 것이다.
 *
 * 그래서 조항 번호를 그대로 검사 이름에 적는다. 나중에 문서가 바뀌면 어느 검사를
 * 손봐야 하는지 바로 보인다.
 */
import { expect, test, type Page } from "@playwright/test";
import { 아무거나답하고다음, HOME, approveToCartReview, enterWizard, finishOrder, openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/**
 * 저장본을 만들고 홈으로 돌아온다.
 *
 * **주문을 끝까지 마쳐야 한다.** S03 에서 «저장하기»를 고른 시점에 한 번 남기지만
 * 그때는 아직 답변이 없다 — 답변과 확정된 메뉴는 주문이 끝날 때 남는다. 질문만 답하고
 * 멈추면 «화면 설정»만 든 저장본이 되어, 저장 내용을 재는 검사가 헛돌게 된다.
 */
async function 저장하고재방문(page: Page): Promise<void> {
  await openHome(page);
  await enterWizard(page, true);
  for (let i = 0; i < 7; i++) {
    if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
    await 아무거나답하고다음(page);
  }
  await approveToCartReview(page);
  await finishOrder(page);
  await page.goto(HOME);
  await expect(page.getByRole("heading", { name: /다시 오셨네요/ })).toBeVisible();
}

test("1·2번 — 로그인 없이 바로 시작할 수 있고, 계정을 요구하는 곳이 없다", async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole("button", { name: /^시작하기$/ })).toBeEnabled();
  const 본문 = await page.locator("body").innerText();
  expect(본문, "로그인·회원가입을 요구하고 있습니다").not.toMatch(/로그인하기|회원가입|아이디|비밀번호/);
});

test("3번 — 실제 개인정보를 받는 칸이 없다", async ({ page }) => {
  await openHome(page);
  await enterWizard(page);
  const 칸 = await page.locator("input, textarea").evaluateAll((els) =>
    els.map((e) => `${e.getAttribute("name") ?? ""} ${e.getAttribute("placeholder") ?? ""}`));
  for (const c of 칸) {
    expect(c, `개인정보를 받는 칸으로 보입니다: ${c}`)
      .not.toMatch(/이름|전화|연락처|생년월일|주민|카드|이메일/);
  }
});

test("4번 — 저장된 것을 홈에서 조회할 수 있다", async ({ page }) => {
  await 저장하고재방문(page);
  /* 카드 이름은 aria-label 이라 눈에 보이는 글자가 아니다 — 화면 낭독기에게 «이 덩어리가
     무엇인지»를 알려주는 이름이다. 그래서 글자가 아니라 영역으로 찾는다. */
  await expect(page.getByRole("region", { name: "이 기기에 저장된 기록" })).toBeVisible();
  // 무엇이 들어 있는지 항목으로 보여준다 — «설정이 있습니다» 한 줄로 때우지 않는다
  const 줄수 = await page.locator(".kb-row").count();
  expect(줄수, "저장된 내용을 항목으로 보여주지 않습니다").toBeGreaterThan(1);
});

test("5번 — «이번 한 번만»이 기본값이다", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();

  await expect(page.getByRole("button", { name: "이번만 사용하기" })).toBeVisible();
  // 아무것도 고르지 않은 채로는 아무것도 저장되지 않는다
  const 저장됨 = await page.evaluate(() => localStorage.getItem("kb23c-saved-settings-v4") !== null);
  expect(저장됨, "고르기도 전에 저장돼 있습니다").toBe(false);
});

test("6번 — 한 번의 조작으로 지워지고, 지웠다고 알린다", async ({ page }) => {
  await 저장하고재방문(page);

  /* «한 번의 조작» — 버튼 하나로 끝나야 한다.
     한때 지우기 버튼이 따로 한 장 있었는데, 「처음부터 새로 시작하기」와 뜻이 겹쳐
     같은 일처럼 읽혔다. 이름이 이미 «지난 것을 버리고 시작한다»는 뜻이므로 그 버튼이
     지우게 하고 한 장으로 합쳤다. 조작 수는 그대로 하나다. */
  await page.getByRole("button", { name: "처음부터 새로 시작하기" }).click();

  await expect(page.getByRole("status"), "지웠다고 알리지 않습니다 — 화면이 바뀐 것으로 추측하게 됩니다")
    .toContainText("지웠습니다");
  const 남았나 = await page.evaluate(() => localStorage.getItem("kb23c-saved-settings-v4"));
  expect(남았나, "지웠다고 했는데 기기에 남아 있습니다").toBeNull();
});

test("8번 — 저장된 설정을 조용히 적용하지 않는다", async ({ page }) => {
  await 저장하고재방문(page);
  /* 되살리기는 «보여준 뒤 누르는 것»이어야 한다. 홈에 내용이 보이고, 누르기 전까지는
     아무 화면도 그 설정으로 바뀌지 않는다. 공용 기기라면 앞사람 설정일 수 있다. */
  await expect(page.getByText("자동으로 적용하지 않으니")).toBeVisible();
  await expect(page.getByRole("button", { name: /지난번과 똑같이 주문하기|저장된 설정으로 시작하기/ }))
    .toBeVisible();
});

test("QR 1번 — 읽은 값을 개인정보로 다루지 않고, 환경 대조까지만 한다", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용하기" }).click();

  const 본문 = await page.locator("body").innerText();
  // 하지 않은 일을 한 것처럼 말하지 않는다 — 세션 «발급»은 서버가 필요하고 우리는 안 한다
  expect(본문, "발급하지 않은 세션을 발급했다고 말하고 있습니다").not.toMatch(/세션이 발급|세션을 발급했/);
});
