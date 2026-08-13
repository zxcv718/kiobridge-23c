/**
 * 매장 QR 로 들어온 방문 — 주소에 실려 온 매장 코드를 홈이 확인한다.
 *
 * QR 걸음(S04)은 기획(2026-08-12)으로 흐름에서 빠졌다. QR 은 앱 **밖**에서 폰 기본
 * 카메라로 찍는 행위이고, 찍으면 매장 코드(?env=)가 주소에 실려 **연동 관문을 건너뛴
 * 홈**이 열린다. 코드 없이 열면 관문이 먼저다(lane-b.spec.ts).
 *
 * 다만 **자동으로 진행하지 않는다** — 어느 매장으로 도울지 문장으로 밝히고,
 * 진행은 여느 방문과 같이 «시작하기»가 한다(무로그인 가이드 8번).
 */
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

/** 주소를 달고 홈을 연다 (저장본은 비운다) */
async function 홈으로(page: import("@playwright/test").Page, 주소: string): Promise<void> {
  await page.goto(주소);
  await page.evaluate(() => localStorage.clear());
  await page.goto(주소);
  await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요/ })).toBeVisible();
}

/**
 * 관문에서 직접 입력 폼을 편다.
 *
 * «직접 입력» 버튼은 토글이라 그냥 누르면 안 된다 — 헤드리스에는 카메라가 없어서
 * 관문이 실패를 확인하는 순간 **폼을 저절로 펴 두는데**(QrConnect), 그 뒤에 누르면
 * 도로 접힌다. 자동 펼침과 클릭의 경쟁이라 됐다 안 됐다 했다(병합 검증 실측).
 * 이미 펴져 있으면 누르지 않는다.
 */
async function 직접입력펴기(page: import("@playwright/test").Page): Promise<void> {
  const 입력칸 = page.locator('input[name="storeCode"]');
  if (!(await 입력칸.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "직접 입력" }).click();
  }
  await expect(입력칸).toBeVisible();
}

test("주소에 매장 코드가 있으면 홈이 어느 매장인지 밝힌다", async ({ page }) => {
  await 홈으로(page, "http://localhost:5173/?env=chicken-store");

  const 배너 = page.getByRole("status");
  await expect(배너).toContainText("매장 QR로 들어오셨어요");
  await expect(배너).toContainText("닭강정 가게");
});

test("자동으로 넘어가지 않는다 — 진행은 시작하기가 한다", async ({ page }) => {
  await 홈으로(page, "http://localhost:5173/?env=chicken-store");

  /* 여기서 저절로 다음 화면으로 가면 «자동으로 불러온 정보를 확인받는다»가 깨진다.
     공용 기기에서 앞사람이 남긴 주소일 수도 있다. */
  await expect(page.getByRole("button", { name: "시작하기" })).toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByRole("heading", { name: "더 읽기 편한 크기를 선택해주세요" })).toBeVisible();
});

test("다른 매장 코드면 아는 척하지 않는다", async ({ page }) => {
  await 홈으로(page, "http://localhost:5173/?env=coffee-shop");

  const 배너 = page.getByRole("status");
  await expect(배너).toContainText("아직 없습니다");
  await expect(배너).toContainText("coffee-shop");   // 무엇을 읽었는지 밝힌다
  await expect(배너).toContainText("닭강정 가게");    // 그래도 막다른 길이 아니다
});

test("주소에 아무것도 없으면 연동 관문이 먼저 나온다 — 홈에는 배너가 없다", async ({ page }) => {
  await page.goto("http://localhost:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // 헤드리스에는 카메라가 없어 제목이 «읽을 수 없습니다»로 바뀔 수 있다 — 어느 쪽이든 관문이다
  await expect(page.getByRole("heading", { name: /매장 QR|QR을 읽을 수 없습니다/ })).toBeVisible();
  await page.getByRole("button", { name: /QR 없이 계속하기/ }).click();
  await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요/ })).toBeVisible();
  await expect(page.getByText(/매장 QR로 들어오셨어요/)).toHaveCount(0);
});

test("연동을 마친 기기는 다시 열어도 관문이 아니라 홈부터 시작한다", async ({ page }) => {
  /* QA 1차 TC-XC-04 — 강제 종료 후 재실행하면 QR 스캔부터 다시 시작했다. 연동에
     성공한 매장 코드를 기기에 남기고(kb23c-store-v1), 다음 방문은 관문을 건너뛴다.
     헤드리스에는 카메라가 없으므로 연동은 «직접 입력»으로 마친다 — 카메라와 직접
     입력은 같은 판정(decide)을 지나므로 재는 것은 같다. */
  await page.goto("http://localhost:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await 직접입력펴기(page);
  await page.locator('input[name="storeCode"]').fill("chicken-store");
  await page.getByRole("button", { name: "이 코드로 연결하기" }).click();
  await expect(page.getByRole("heading", { name: "연결되었습니다" })).toBeVisible();

  // 강제 종료 후 재실행의 재현 — 새로고침. 관문 없이 홈이 바로 나온다.
  await page.reload();
  await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /매장 QR을 스캔해주세요|QR을 읽을 수 없습니다/ })).toHaveCount(0);

  // 남는 것은 정본 환경 ID 다 — 사용자 기록(프로필·세션)과 별개의 «기기의 매장 설정»
  expect(await page.evaluate(() => localStorage.getItem("kb23c-store-v1"))).toBe("chicken-store");
});

test("모르는 매장 코드로는 연동을 기억하지 않는다 — 다음 방문은 여전히 관문부터다", async ({ page }) => {
  await page.goto("http://localhost:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await 직접입력펴기(page);
  await page.locator('input[name="storeCode"]').fill("coffee-shop");
  await page.getByRole("button", { name: "이 코드로 연결하기" }).click();
  await expect(page.getByRole("heading", { name: "이 매장 정보는 아직 없습니다" })).toBeVisible();

  // 성공이 아닌 것을 성공처럼 남기지 않는다 — 새로고침하면 관문이 다시 선다
  expect(await page.evaluate(() => localStorage.getItem("kb23c-store-v1"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("heading", { name: /매장 QR|QR을 읽을 수 없습니다/ })).toBeVisible();
});
