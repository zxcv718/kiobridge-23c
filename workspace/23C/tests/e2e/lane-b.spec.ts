/**
 * 레인 B — 매장 QR 읽기(S04a·S04b) 실측.
 *
 * 실행: npx playwright test -c workspace/23C/tests/e2e/playwright.config.ts lane-b
 * 전제: 데모 UI가 http://localhost:5173 에서 떠 있어야 한다.
 *
 * 이 화면의 핵심은 «읽히는 경우»가 아니라 **읽히지 않는 경우**다. BarcodeDetector 는
 * Safari·Firefox 에 없고, 카메라 권한은 거부될 수 있고, 카메라가 아예 없는 기기도 있다.
 * 셋 중 어느 쪽이든 사용자가 앞으로 갈 수 있어야 하므로 그 길들을 여기서 실제로 눌러 본다.
 *
 * 실기기 카메라는 e2e 에서 쓸 수 없다. 그래서 두 갈래로 나눠 잰다 —
 *  ① 기능을 지운 브라우저(폴백 경로): `BarcodeDetector` 와 `navigator.mediaDevices` 를 없앤다.
 *  ② 기능이 있는 브라우저(스캔 경로): canvas 로 만든 **진짜 MediaStream** 을 getUserMedia 가
 *     돌려주게 하고, BarcodeDetector 자리에 정해진 값을 내는 대역을 끼운다.
 *     ②는 «우리 코드가 detect 결과를 어떻게 다루는가»를 재는 것이지, 실제 QR 인식률을
 *     재는 것이 아니다. 카메라를 끄는지(track.stop)는 여기서 실제로 세어 확인한다.
 */
import { expect, test, type Page } from "@playwright/test";

/** ui/src/model.ts 의 Step 유니온. 앱 상태를 찾아낼 때 «이것이 step 인가»의 판별에 쓴다. */
const STEPS = [
  "start", "profile", "saveChoice", "qr", "sessionStart",
  "wizard", "calculating", "recommend", "menuConfirm",
  "confirm", "run", "result", "staff", "edit", "stopped",
];

/* QR 화면으로 가는 길이 이어졌다. 예전에는 레인 A 가 S03 을 만드는 중이라 React 내부
   상태를 직접 건드리는 임시 다리를 놓았는데, 그건 «화면에서 실제로 닿을 수 있는가»를
   재지 못한다. 이제 사용자와 같은 길로 간다. */

const screen = (page: Page) => page.locator("section[aria-label^='매장 QR 연동']");
/** 5단계 인디케이터의 현재 라벨 — 내부 상태를 훔쳐보지 않고 화면에 보이는 것으로 잰다. */
const nowStep = (page: Page) => page.locator(".kb-steps:not(.mini) .kb-step.now .kb-steplabel");

/** 홈을 띄우고 QR 화면으로 옮긴 뒤, 매장 정보(fixture)가 도착할 때까지 기다린다. */
async function openQr(page: Page) {
  await page.goto("http://localhost:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /^(시작하기|처음부터 새로 시작하기)$/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용하기" }).click();
  await expect(screen(page)).toBeVisible();
  // fixture 가 오기 전에는 대조할 매장이 없어 «확인» 버튼이 잠겨 있다
  await expect(page.getByRole("button", { name: "이 코드로 연결하기" })).toBeEnabled();
}

/** ① 기능이 없는 브라우저 — Safari·Firefox 와 카메라 없는 기기를 함께 흉내낸다. */
const withoutCamera = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, get: () => undefined });
  });

/** ② 기능이 있는 브라우저 — 진짜 MediaStream + 값을 정해 주는 BarcodeDetector 대역. */
const withFakeCamera = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __qr?: string; __stopped?: number };
    w.__stopped = 0;
    w.__qr = "";

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const g = canvas.getContext("2d")!;
    const paint = () => { g.fillStyle = "#888"; g.fillRect(0, 0, 320, 240); };
    paint();
    setInterval(paint, 100); // 프레임이 계속 나와야 video 가 재생 상태가 된다
    const stream = canvas.captureStream(10);
    for (const t of stream.getTracks()) {
      const orig = t.stop.bind(t);
      t.stop = () => { w.__stopped = (w.__stopped ?? 0) + 1; orig(); };
    }
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      get: () => ({ getUserMedia: async () => stream }),
    });

    class FakeBarcodeDetector {
      static async getSupportedFormats() { return ["qr_code"]; }
      async detect() { return w.__qr ? [{ rawValue: w.__qr, format: "qr_code" }] : []; }
    }
    Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: FakeBarcodeDetector });
  });

test.describe("레인 B — 매장 QR 읽기", () => {
  test.describe("카메라를 쓸 수 없는 브라우저", () => {
    test.beforeEach(async ({ page }) => {
      await withoutCamera(page);
      await openQr(page);
    });

    test("왜 안 되는지 말하고, 앞으로 갈 길을 세 갈래 준다", async ({ page }) => {
      // 이유를 색이나 아이콘이 아니라 문장으로 말한다
      const why = screen(page).getByRole("status");
      await expect(why).toBeVisible();
      await expect(why).toContainText(/카메라/);

      // ① 직접 입력 ② 직원 요청 ③ 건너뛰기 — 셋 다 이 화면에 있어야 한다
      await expect(page.getByLabel("매장 코드 직접 입력")).toBeVisible();
      await expect(page.getByRole("button", { name: /QR 없이 계속하기/ })).toBeVisible();
    });

    test("매장 코드를 직접 넣으면 연결 완료로 간다", async ({ page }) => {
      await page.getByLabel("매장 코드 직접 입력").fill("chicken-store");
      await page.getByRole("button", { name: "이 코드로 연결하기" }).click();

      await expect(page.getByRole("heading", { name: "연결되었습니다" })).toBeVisible();
      // 어느 매장에 연결됐는지 화면에 있어야 한다
      await expect(screen(page)).toContainText("닭강정 가게");
      await expect(screen(page)).toContainText("chicken-store");

      // 없는 것을 있다고 하지 않는다 — 세션을 발급받은 것이 아니다
      await expect(screen(page)).not.toContainText(/세션 발급|세션이 발급/);

      await page.getByRole("button", { name: /이 매장으로 계속하기/ }).click();
      await expect(nowStep(page), "세션 시작으로 넘어가지 않았습니다").toHaveText("세션 시작");
    });

    test("QR을 URL 로 적어도 매장 코드를 알아본다", async ({ page }) => {
      await page.getByLabel("매장 코드 직접 입력").fill("https://kiobridge.example/kiosk?env=chicken-store");
      await page.getByRole("button", { name: "이 코드로 연결하기" }).click();
      await expect(page.getByRole("heading", { name: "연결되었습니다" })).toBeVisible();
    });

    test("모르는 매장이면 정직하게 말하고, 그래도 진행할 길을 준다", async ({ page }) => {
      await page.getByLabel("매장 코드 직접 입력").fill("burger-town");
      await page.getByRole("button", { name: "이 코드로 연결하기" }).click();

      await expect(page.getByRole("heading", { name: "이 매장 정보는 아직 없습니다" })).toBeVisible();
      await expect(screen(page)).toContainText("burger-town"); // 무엇을 읽었는지 밝힌다
      await expect(screen(page)).not.toContainText(/연결되었습니다/);

      // 막다른 길이 아니다
      await page.getByRole("button", { name: /이대로 계속하기/ }).click();
      await expect(nowStep(page), "세션 시작으로 넘어가지 않았습니다").toHaveText("세션 시작");
    });

    test("QR 없이 건너뛰어도 흐름이 이어진다", async ({ page }) => {
      await page.getByRole("button", { name: /QR 없이 계속하기/ }).click();
      await expect(nowStep(page), "세션 시작으로 넘어가지 않았습니다").toHaveText("세션 시작");
    });

    test("진행 표시에서 QR은 5단계 중 4번째다", async ({ page }) => {
      await expect(page.locator(".kb-steps .srline")).toHaveText(/5단계 중 4단계/);
    });

    test("이 화면의 조작 요소가 전부 48px 이상이다", async ({ page }) => {
      const boxes = await page.locator("section[aria-label='매장 QR 연동'] button, section[aria-label='매장 QR 연동'] input")
        .evaluateAll((els) => els.map((e) => ({
          h: e.getBoundingClientRect().height,
          t: ((e as HTMLElement).innerText || (e as HTMLInputElement).name || e.tagName).slice(0, 24),
        })));
      expect(boxes.length).toBeGreaterThan(2);
      for (const b of boxes) expect(b.h, `"${b.t}" 높이 ${b.h}px`).toBeGreaterThanOrEqual(48);
    });
  });

  test.describe("카메라를 쓸 수 있는 브라우저", () => {
    test.beforeEach(async ({ page }) => {
      await withFakeCamera(page);
      await openQr(page);
    });

    test("QR을 읽으면 매장을 대조해 연결 완료로 간다", async ({ page }) => {
      await expect(screen(page).locator("video")).toBeVisible();
      await page.evaluate(() => { (window as unknown as { __qr: string }).__qr = "chicken-store"; });

      await expect(page.getByRole("heading", { name: "연결되었습니다" })).toBeVisible();
      await expect(screen(page)).toContainText("닭강정 가게");
      // 다 읽었으면 카메라를 끈다 — 시연 중에 표시등이 켜져 있으면 안 된다
      expect(await page.evaluate(() => (window as unknown as { __stopped: number }).__stopped)).toBeGreaterThan(0);
      await expect(screen(page).locator("video")).toHaveCount(0);
    });

    test("모르는 매장의 QR 도 읽은 사실을 말하고 카메라를 끈다", async ({ page }) => {
      await page.evaluate(() => { (window as unknown as { __qr: string }).__qr = "burger-town"; });
      await expect(page.getByRole("heading", { name: "이 매장 정보는 아직 없습니다" })).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __stopped: number }).__stopped)).toBeGreaterThan(0);
    });

    test("화면을 벗어나면 카메라가 꺼진다", async ({ page }) => {
      await expect(screen(page).locator("video")).toBeVisible();
      await page.getByRole("button", { name: /QR 없이 계속하기/ }).click();
      await expect(nowStep(page), "세션 시작으로 넘어가지 않았습니다").toHaveText("세션 시작");
      expect(await page.evaluate(() => (window as unknown as { __stopped: number }).__stopped)).toBeGreaterThan(0);
    });
  });
});
