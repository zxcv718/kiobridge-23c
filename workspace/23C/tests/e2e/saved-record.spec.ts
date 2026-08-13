/**
 * 저장본을 잃지 않는다 — 그리고 두 버튼이 하는 일을 헷갈리지 않게 못 박는다.
 *
 * 「이 기록 지우기」와 「새로 설정하기」가 같은 일을 한다고 읽힌 적이 있다.
 * 실제로는 다르다: 앞의 것은 그 자리에서 지우고, 뒤의 것은 지우지 않고 화면만 옮긴다.
 * 둘이 같아 보인다는 것은 화면이 그렇게 말하고 있다는 뜻이므로, 무엇이 다른지를
 * 검사로 남긴다 — 나중에 누가 하나를 없애려 할 때 여기서 걸린다.
 *
 * 그 확인 과정에서 데이터 손실 하나가 드러났다. S03 에서 「이 기기에 저장하기」를
 * 고르는 순간 지난번 답변이 빈 값으로 덮이고 있었다. **저장을 고른 사람이 잃는다.**
 */
import { expect, test, type Page } from "@playwright/test";
import { 아무거나답하고다음, 저장된내용펼치기, HOME, approveToCartReview, enterWizard, finishOrder, openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/** «새로 설정하기» → 되묻기 확인까지. 지우기는 되돌릴 수 없어 한 번 되묻는다. */
async function 새로시작(page: Page): Promise<void> {
  await page.getByRole("button", { name: "새로 설정하기" }).click();
  await page.getByRole("button", { name: /네, 지우고 새로 시작할게요/ }).click();
}

/* 저장소는 둘이다(QA 1차 2026-08-13) — 세션(답변·확정 메뉴)과 프로필(화면 설정).
   각자 저장·삭제가 따로 노는 것이 이 분리의 요지라, 검사도 두 키를 따로 읽는다. */
const 세션저장본 = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("kb23c-session-v1");
    return raw ? (JSON.parse(raw) as { answers?: Record<string, unknown> }) : null;
  });
const 프로필저장본 = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("kb23c-profile-v1");
    return raw ? (JSON.parse(raw) as { a11y?: Record<string, unknown> }) : null;
  });

/** 프로필(S04)과 세션(S15) 모두 «저장하기»로 주문을 마쳐 저장본을 만든 뒤 홈으로 돌아온다 */
async function 저장본만들기(page: Page): Promise<void> {
  await openHome(page);
  await enterWizard(page, true);
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
    await 아무거나답하고다음(page);
  }
  await approveToCartReview(page);
  await finishOrder(page, true); // S15 «오늘 입력한 내용을 저장할까요?» → 저장하기
  await page.goto(HOME);
  await page.getByRole("button", { name: "QR 없이 계속하기" }).click(); // 연동 관문을 지나 재방문 홈으로
  await expect(page.getByRole("heading", { name: /다시 오셨네요/ })).toBeVisible();
  expect((await 세션저장본(page))?.answers?.allergies, "세션 저장본이 만들어지지 않았습니다").toBeDefined();
  expect(await 프로필저장본(page), "프로필 저장본이 만들어지지 않았습니다").not.toBeNull();
}

test("«새로 설정하기»는 이름 그대로 지운다 — 세션과 프로필 모두", async ({ page }) => {
  await 저장본만들기(page);
  /* 한때 이 버튼은 지우지 않고 화면만 옮겼고, 지우기는 따로 한 장 더 있었다. 두 버튼이
     같은 뜻으로 읽힌다는 지적이 맞았다 — 이름이 하는 말과 코드가 하는 일이 달랐다. */
  await 새로시작(page);

  // «처음부터 새로 시작»은 완전 초기화다(QA 확정 2026-08-13) — 반쪽만 지우지 않는다
  expect(await 세션저장본(page), "«새로 설정»인데 지난 주문이 남아 있습니다").toBeNull();
  expect(await 프로필저장본(page), "«새로 설정»인데 화면 설정이 남아 있습니다").toBeNull();
});

test("되돌릴 수 없는 일이므로 한 번 되묻고, 아니라고 하면 그대로 둔다", async ({ page }) => {
  await 저장본만들기(page);
  const 원래세션 = await 세션저장본(page);
  const 원래프로필 = await 프로필저장본(page);

  await page.getByRole("button", { name: "새로 설정하기" }).click();
  /* 되묻는 자리에서만 이유를 말한다. 평소에 경고를 깔아 두면 지울 생각이 없는 사람까지
     매번 읽고, 정작 지우는 순간에는 새로울 것이 없어 그냥 지나친다. */
  await expect(page.getByRole("alert")).toContainText("되돌릴 수 없습니다");

  // 되돌릴 수 없는 쪽이 주 버튼이면 안 된다 — 습관적으로 첫 버튼을 누르는 사람이 있다
  const 아래 = await page.locator(".kb-actions button").allInnerTexts();
  expect(아래[0], "삭제가 첫 버튼입니다").toMatch(/아니요/);

  await page.getByRole("button", { name: /아니요/ }).click();
  expect(await 세션저장본(page), "«아니요»라고 했는데 세션이 지워졌습니다").toEqual(원래세션);
  expect(await 프로필저장본(page), "«아니요»라고 했는데 프로필이 지워졌습니다").toEqual(원래프로필);
  await expect(page.getByRole("button", { name: "새로 설정하기" })).toBeVisible();
});

test("저장된 내용을 지우지 않고 고칠 수 있다 — 가이드 4번의 «수정»", async ({ page }) => {
  await 저장본만들기(page);
  const 원래 = (await 세션저장본(page))!.answers!;

  await 저장된내용펼치기(page);
  await page.getByRole("button", { name: /저장된 내용 수정/ }).click();
  await expect(page.getByRole("heading", { name: /어떤 항목을 수정하고 싶으신가요/ })).toBeVisible();

  /* 고치러 왔는데 절반이 숨어 있으면 안 된다 — 여섯 항목이 전부 있어야 한다.
     기획 4행(카드)과 «다른 항목 수정»(접힘 — 이 경로에서는 저절로 펴진다)에 나뉘어 있다.
     (컵은 질문이 빠지면서 수정 항목에서도 빠졌다 — 물은 적 없는 값을 고치게 하지 않는다) */
  for (const 라벨 of ["뼈/순살 선택", "수량", "먹고가기/포장 선택"]) {
    await expect(page.locator(".kb-row .kb-rowlabel", { hasText: 라벨 }).first(),
      `수정 화면에 «${라벨}» 이 없습니다`).toBeVisible();
  }
  for (const 라벨 of ["알레르기", "맵기", "예산"]) {
    await expect(page.locator(".editrow .editlabel", { hasText: 라벨 }).first(),
      `수정 화면에 «${라벨}» 이 없습니다`).toBeVisible();
  }

  // 여는 것만으로는 아무것도 지워지지 않는다
  expect((await 세션저장본(page))!.answers).toEqual(원래);

  // 뒤로는 홈으로 — 추천을 받은 적이 없으므로 빈 추천 화면에 떨어지면 안 된다
  await page.getByRole("button", { name: /뒤로/ }).click();
  await expect(page.getByRole("heading", { name: /다시 오셨네요/ })).toBeVisible();
});

test("저장된 내용은 일부가 아니라 전부 보인다 — 가이드 4번의 «조회»", async ({ page }) => {
  await 저장본만들기(page);
  const 저장된답변 = Object.keys((await 세션저장본(page))!.answers!);
  await 저장된내용펼치기(page);
  const 보이는줄 = await page.locator(".kb-row .kb-rowlabel").allInnerTexts();
  /* 한때 알레르기와 맵기 둘만 보여줬다. 나머지 다섯은 저장되는데 확인할 방법이 없었고,
     어느 둘을 보여줄지 우리가 골랐던 것이다. */
  expect(보이는줄.length, `답변 ${저장된답변.length}개를 저장하면서 ${보이는줄.length}줄만 보여줍니다`)
    .toBeGreaterThanOrEqual(저장된답변.length);
});

test("S04 «이번만 사용»은 프로필을 남기지 않는다 — 그것이 사용자가 고른 뜻이다", async ({ page }) => {
  await 저장본만들기(page);
  await 새로시작(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용" }).click();
  expect(await 프로필저장본(page), "«이번만 사용»인데 프로필이 기기에 남아 있습니다").toBeNull();
});

test("S15 «이번만 사용»은 세션만 지운다 — 프로필(화면 설정)은 남는다", async ({ page }) => {
  /* QA 1차가 짚은 결함이 정확히 이 자리다: 세션을 지우면 프로필까지 같이 사라졌다.
     지난 주문을 남기지 않겠다는 결정이 화면 설정을 지우겠다는 뜻일 수는 없다. */
  await 저장본만들기(page);
  await page.getByRole("button", { name: "지난번과 똑같이 주문하기" }).click();
  await approveToCartReview(page);
  await finishOrder(page, false); // S15 에서 «이번만 사용»

  expect(await 세션저장본(page), "«이번만 사용»인데 세션이 남아 있습니다").toBeNull();
  expect(await 프로필저장본(page), "세션을 지웠는데 프로필까지 사라졌습니다").not.toBeNull();
});
