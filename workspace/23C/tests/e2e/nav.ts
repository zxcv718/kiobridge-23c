/**
 * 홈에서 질문까지 가는 길 (테스트 전용).
 *
 * 디자인을 반영하면서 시작 화면과 질문 사이에 네 걸음이 생겼다 —
 * 프로필 생성(3걸음) · 저장 방식 · QR 연동 · 세션 시작.
 *
 * 이 길을 스펙마다 따로 적으면, 화면이 하나 늘 때마다 여섯 파일을 같이 고쳐야 하고
 * 그중 하나를 빠뜨리면 «왜 실패하는지 알 수 없는» 테스트가 남는다. 한 곳에 둔다.
 *
 * QR 은 건너뛴다. 카메라는 헤드리스 브라우저에서 못 쓰고, QR 자체의 검사는
 * lane-b.spec.ts 가 폴백 경로로 따로 한다.
 */
import { expect, type Page } from "@playwright/test";

export const HOME = "http://localhost:5173/";

/** 홈을 연다. */
export async function openHome(page: Page): Promise<void> {
  await page.goto(HOME);
  await expect(page.getByRole("heading", { name: /닭강정 가게 주문/ })).toBeVisible();
}

/**
 * 홈 → 첫 질문. 화면 설정은 기본값 그대로 지나간다.
 *
 * 저장본이 있으면 시작 버튼 이름이 «처음부터 새로 시작하기» 로 바뀌고,
 * 세션 시작 화면의 버튼도 «아니오, 새로 고를게요» 가 된다 — 둘 다 받는다.
 */
export async function enterWizard(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^(시작하기|처음부터 새로 시작하기)$/ }).click();

  // S02 프로필 생성 — 글씨 크기 → 고대비 → 화면 안내
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  // S03 저장 방식 — 기본값(이번만 사용) 그대로 두고 QR 을 건너뛴다
  await page.getByRole("button", { name: "매장 QR 없이 계속하기" }).click();
  // S05 세션 시작
  await page.getByRole("button", { name: /^(주문 시작하기|아니오, 새로 고를게요)$/ }).click();

  await expect(page.locator("#qtitle")).toBeVisible();
}

/**
 * 같은 길을 **키보드만으로** 간다.
 *
 * 마우스 판과 따로 두는 이유는, 화면이 늘어난 뒤에도 «탭으로 닿을 수 있는가»가
 * 여전히 참인지 재야 하기 때문이다. 버튼이 늘었는데 탭 순서에서 빠지면
 * 마우스 판만으로는 아무 일도 없어 보인다.
 */
export async function enterWizardByKeyboard(
  page: Page,
  pressOn: (page: Page, name: RegExp | string) => Promise<void>,
): Promise<void> {
  await pressOn(page, /^(시작하기|처음부터 새로 시작하기)$/);
  for (let i = 0; i < 3; i++) await pressOn(page, /^다음$/);
  await pressOn(page, /^매장 QR 없이 계속하기$/);
  await pressOn(page, /^(주문 시작하기|아니오, 새로 고를게요)$/);
  await expect(page.locator("#qtitle")).toBeVisible();
}

/**
 * 추천 화면 → 장바구니 확인(S13).
 *
 * 사이에 «메뉴 확인»(Figma 99:1762)이 한 걸음 들어간다 — 추천 화면은 이유·대안·제외를
 * 한꺼번에 보여주느라 빽빽해서, 고른 것이 맞는지만 묻는 자리를 따로 둔다.
 */
export async function approveToCartReview(page: Page): Promise<void> {
  await page.getByRole("button", { name: "네, 좋아요" }).click();
  await expect(page.getByRole("heading", { name: /이 메뉴를 선택하시겠어요/ })).toBeVisible();
  await page.getByRole("button", { name: "이대로 담기" }).click();
  await expect(page.getByRole("heading", { name: /마지막으로 확인/ })).toBeVisible();
}
