/**
 * A계열 — 프로필 흐름(S01 홈 · S02 프로필 생성 3단계 · S03 저장 방식 · S05 세션 시작).
 *
 * 실행: npx playwright test -c workspace/23C/tests/e2e/playwright.config.ts workspace/23C/tests/e2e/lane-a.spec.ts
 * 전제: 데모 UI가 http://localhost:5173 에 떠 있어야 한다.
 *
 * 이 파일이 지키는 것은 «디자인대로 그렸는가»가 아니라 **흐름과 접근성이 살아 있는가**다.
 * 화면을 넷으로 쪼개면서 잃기 쉬운 것 셋을 특히 붙잡는다 —
 *   ① 접근성 토글 7종이 3단계 라디오 뒤로 사라지지 않는다 (제출물이 채널 8종을 선언한다)
 *   ② 「화면 글씨 맞춰보기」 문답이 1단계에 남는다
 *   ③ S03 에서 정한 저장 의사가 세션 시작(startWizard)에서 지워지지 않는다
 */
import { expect, test, type Page } from "@playwright/test";
import { 아무거나답하고다음 } from "./nav";

const STORAGE_KEY = "kb23c-saved-settings-v4";

/** 저장본 없는 «최초 방문» 홈에서 시작한다. */
async function home(page: Page) {
  await page.goto("http://localhost:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요|다시 오셨네요/ })).toBeVisible();
}

/** 홈 → 프로필 1/3. */
async function toProfile(page: Page) {
  await home(page);
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByRole("heading", { name: "더 읽기 편한 크기를 선택해주세요" })).toBeVisible();
}

/** 프로필 3단계를 그대로 통과해 S03 으로. */
async function toSaveChoice(page: Page) {
  await toProfile(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("heading", { name: "선택하신 내용을 확인해주세요" })).toBeVisible();
}

/** S03 에서 저장 방식을 고르고 QR 을 건너뛰어 세션 시작까지. */
async function chooseAndSkipQr(page: Page, store = false) {
  await page.getByRole("button", { name: store ? "이 기기에 저장하기" : "이번만 사용하기" }).click();
  await page.getByRole("button", { name: "QR 없이 계속하기" }).click();
}

/** 지금 단계 이름 (5단계 인디케이터의 현재 라벨). */
const nowStep = (page: Page) => page.locator(".kb-steps:not(.mini) .kb-step.now .kb-steplabel");

/** 라디오 카드 하나 — 이름이 상단바 토글과 겹치므로 항상 카드 안으로 범위를 좁힌다. */
const radio = (page: Page, name: string) => page.locator(".kb-radio", { hasText: name });

test.describe("A계열 — 프로필 흐름", () => {
  test("A1 홈은 한 화면이다 — 5단계 인디케이터가 있고 시연 사례 카드는 없다", async ({ page }) => {
    await home(page);

    const steps = page.locator(".kb-steps:not(.mini)").first();
    await expect(steps).toContainText("홈");
    await expect(steps).toContainText("프로필 생성");
    await expect(steps).toContainText("저장 방식");
    await expect(steps).toContainText("세션 시작");
    await expect(nowStep(page)).toHaveText("홈");
    // 색만으로 현재 위치를 말하지 않는다 — 낭독기용 문장이 함께 있다
    await expect(steps.locator(".srline")).toContainText("5단계 중 1단계");

    /* 단정이 뒤집혔다 — 예전에는 «시연 사례 카드가 5줄 그대로 있는가»를 지켰다.
       그 카드는 없앴다. 첫 화면에서 «주문»과 «시연»이 나란히 서면 처음 온 사람이
       무엇을 눌러야 하는지부터 골라야 하고, 디자인에도 그 카드가 없다.
       그래서 «있는가» 대신 «정말로 없는가»를 지킨다 — 되살아나면 여기서 걸린다.
       (시연 경로가 없어진 것이 아니라, 이제 사용자와 같은 길을 걸어 만든다 —
       lane-d.spec.ts 의 CASE 표가 그 길이다.) */
    await expect(page.locator("section[aria-label='시연 사례']")).toHaveCount(0);
    await expect(page.locator(".presetrow")).toHaveCount(0);
    // 홈의 조작 요소는 [시작하기] 하나뿐이다 — 시안 150:162 가 그렇다
    await expect(page.getByRole("button", { name: /시작/ })).toHaveCount(1);
  });

  test("A2 홈 → 프로필 1/3 → 2/3 → 3/3 → 저장 방식으로 이어진다", async ({ page }) => {
    await toProfile(page);
    await expect(nowStep(page)).toHaveText("프로필 생성");
    /* 작은 3단계 표시(디자인 MiniStepIndicator)는 제목 위 한 줄로 들어가면서 공용
       StepIndicator 가 아니라 프로필 화면 전용 마크업(.p-mini)이 됐다 — `Screen` 의
       eyebrow 는 <p> 안이라 블록을 넣을 수 없기 때문이다. 점(.p-minidot.on)이 걸음
       수만큼 차오르고, 색만으로 말하지 않도록 글자(.p-minitext)가 함께 붙는다.
       세는 자리가 옮겨졌을 뿐 재는 것은 같다 — «지금 3걸음 중 몇 번째인가». */
    const mini = (n: number, group: string) => Promise.all([
      expect(page.locator(".p-mini .p-minidot.on")).toHaveCount(n),
      expect(page.locator(".p-minitext")).toHaveText(`3단계 중 ${n}단계 — ${group}`),
    ]);
    await mini(1, "글씨 크기");

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "더 또렷하게 보이는 화면을 선택해주세요" })).toBeVisible();
    await mini(2, "고대비");

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "필요한 안내 방식을 선택해주세요" })).toBeVisible();
    await mini(3, "화면 안내");

    // 되돌아갈 수 있다 (되돌아가는 버튼은 모든 화면에서 «뒤로» 하나로 통일됐다)
    await page.getByRole("button", { name: "뒤로", exact: true }).click();
    await expect(page.getByRole("heading", { name: "더 또렷하게 보이는 화면을 선택해주세요" })).toBeVisible();
    await page.getByRole("button", { name: "다음", exact: true }).click();

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "선택하신 내용을 확인해주세요" })).toBeVisible();
    await expect(nowStep(page)).toHaveText("저장 방식");
  });

  test("A3 세 단계의 라디오가 실제로 화면을 바꾼다", async ({ page }) => {
    await toProfile(page);
    const app = page.locator(".app");

    // 1/3 글씨 크기 — 기본은 큰 글씨가 켜져 있다(A11Y_DEFAULT)
    await expect(app).toHaveClass(/large/);
    await radio(page, "기본 크기").click();
    await expect(app).not.toHaveClass(/large/);
    await radio(page, "큰 글씨").click();
    await expect(app).toHaveClass(/large/);
    // 선택 상태를 색이 아니라 글자로도 알 수 있다
    await expect(radio(page, "큰 글씨")).toContainText("선택됨");

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await radio(page, "고대비 화면").click();
    await expect(app).toHaveClass(/contrast/);

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await radio(page, "안내 켜짐").click();
    await expect(app).toHaveClass(/guide/);
  });

  test("A4 접근성 7종과 입력 방식이 프로필 화면에 그대로 남아 있다", async ({ page }) => {
    await toProfile(page);

    /* «자세한 설정»은 마지막 걸음(3/3)에 있다. 세 걸음 모두에 붙여 두었더니 걸음마다
       같은 목록이 따라붙어 «제목 → 선택지 두 장 → 넓은 여백 → 아래 버튼»이 세 화면 다
       무너졌기 때문이다. 한 걸음 뒤로 옮겨졌을 뿐 7종은 그대로 다 닿는다 —
       이 검사가 지키는 것은 «어느 걸음에 있는가»가 아니라 «닿는가»다. */
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "필요한 안내 방식을 선택해주세요" })).toBeVisible();

    // 3단계 라디오 뒤에 «자세한 설정»으로 남긴다 — 채널을 선언만 하고 숨기지 않는다
    // (접어 두지도 않는다 — 열린 채로 나온다)
    await expect(page.locator("details.p-more")).toHaveAttribute("open", "");
    await expect(page.locator(".a11ylist .a11yrow")).toHaveCount(7);
    const input = page.getByRole("group", { name: "입력 방식" });
    await expect(input.locator("button")).toHaveCount(2);

    // 실제로 동작한다 (대표로 둘)
    const app = page.locator(".app");
    await page.locator(".a11ylist .a11yrow", { hasText: "누르기 편하게" }).click();
    await expect(app).toHaveClass(/roomy/);
    await page.locator(".a11ylist .a11yrow", { hasText: "직원 도움 먼저" }).click();
    await expect(page.locator(".staffbar")).toBeVisible();

    // 구현하지 않은 음성 입력을 선택지로 만들지 않는다
    await expect(page.getByRole("button", { name: /음성/ })).toHaveCount(0);
  });

  test("A5 「화면 글씨 맞춰보기」 문답은 글씨 크기만 정한다", async ({ page }) => {
    await toProfile(page);
    await page.getByRole("button", { name: "화면 글씨 맞춰보기" }).click();
    /* 문답은 두 걸음이다 — 예시가 실제로 적용되는 두 크기(기본·큰 글씨)뿐이기 때문이다.
       예전에는 «지금 크기의 1.9배»까지 세 걸음을 보여줬는데, 그 크기는 적용할 수가 없어서
       가장 큰 것을 고르고도 화면이 안 바뀌었다(probe.spec.ts). 마지막에서 더 작다고 하면
       버튼 이름이 «그래도 작아요»가 된다 — 더 큰 것이 있는 척하지 않는다. */
    await page.getByRole("button", { name: "조금 작아요" }).click();
    await page.getByRole("button", { name: "그래도 작아요" }).click();

    const app = page.locator(".app");
    await expect(app).toHaveClass(/large/);

    /* 한때 마지막 단계에서 고대비·화면 안내까지 함께 켰다. 고대비는 **바로 다음 걸음의
       질문**이고 화면 안내는 그 다음 걸음의 질문인데, 1단계 문답이 손을 뻗어 대신 답해
       버리면 글씨 크기를 고르던 사람 눈앞에서 화면이 통째로 반전된다. 실제로 그렇게
       보고됐다. 신호는 «권유 문장»으로 넘기고, 켜는 것은 사용자가 한다. */
    await expect(app, "묻지도 않고 고대비를 켰습니다").not.toHaveClass(/contrast/);
    await expect(app, "묻지도 않고 화면 안내를 켰습니다").not.toHaveClass(/guide/);
    await expect(page.getByText(/다음 단계에서 고대비 화면/)).toBeVisible();

    // 문답 결과가 1단계 라디오에도 그대로 비친다 (두 곳이 같은 값을 본다)
    await expect(radio(page, "큰 글씨")).toContainText("선택됨");
  });

  test("A6 S03 이 프로필 요약을 보여주고 저장 여부를 여기서 한 번만 묻는다", async ({ page }) => {
    await toSaveChoice(page);

    // 요약 세 줄 (디자인 SummaryCard)
    const summary = page.locator("section[aria-label='지금 화면 설정']");
    await expect(summary).toContainText("글씨 크기");
    await expect(summary).toContainText("고대비");
    await expect(summary).toContainText("화면 안내");

    /* 저장 방식은 라디오 두 장 + «다음» 이 아니라 **CTA 두 장**이다 — 누르는 순간
       정해지고 화면을 떠난다. 그래서 «지금 무엇이 선택돼 있는가»를 화면에서 읽을 자리가
       없어졌고, 대신 저장본 자체를 본다. 지키는 것은 그대로다:
       ① 고르기 전에는 아무것도 저장되지 않는다(공용 기기에서 조용히 저장하지 않는다)
       ② 고른 대로 실제로 저장되고, 되돌리면 실제로 지워진다 — 화면 표시가 아니라 사실로. */
    const stored = () => page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
    expect(await stored(), "고르기도 전에 저장돼 있습니다").toBeNull();

    await page.getByRole("button", { name: "이 기기에 저장하기" }).click();
    expect(await stored(), "«저장하기»를 골랐는데 저장본이 없습니다").not.toBeNull();

    // 뒤로 돌아와 마음을 바꾸면 그 자리에서 지워진다 (S03 은 QR 화면의 «뒤로»로 다시 온다)
    await page.getByRole("button", { name: "뒤로" }).click();
    await expect(page.getByRole("heading", { name: "선택하신 내용을 확인해주세요" })).toBeVisible();
    await page.getByRole("button", { name: "이번만 사용하기" }).click();
    expect(await stored(), "«이번만 사용»으로 바꿨는데 저장본이 남아 있습니다").toBeNull();
  });

  test("A7 S03 에서 무엇을 고르든 QR 로 가고, 건너뛰기는 QR 화면이 맡는다", async ({ page }) => {
    // 저장 여부와 이동을 한 버튼에 합쳤다 — 라디오로 고르고 «다음»을 또 누르면
    // «무엇을 골랐는지»와 «어디로 가는지»가 한 줄에 섞여 두 번 판단하게 된다.
    await toSaveChoice(page);
    await page.getByRole("button", { name: "이번만 사용하기" }).click();
    await expect(nowStep(page)).toHaveText("QR 연동");

    await toSaveChoice(page);
    await page.getByRole("button", { name: "이 기기에 저장하기" }).click();
    await expect(nowStep(page)).toHaveText("QR 연동");

    // 매장 QR 이 없는 경우 — 여기서 건너뛰면 세션 시작으로
    await page.getByRole("button", { name: "QR 없이 계속하기" }).click();
    await expect(nowStep(page)).toHaveText("세션 시작");
  });

  test("A8 S03 의 «수정»이 해당 단계로 되돌려 준다", async ({ page }) => {
    await toSaveChoice(page);
    await page.locator(".kb-row", { hasText: "화면 안내" }).getByRole("button", { name: /수정/ }).click();
    await expect(page.getByRole("heading", { name: "필요한 안내 방식을 선택해주세요" })).toBeVisible();
  });

  test("A9 S05 에서 시작하면 마법사 첫 질문(알레르기)으로 간다", async ({ page }) => {
    await toSaveChoice(page);
    await chooseAndSkipQr(page);
    await expect(nowStep(page)).toHaveText("세션 시작");

    await page.getByRole("button", { name: /주문 시작하기/ }).click();
    await expect(page.locator("#qtitle")).toHaveText(/알레르기/);
  });

  test("A10 S03 에서 정한 저장 의사가 주문 확정까지 살아남는다", async ({ page }) => {
    await toSaveChoice(page);
    await chooseAndSkipQr(page, true);
    await page.getByRole("button", { name: /주문 시작하기/ }).click();

    // 7문항을 첫 선택지로 답한다
    for (let i = 0; i < 7; i++) {
      if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
      await 아무거나답하고다음(page);
    }
    await page.getByRole("button", { name: "네, 좋아요" }).click();
    await page.getByRole("button", { name: "이대로 담기" }).click();   // 메뉴 확인 한 걸음
    await expect(page.getByRole("heading", { name: /마지막으로 확인/ })).toBeVisible();

    const live = page.getByRole("button", { name: /가상 키오스크에서 실행/ });
    await ((await live.count()) > 0 ? live : page.getByRole("button", { name: /주문 확정하기/ })).click();
    await expect(page.getByRole("heading", { name: /실행 결과|주문이 완성되었습니다|주문 계획/ })).toBeVisible();

    // 답변까지 함께 남았는가 — startWizard 가 저장 의사를 지웠다면 여기서 걸린다
    const saved = await page.evaluate((k) => {
      const s = localStorage.getItem(k);
      return s ? (JSON.parse(s) as { answers?: Record<string, unknown> }) : null;
    }, STORAGE_KEY);
    expect(saved, "저장하기를 골랐는데 저장본이 없습니다").not.toBeNull();
    expect(saved!.answers?.allergies, "저장본에 이번 답변이 없습니다").toBeDefined();
  });

  test("A12 네 화면의 조작 요소가 전부 48px 이상이다 (고대비·큰 글씨 포함)", async ({ page }) => {
    /** 지금 화면의 보이는 버튼 높이를 전부 잰다 — CSS 선언이 아니라 실제 렌더 결과다. */
    const heights = () => page.locator("button, input, a[href]").evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({ h: e.getBoundingClientRect().height, t: (e as HTMLElement).innerText.slice(0, 24) })));
    const check = async (where: string) => {
      const boxes = await heights();
      // S01 은 시안대로 [시작하기] 하나뿐이다 — 적은 것이 목표였지 사고가 아니다
      expect(boxes.length, `${where} 에 조작 요소가 없습니다`).toBeGreaterThanOrEqual(1);
      for (const b of boxes) expect(b.h, `${where} "${b.t}" 높이 ${b.h}px`).toBeGreaterThanOrEqual(48);
    };

    await toProfile(page);
    await radio(page, "기본 크기").click();        // 큰 글씨를 꺼도 (가장 불리한 쪽)
    await check("S02 1/3");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await radio(page, "고대비 화면").click();      // 고대비까지 켜고
    await check("S02 2/3");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await check("S02 3/3");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await check("S03");
    await chooseAndSkipQr(page);
    await check("S05");
    /* S05 에는 «처음으로»가 없다 — 주문을 시작하기 전이라 되돌릴 곳은 «앞 화면»뿐이고,
       가지 않은 곳으로 보내는 버튼을 두지 않는다. 홈은 왔던 길을 되짚어 간다.
       새로 열지 않는 이유는 방금 켠 고대비·끈 큰 글씨를 그대로 지고 가야
       **가장 불리한 조건**에서 홈을 잴 수 있기 때문이다(다시 열면 기본값으로 돌아간다).
       S05 → S03 → 3/3 → 2/3 → 1/3 → S01, 다섯 걸음. */
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "뒤로" }).click();
    await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요/ })).toBeVisible();
    await check("S01");
  });
});
