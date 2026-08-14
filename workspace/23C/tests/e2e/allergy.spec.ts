/**
 * 알레르기는 두 걸음이다 — 디자인 S06 기본(99:1228) / 확장(99:1246).
 *
 * 한 화면에 「없어요 + 6종」을 늘어놓았던 것을 시안대로 되돌렸다.
 * 여기서 지키는 것은 «시안과 같아 보이는가»가 아니라 다음 넷이다:
 *   ① 알레르기가 없는 사람은 항목 목록을 아예 보지 않는다
 *   ② 확실하지 않은 사람이 「있어요/없어요」 중 하나를 억지로 고르게 되지 않는다 —
 *      목록 걸음의 「잘 모르겠어요」가 그 답이다(QA 1차 TC-CM-01 · PO 확정 2026-08-13)
 *   ③ 항목을 하나도 안 고른 채로는 넘어가지 못한다 (빈 답 ≠ 알레르기 없음)
 *   ④ 모름이 풀리지 않은 채 두 번째 추천까지 가면 안전 중단(S12)이 실제로 열린다
 */
import { expect, test, type Page } from "@playwright/test";
import { openHome, 아무거나답하고다음 } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/** 홈 → 첫 질문(알레르기)까지. 화면 설정은 기본값 그대로 지나간다. */
async function 알레르기질문까지(page: Page): Promise<void> {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용" }).click();
  await page.getByRole("button", { name: /^(주문 시작하기|아니오)$/ }).click();
  await expect(page.locator("#qtitle")).toHaveText(/알레르기가 있으신가요/);
}

test("첫 걸음은 있는지만 묻는다 — 항목 목록을 보여주지 않는다", async ({ page }) => {
  await 알레르기질문까지(page);

  await expect(page.getByRole("button", { name: "없어요", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "있어요", exact: true })).toBeVisible();
  for (const 항목 of ["땅콩", "우유", "계란", "밀", "새우"]) {
    await expect(page.getByRole("button", { name: 항목, exact: true }),
      `«${항목}»이 첫 걸음에 보이면 안 됩니다`).toHaveCount(0);
  }
});

test("«없어요»를 고르면 목록을 거치지 않고 다음 질문으로 간다", async ({ page }) => {
  await 알레르기질문까지(page);
  await page.getByRole("button", { name: "없어요", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("#qtitle")).toHaveText(/맵기/);
});

test("«있어요»를 고르면 6종 목록이 펼쳐지고, 하나도 안 고르면 넘어가지 못한다", async ({ page }) => {
  await 알레르기질문까지(page);
  await page.getByRole("button", { name: "있어요", exact: true }).click();

  await expect(page.getByText("보유하신 알레르기를 모두 선택해 주세요")).toBeVisible();
  for (const 항목 of ["땅콩", "대두", "우유", "계란", "밀", "새우"]) {
    await expect(page.getByRole("button", { name: 항목, exact: true })).toBeVisible();
  }
  // 「잘 모르겠어요」도 목록의 답이다(TC-CM-01) — 안전 중단으로 들어가는 유일한 화면 입구
  await expect(page.getByRole("button", { name: "잘 모르겠어요", exact: true })).toBeVisible();
  // 첫 걸음의 답은 목록에 섞이지 않는다
  await expect(page.getByRole("button", { name: "없어요", exact: true })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "다음", exact: true }),
    "아무것도 안 골랐는데 넘어갈 수 있으면, 빈 답이 «알레르기 없음»과 구별되지 않습니다").toBeDisabled();

  await page.getByRole("button", { name: "새우", exact: true }).click();
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeEnabled();
});

test("목록에서 뒤로 가면 질문을 벗어나지 않고 «있으신가요?»로 돌아온다", async ({ page }) => {
  await 알레르기질문까지(page);
  await page.getByRole("button", { name: "있어요", exact: true }).click();
  await expect(page.getByText("보유하신 알레르기를 모두 선택해 주세요")).toBeVisible();

  await page.getByRole("button", { name: /뒤로|이전/ }).first().click();
  await expect(page.locator("#qtitle")).toHaveText(/알레르기가 있으신가요/);
  await expect(page.getByRole("button", { name: "있어요", exact: true })).toBeVisible();
});

test("첫 걸음의 선택지는 시안대로 «없어요/있어요» 둘뿐이다", async ({ page }) => {
  await 알레르기질문까지(page);
  /* 시안(99:1228)의 첫 걸음은 타일 두 장뿐이다. 「잘 모르겠어요」는 첫 걸음이 아니라
     **목록 걸음**에 있다(QA 1차 TC-CM-01 · PO 확정 2026-08-13) — 타일 두 장 구도를
     흐리지 않으면서 하드 제약 «미확인»의 입구를 연다. 여기서는 첫 걸음이 다시
     늘어나지 않게 «선택지가 둘뿐»을 못 박는다. */
  const 선택지 = await page.locator(".q-choices .choice, .q-unsure").allInnerTexts();
  expect(선택지.length, `첫 걸음 선택지가 ${선택지.length}개입니다: ${선택지.join(" / ")}`).toBe(2);
  await expect(page.getByRole("button", { name: /잘 모르겠어요/ })).toHaveCount(0);
});

test("「잘 모르겠어요」를 고르면 그 답만으로 다음 질문으로 갈 수 있다", async ({ page }) => {
  await 알레르기질문까지(page);
  await page.getByRole("button", { name: "있어요", exact: true }).click();

  const 모름 = page.getByRole("button", { name: "잘 모르겠어요", exact: true });
  await 모름.click();
  await expect(모름).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("#qtitle")).toHaveText(/맵기/);
});

test("「잘 모르겠어요」는 아는 항목과 함께 고를 수 있다", async ({ page }) => {
  /* 정의(QA 1차): 아는 것은 그대로 빼고, 모름은 재확인으로 남는다 — 재확인을 기다리는
     동안 방금 말한 땅콩·새우 제외를 미루면 아는 위험을 못 본 척하는 셈이다.
     판정 자체(제외 + requiresReconfirmation)는 tests/ask.test.ts 동시 선택 절이 잰다. */
  await 알레르기질문까지(page);
  await page.getByRole("button", { name: "있어요", exact: true }).click();

  await page.getByRole("button", { name: "새우", exact: true }).click();
  await page.getByRole("button", { name: "잘 모르겠어요", exact: true }).click();
  await expect(page.getByRole("button", { name: "새우", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "잘 모르겠어요", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeEnabled();
});

test("모름 → 미확정 추천 → 다시 추천 → 2회째에 안전 중단(S12)이 열린다", async ({ page }) => {
  /* TC-CM-01 의 핵심 — 안전 중단은 성분 충돌이 아니라 알레르기 «미확인»일 때 열린다.
     이 길이 화면에 없어서 QA 가 6종을 전부 골라도 S12 에 닿지 못했다. */
  await 알레르기질문까지(page);
  await page.getByRole("button", { name: "있어요", exact: true }).click();
  await page.getByRole("button", { name: "잘 모르겠어요", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  for (let i = 0; i < 5; i++) await 아무거나답하고다음(page);

  // 1회째 — 미확정: 임의로 판단하지 않는다는 배너가 뜨고 승인이 막힌다
  await expect(page.getByRole("heading", { level: 2, name: /이 메뉴를 선택하시겠어요/ })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("확실하지 않은 정보");
  await expect(page.getByRole("button", { name: "선택하기", exact: true })).toBeDisabled();

  // 고쳐볼 기회 한 번 — 조건을 그대로 두고 다시 받으면 2회째도 미확정이다
  await page.getByRole("button", { name: "수정하기" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /어떤 항목을 수정하고 싶으신가요/ })).toBeVisible();
  await page.getByRole("button", { name: "수정 완료", exact: true }).click();

  // 2회째 — 안전 중단. 멈춘 이유와 함께 막다른 길이 아닌 출구 둘이 남는다
  await expect(page.getByRole("heading", { level: 2, name: /추천 메뉴를 찾지 못했습니다/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "처음으로 돌아가기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "조건 다시 보기" })).toBeVisible();
});

test("직접 선택으로는 모름의 승인 차단이 풀리지 않는다", async ({ page }) => {
  /* 「잘 모르겠어요」가 화면에 들어오면서 미확정 상태로 «메뉴 수정»을 지나는 길이
     생겼다. 직접 선택은 메뉴를 확인한 것이지 자기 알레르기를 확인한 것이 아니다 —
     여기서 차단이 풀리면 알레르기를 모르는 채로 주문이 진행된다(logic.ts 참조). */
  await 알레르기질문까지(page);
  await page.getByRole("button", { name: "있어요", exact: true }).click();
  await page.getByRole("button", { name: "잘 모르겠어요", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  for (let i = 0; i < 5; i++) await 아무거나답하고다음(page);
  await expect(page.getByRole("button", { name: "선택하기", exact: true })).toBeDisabled();

  // 1위가 아닌 메뉴를 골라야 «직접 선택»(MANUAL_SELECTION) 경로가 실제로 탄다
  await page.getByRole("button", { name: "수정하기" }).click();
  await page.getByRole("button", { name: "메뉴 수정" }).click();
  await page.locator(".menu-rank .choice").nth(1).click();
  await page.getByRole("button", { name: "선택", exact: true }).click();

  await expect(page.getByRole("heading", { level: 2, name: /이 메뉴를 선택하시겠어요/ })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("확실하지 않은 정보");
  await expect(page.getByRole("button", { name: "선택하기", exact: true })).toBeDisabled();
});
