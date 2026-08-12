/**
 * 레인 B — 매장 연동 관문(구 S04a·S04b)의 QR 읽기 실측.
 *
 * 실행: npx playwright test -c workspace/23C/tests/e2e/playwright.config.ts lane-b
 * 전제: 데모 UI가 http://localhost:5173 에서 떠 있어야 한다.
 *
 * 기획 확정(2026-08-12): QR 연동은 흐름 다섯 걸음의 **1걸음**이다(시안 S01-B) — 앱을
 * 그냥 열면 이 화면이 먼저 나오고, QR 을 찍거나 코드를 넣으면 홈(2걸음)이 나온다.
 * 매장 QR 링크(?env=)로 열리면 이 걸음을 건너뛴다 — 그 경로는 qr-url.spec.ts 가 잰다.
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
  "connect", "start", "profile", "saveChoice", "sessionStart",
  "wizard", "calculating", "menuConfirm", "menuSelect",
  "confirm", "run", "result", "staff", "edit", "stopped",
];

const screen = (page: Page) => page.locator("section[aria-label^='매장 QR 연동']");
/** 5단계 인디케이터의 현재 라벨 — 내부 상태를 훔쳐보지 않고 화면에 보이는 것으로 잰다. */
const nowStep = (page: Page) => page.locator(".kb-steps:not(.mini) .kb-step.now .kb-steplabel");
const 홈도착 = async (page: Page) => {
  await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요|다시 오셨네요/ }),
    "QR 연동을 지나면 홈이어야 합니다").toBeVisible();
  await expect(nowStep(page)).toHaveText("홈"); // 2걸음 — QR 연동 다음이다
};

/** 그냥 연다 — 관문이 첫 화면이다. 카메라 판단이 끝날 때까지 기다린다. */
async function goToGate(page: Page) {
  await page.goto("http://localhost:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(screen(page)).toBeVisible();
  /* «카메라를 준비하고 있습니다»에서 벗어나야 판단이 끝난 것이다. 그 전에 화면을 재면
     직접 입력이 접혔는지 펴졌는지가 아직 정해지지 않아 결과가 실행마다 달라진다. */
  await expect(screen(page).getByRole("status")).not.toHaveText("카메라를 준비하고 있습니다.");
}

/**
 * 관문에서 **직접 입력을 편 뒤**, 매장 정보(fixture)가 도착할 때까지 기다린다.
 *
 * 직접 입력은 시안(150:359)대로 버튼 하나로 접혀 있고, 카메라를 못 쓰는 것이 확인되면
 * 화면이 스스로 편다. 그래서 접혀 있을 때만 누른다 — 무조건 누르면 이미 펴진 경우를
 * 도로 접어 버린다.
 */
async function openQr(page: Page) {
  await goToGate(page);
  const 직접입력 = screen(page).getByRole("button", { name: "직접 입력" });
  if (await 직접입력.getAttribute("aria-expanded") === "false") await 직접입력.click();
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

test.describe("레인 B — 매장 연동 관문", () => {
  test.describe("카메라를 쓸 수 없는 브라우저", () => {
    test.beforeEach(async ({ page }) => {
      await withoutCamera(page);
      await openQr(page);
    });

    test("QR 연동이 홈보다 먼저 나오고, 진행 표시의 1걸음이 여기다", async ({ page }) => {
      /* 흐름 밖 관문이던 때는 진행 표시가 없는 것을 지켰다. 기획 확정(2026-08-12,
         시안 S01-B)으로 다섯 걸음의 첫째가 됐다 — 표시가 있고, 지금 위치가 «QR 연동»이다. */
      await expect(nowStep(page)).toHaveText("QR 연동");
      await expect(page.locator(".kb-steps:not(.mini) .srline")).toContainText("5단계 중 1단계");
      await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요/ })).toHaveCount(0);
    });

    test("왜 안 되는지 말하고, 앞으로 갈 길을 세 갈래 준다", async ({ page }) => {
      // 이유를 색이나 아이콘이 아니라 문장으로 말한다
      const why = screen(page).getByRole("status");
      await expect(why).toBeVisible();
      await expect(why).toContainText(/카메라/);

      // ① 직접 입력 ② 직원 요청 ③ 건너뛰기 — 셋 다 이 화면에 있어야 한다
      await expect(page.getByLabel("매장 코드 직접 입력")).toBeVisible();
      await expect(screen(page).getByRole("button", { name: "직원 요청" })).toBeVisible();
      await expect(page.getByRole("button", { name: /QR 없이 계속하기/ })).toBeVisible();
    });

    test("카메라가 막히면 직접 입력이 저절로 펴진다 — 본길을 한 번 더 누르게 하지 않는다", async ({ page }) => {
      /* 시안의 기본 상태는 버튼 하나지만, 시안은 «카메라를 못 쓰는 화면»을 그린 적이 없다.
         그 상태에서는 이 입력이 앞으로 가는 유일한 길이므로 화면이 먼저 펴 준다. */
      await expect(screen(page).getByRole("button", { name: "직접 입력" }))
        .toHaveAttribute("aria-expanded", "true");
    });

    test("직원 요청은 직원 호출 화면으로 간다", async ({ page }) => {
      await screen(page).getByRole("button", { name: "직원 요청" }).click();
      await expect(page.locator("section[aria-label='직원 호출']")).toBeVisible();
    });

    test("매장 코드를 직접 넣으면 연결 완료를 거쳐 홈으로 간다", async ({ page }) => {
      await page.getByLabel("매장 코드 직접 입력").fill("chicken-store");
      await page.getByRole("button", { name: "이 코드로 연결하기" }).click();

      await expect(page.getByRole("heading", { name: "연결되었습니다" })).toBeVisible();
      // 어느 매장에 연결됐는지 화면에 있어야 한다
      await expect(screen(page)).toContainText("닭강정 가게");
      await expect(screen(page)).toContainText("chicken-store");

      /* 부제는 확정 시안 그대로 «매장 정보와 세션을 모두 확인했어요»다(기획 확정
         2026-08-12 — FIGMA_RULES §2.8 에 번복 기록). 한동안 «세션» 낱말을 빼고 지켰던
         가드는 그 결정과 함께 걷었다. «발급·생성»처럼 일이 일어난 것으로 읽히는 말은
         여전히 막는다 — 세션은 만들어지지 않는다. */
      await expect(screen(page)).toContainText("매장 정보와 세션을 모두 확인했어요");
      await expect(screen(page)).not.toContainText(/세션[을이]?\s*(발급|생성)/);

      await page.getByRole("button", { name: /이 매장으로 계속하기/ }).click();
      await 홈도착(page);
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
      await 홈도착(page);
    });

    test("QR 없이 건너뛰어도 흐름이 이어진다 — 홈에서 시작한다", async ({ page }) => {
      await page.getByRole("button", { name: /QR 없이 계속하기/ }).click();
      await 홈도착(page);
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
      await 홈도착(page);
      expect(await page.evaluate(() => (window as unknown as { __stopped: number }).__stopped)).toBeGreaterThan(0);
    });
  });

  /* 시안(150:359)의 화면 아래는 캡션 한 줄과 흰 버튼 둘뿐이다. 폴백 폼을 펼쳐 둔 채로는
     펴기 전 화면이 시안과 달라지므로 접었다 — 접힌 것이 실제로 접혀 있고, 눌러서 닿는지
     여기서 잰다. 위 두 describe 의 beforeEach 는 폼을 펴 두므로 따로 세운다. */
  test.describe("시안의 기본 상태 — 직접 입력은 버튼 하나로 접혀 있다", () => {
    test("스캔 중에는 접혀 있고, 눌러야 입력칸이 나온다", async ({ page }) => {
      await withFakeCamera(page);
      await goToGate(page);

      const 직접입력 = screen(page).getByRole("button", { name: "직접 입력" });
      await expect(직접입력).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByLabel("매장 코드 직접 입력")).toBeHidden();
      // 시안 150:360 의 캡션이 그 버튼 위에 있다
      await expect(screen(page).getByText("QR을 스캔하기 어려우신가요?")).toBeVisible();

      await 직접입력.click();
      await expect(page.getByLabel("매장 코드 직접 입력")).toBeVisible();
      await expect(직접입력).toHaveAttribute("aria-expanded", "true");
    });
  });
});
