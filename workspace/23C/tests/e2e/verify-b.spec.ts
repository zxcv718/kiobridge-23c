/**
 * B·C계열 — 화면 동작 검증.
 *
 * 실행: npx playwright test -c workspace/23C/tests/e2e/playwright.config.ts verify-b
 * 시나리오 정의: `키오브릿지-검증-시나리오.md`
 *
 * keyboard.spec.ts 가 접근성 실측을 맡고, 여기서는 **여러 화면이 상태로 얽히는 경로**와
 * **participant-ux.json 선언이 화면에서 실제로 동작하는지**를 본다.
 * 단위 테스트로는 잡히지 않는 회귀(저장본 마이그레이션·재확인 카운터·선언 일치)가 대상이다.
 */
import { expect, test, type Page } from "@playwright/test";
import { 아무거나답하고다음, 저장된내용펼치기, approveToCartReview, enterWizard, openHome } from "./nav";

const start = openHome;

/**
 * 6문항을 끝까지 답한다 (알레르기 땅콩·콩 → 매운맛 → 뼈 → 나머지는 첫 선택지).
 * 질문은 고정이므로 어떤 조합이든 추천 화면에 닿으려면 전부 답해야 한다.
 */
async function answerAll(page: Page) {
  await enterWizard(page);
  // 알레르기는 «있으신가요?» → 항목 목록 두 걸음이다 (디자인 S06 기본/확장)
  await page.getByRole("button", { name: "있어요", exact: true }).click();
  await page.getByRole("button", { name: "땅콩", exact: true }).click();
  await page.getByRole("button", { name: "대두", exact: true }).click();
  await page.getByRole("button", { name: /다음/ }).click();
  await page.getByRole("button", { name: "매운맛", exact: true }).click();
  await page.getByRole("button", { name: /다음/ }).click();
  await page.getByRole("button", { name: "뼈", exact: true }).click();
  await page.getByRole("button", { name: /다음/ }).click();
  for (let i = 0; i < 3; i++) {
    if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
    await 아무거나답하고다음(page);
  }
}

test.describe("B계열 — 신규 동작", () => {
  test("B1 질문은 6개 고정이고 생략 고지가 없다", async ({ page }) => {
    await start(page);
    await answerAll(page);

    // 시스템이 먼저 끝내지 않으므로 "여쭤보지 않았습니다"가 나올 일이 없다
    await expect(page.getByText(/여쭤보지 않았습니다/)).toHaveCount(0);
    await expect(page.locator("#qtitle")).toHaveCount(0);

    await approveToCartReview(page);
    // 안 물어본 항목이 없으므로 그 사유 문구도 없다
    await expect(page.getByText(/여쭤보지 않아서/)).toHaveCount(0);
  });

  /* 「상관없어요」가 남은 질문은 맵기 하나다 — 형태·이용 방식에서는 뺐다(시안의 «둘 중
     하나»를 흐리지 않으려고). 그래서 «전부 상관없어요»라는 상태는 화면에서 만들 수 없고,
     여기서 재는 것은 **상관없다고 답한 항목을 메뉴 값으로 정하고 그 사실을 밝히는가**다. */
  test("B2 '상관없어요'로 답한 항목은 메뉴 값으로 정해지고, 카드는 그 값만 보여준다", async ({ page }) => {
    await start(page);
    await enterWizard(page);
    await page.getByRole("button", { name: "없어요", exact: true }).click(); // 알레르기 없음
    await page.getByRole("button", { name: /다음/ }).click();

    await page.getByRole("button", { name: "상관없어요" }).click();          // 맵기
    await page.getByRole("button", { name: /다음/ }).click();
    await page.getByRole("button", { name: "순살", exact: true }).click();    // 형태 — 골라야 한다
    await page.getByRole("button", { name: /다음/ }).click();
    await page.getByRole("button", { name: "포장하기" }).click();             // 이용 방식 — 골라야 한다
    await page.getByRole("button", { name: /다음/ }).click();
    // 수량은 증감이고 1이 이미 떠 있다 — 그 값이 곧 답이므로 누를 것이 없다
    await page.getByRole("button", { name: /다음/ }).click();
    await page.getByRole("button", { name: "상관없어요" }).click(); // 예산
    await page.getByRole("button", { name: /추천 보기|다음/ }).click();

    // 전부 답했으므로 생략 고지가 없어야 한다
    await expect(page.getByText(/여쭤보지 않았습니다/)).toHaveCount(0);
    await page.getByRole("button", { name: "선택하기", exact: true }).click();
    /* 카드에는 선택된 옵션 값만 남는다(3차 QA 2026-08-13) — «상관없다고 하셔서 …» 출처
       문장은 걷어냈다. 실제로 정해진 값 자체는 «옵션:» 줄이 그대로 보여준다. */
    await expect(page.locator(".cart-box .cart-sub", { hasText: "옵션:" })).toBeVisible();
    await expect(page.locator(".cart-box").getByText(/상관없다고 하셔서/)).toHaveCount(0);
  });

  test("B4 확정되지 않은 추천을 두 번 만나면 안전 중단 전용 화면", async ({ page }) => {
    await start(page);
    await enterWizard(page);
    /* 한때 예산 5,000원으로 이 상태를 만들었다 — 이 가게 최저가(5,500원)보다 낮아 살 수
       있는 것이 없었다. 예산이 상한이 아니라 **희망 금액**이 된 뒤로 가격은 후보를 빼지
       않으므로 그 길은 없어졌다. 없앤 것이 기획의 뜻이다 — 조건이 조금 안 맞아도 가장
       가까운 것을 권한다.

       «확정되지 않은 추천»의 다른 갈래는 그대로다: 알레르기가 **미확인**이면 임의로
       판단하지 않고 재확인을 요구한다. 「모름」은 시안에 없어 화면에서 고를 수 없지만
       값은 살아 있고(model.ts), 옛 저장본으로 들어온다. 그 경로로 만든다. */
    await page.evaluate(() => {
      localStorage.setItem("kb23c-saved-settings-v4", JSON.stringify({
        answers: { allergies: ["모름"], spicyLevel: "매운맛", boneType: "순살",
                   serviceType: "포장", quantity: 1, budgetKrw: "없음" },
        a11y: { largeText: true, highContrast: false, simpleSteps: true, visualGuidance: false,
                hearingSupport: false, mobilitySupport: false, staffAssistancePreferred: false,
                preferredInput: "TOUCH" },
        scope: "LASTING", savedAt: "2026-08-11T10:00:00.000Z",
      }));
    });
    await page.reload();
    await page.getByRole("button", { name: "QR 없이 계속하기" }).click(); // 연동 관문을 지나 재방문 홈으로
    await page.getByRole("button", { name: /지난번과 똑같이 주문하기/ }).click();

    // 1회차 — 사유는 말하지만 중단 화면은 아니다. 조건을 고칠 기회를 먼저 준다.
    // 그 길은 «수정하기»다 — 메뉴 확인 화면에서 조건 수정으로 가는 라벨(QA 5차 2026-08-14)
    await expect(page.getByRole("heading", { name: /추천 메뉴를 찾지 못했습니다/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "수정하기" })).toBeVisible();

    // 조건 수정 화면으로 가서 그대로 다시 추천 → 2회차
    await page.getByRole("button", { name: "수정하기" }).click();
    await page.getByRole("button", { name: "수정 완료" }).click();
    await expect(page.getByRole("heading", { name: /추천 메뉴를 찾지 못했습니다/ })).toBeVisible();
    /* «왜 멈췄나요?» 접힘은 1차 QA 후 사용자 결정으로 걷어냈다(2026-08-13) —
       화면은 시안(99:1337) 조각과 출구 두 개뿐이다. 다시 생기면 여기서 걸린다. */
    await expect(page.getByText("왜 멈췄나요?")).toHaveCount(0);
  });

  test("B6 v3 저장본이 살아남고 프로필·세션 키로 쪼개져 옮겨진다", async ({ page }) => {
    await page.goto("http://localhost:5173/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("kb23c-saved-settings-v3", JSON.stringify({
        answers: { allergies: ["땅콩"], spicyLevel: "매운맛", boneType: "순살" },
        a11y: { largeText: true, highContrast: false },
        scope: "LASTING", savedAt: "2026-08-08T10:00:00.000Z",
      }));
    });
    await page.reload();
    await page.getByRole("button", { name: "QR 없이 계속하기" }).click(); // 연동 관문을 지나 재방문 홈으로
    await expect(page.getByRole("heading", { name: /다시 오셨네요/ })).toBeVisible();
    await 저장된내용펼치기(page);
    await expect(page.getByText(/땅콩/)).toBeVisible();

    /* 저장소가 프로필·세션 둘로 나뉘었다(QA 1차 2026-08-13) — 옛 통합 저장본은
       화면 설정이 프로필 키로, 답변이 세션 키로 가고, 옛 키는 지워진다. */
    const moved = await page.evaluate(() => ({
      profile: localStorage.getItem("kb23c-profile-v1") !== null,
      session: localStorage.getItem("kb23c-session-v1") !== null,
      v4: localStorage.getItem("kb23c-saved-settings-v4") === null,
      v3: localStorage.getItem("kb23c-saved-settings-v3") === null,
    }));
    expect(moved.profile).toBe(true);
    expect(moved.session).toBe(true);
    expect(moved.v4).toBe(true);
    expect(moved.v3).toBe(true);
  });

  test("B8 기기 간 인계 기능이 없으므로 관련 표현도 없다", async ({ page }) => {
    await start(page);
    await answerAll(page);
    await approveToCartReview(page);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/넘기기|다른 기기/);
  });

  test("B3 첫 질문은 항상 알레르기다 — 하드제약을 가장 먼저 확정한다", async ({ page }) => {
    await start(page);
    await enterWizard(page);
    await expect(page.locator("#qtitle")).toHaveText(/알레르기/);
  });

  test("B7 지난 주문 재현은 확인을 거쳐야 진행된다", async ({ page }) => {
    await page.goto("http://localhost:5173/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "QR 없이 계속하기" }).click(); // 연동 관문을 지나 홈으로

    await enterWizard(page);
    for (let i = 0; i < 6; i++) {
      if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
      await 아무거나답하고다음(page);
    }
    await approveToCartReview(page);

    // 확인 화면에는 저장 얘기가 없다 — 결제 직전에 다음 방문 판단을 시키지 않는다
    await expect(page.getByRole("button", { name: "주문하기", exact: true })).toBeVisible();
    await expect(page.getByText(/저장/)).toHaveCount(0);

    // CTA 는 시안 라벨 «주문하기» 하나다 — 라이브(실행)든 체험 모드(계획 보관)든 같다
    await page.getByRole("button", { name: "주문하기", exact: true }).click();

    /* 주문이 끝나면 S15 «안내·저장 유도»가 **세션(오늘의 답변·메뉴)** 저장을 묻는다
       (QA 1차 2026-08-13). 프로필(화면 설정)은 S03 에서 이미 정했으므로 같은 결정을
       두 번 묻는 것이 아니다 — 두 저장은 대상이 다르다. 범위를 쪼개 묻지 않는 것은
       그대로다. */
    await expect(page.getByRole("heading", { name: /오늘 입력한 내용을 저장할까요/ })).toBeVisible();
    await expect(page.getByRole("group", { name: "저장 범위" })).toHaveCount(0); // 범위는 묻지 않는다
    await page.getByRole("button", { name: "이번만 사용", exact: true }).click();

    // 결과 화면은 이점을 들어 한 번 더 권한다 (QA 4차 2026-08-13) — 아래 저장 버튼이 답이 된다
    await expect(page.getByRole("heading", { name: "오늘 입력한 내용을 저장할까요?" })).toBeVisible();
    await expect(page.getByText(/다음 방문 시 입력 과정 없이/)).toBeVisible();
    // 마음을 바꿀 길은 남아 있다 — 뒤집으면 그 자리에서 저장된다
    await page.getByRole("button", { name: "이 기기에 저장하기" }).click();
    await expect(page.getByRole("heading", { name: "이 기기에 저장했습니다" })).toBeVisible();

    await page.getByRole("button", { name: "처음으로" }).first().click();
    await expect(page.getByRole("heading", { name: /다시 오셨네요/ })).toBeVisible();

    // 저장된 것은 카드 하나에만 모이고, 새로 시작하는 길도 하나뿐이다 — 흩어지지 않는다
    await expect(page.locator("section[aria-label='이 기기에 저장된 기록']")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^새로 설정하기$/ })).toHaveCount(1);

    await page.getByRole("button", { name: /지난번과 똑같이 주문하기/ }).click();
    // 실행으로 직행하지 않는다 — 확인을 거쳐야 한다
    await expect(page.getByRole("button", { name: "선택하기", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /실행 결과|주문이 완성되었습니다/ })).toHaveCount(0);
  });

  /* C계열 — participant-ux.json 의 선언이 화면에서 실제로 동작하는가.
     수기 검토(MANUAL_REVIEW) 대상이라 선언과 화면이 어긋나면 그 자체가 감점이다. */
  test("C1 선언한 접근성 채널이 전부 화면을 실제로 바꾼다", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: /^(시작하기|새로 설정하기)$/ }).click();
    /* 설정 목록은 프로필 3/3 의 «자세한 설정» 안에 있다 — 상단바 토글이 없어지면서
       여기가 8종에 닿는 유일한 자리가 됐다. 선언한 채널이 화면에서 닿지 않으면
       «없는 기능을 있다고 말한 것»이 되므로, 이 검사는 그 자리까지 걸어가서 잰다.
       기본은 접힘이라(기획 2026-08-12) 한 번 펼치는 것까지가 «닿는 길»이다. */
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "필요한 안내 방식을 선택해주세요" })).toBeVisible();
    await page.locator("details.p-more > summary").click();

    const app = page.locator(".app");
    const row = (name: string) => page.locator(".a11ylist .a11yrow", { hasText: name });

    // largeText 는 기본 꺼짐(기본 크기, 기획 2026-08-12) — 켜고 끄며 실제로 바뀌는지 확인
    await row("큰 글씨").click();
    await expect(app).toHaveClass(/large/);
    await row("큰 글씨").click();
    await expect(app).not.toHaveClass(/large/);

    await row("고대비").click();
    await expect(app).toHaveClass(/contrast/);

    await row("누르기 편하게").click();
    await expect(app).toHaveClass(/roomy/);   // LARGER_TOUCH_TARGETS

    await row("화면 안내").click();
    await expect(app).toHaveClass(/guide/);   // VISUAL_GUIDANCE

    await row("직원 도움 먼저").click();
    await expect(page.locator(".staffbar")).toBeVisible(); // STAFF_HELP

    await row("소리 없이 보기").click();
    /* «설정 마치기»는 없어졌다 — 프로필은 이제 세 걸음짜리 흐름이라 나가는 문이
       «다음»(앞으로)과 «뒤로»뿐이다. 소리 안내 고지는 홈에 붙으므로 왔던 길을 되짚는다
       (3/3 → 2/3 → 1/3 → 홈). 켠 설정은 화면 상태에 남아 홈까지 따라온다. */
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "뒤로", exact: true }).click();
    await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요|다시 오셨네요/ })).toBeVisible();
    await expect(page.getByText(/소리 안내를 사용하지 않습니다/)).toBeVisible(); // HEARING_SUPPORT
  });

  /**
   * 이 검사는 뒤집혔다.
   *
   * 예전에는 «QR 기능이 없으므로 화면에 QR 표현이 없다»를 검사했다 — 링크 인계를
   * 걷어낸 뒤로 QR 이 정말 없었기 때문이다. 지금은 매장 QR 을 **읽는** 화면이 있다.
   * 우리가 QR 을 만드는 것이 아니라 카메라로 읽기만 하므로 브라우저 내장 기능으로
   * 충분했고, 새 의존성도 서버도 필요하지 않았다.
   *
   * 그래서 검사할 것도 바뀐다. «있다/없다»가 아니라 **하지 않은 일을 한 것처럼
   * 말하지 않는가**를 본다. 서버가 없으므로 세션을 발급받을 수는 없고, 여기서 하는
   * 일은 QR 에 적힌 매장 코드를 우리가 가진 환경과 맞춰 보는 것까지다.
   */
  test("C3 연동 관문은 QR 을 읽기만 하며, 하지 않은 일을 한 것처럼 말하지 않는다", async ({ page }) => {
    /* 관문은 홈보다 앞에 선다(기획 2026-08-12) — 그냥 열면 이것이 첫 화면이다. */
    await page.goto("http://localhost:5173/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole("heading", { name: /매장 QR|QR을 읽을 수 없습니다/ })).toBeVisible();
    // 헤드리스에는 카메라가 없다 — 판단이 끝나면 직접 입력이 저절로 펴진다
    await expect(page.getByRole("status").first()).not.toHaveText("카메라를 준비하고 있습니다.");

    const body = await page.locator("body").innerText();
    // 세션 발급·서버 연결처럼 우리가 하지 않는 일을 했다고 쓰지 않는다
    expect(body).not.toMatch(/세션이? (발급|생성)|서버에 (연결|등록)|로그인/);
    // 카메라를 못 쓰는 사람에게도 앞으로 갈 길이 같은 화면에 있어야 한다
    await expect(page.getByRole("button", { name: /QR 없이 계속하기/ })).toBeVisible();
    await expect(page.getByRole("textbox")).toBeVisible(); // 매장 코드 직접 입력 (자동으로 펴짐)
  });

  test("B9 다른 메뉴 카드에 제외된 후보가 없다 — 생존 후보만 점수순", async ({ page }) => {
    /* 메뉴 선택 화면(점수순 전체 목록·상위 3개 «추천» 표시)은 없어졌다(QA 5차 후속
       2026-08-14) — 조건 수정 화면에서 '메뉴' 행이 빠지며 유일한 입구가 사라졌다.
       «제외된 후보를 되살리지 않는다»는 결정은 메뉴 확인의 다른 메뉴 카드가 그대로
       진다 — 카드도 생존 후보(scoreBreakdown)만 점수순으로 선다. */
    await start(page);
    await answerAll(page); // 땅콩·콩 알레르기 → 해당 후보 제외됨
    await expect(page.getByRole("heading", { level: 2, name: /이 메뉴를 선택하시겠어요/ })).toBeVisible();

    const names = await page.locator(".mc-altcard .menu-name").allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    // 땅콩 토핑(PEANUT)·간장 순살(SOY)은 제외됐으므로 카드에 없어야 한다
    expect(names.join(" ")).not.toContain("땅콩 토핑");
    expect(names.join(" ")).not.toContain("간장 순살");

    // 고르면 그 자리에서 위 카드로 올라온다 — 직접 선택(MODIFY) 재확인
    const 첫대안 = names[0];
    await page.locator(".mc-altcard").first().click();
    await expect(page.locator(".cart-name")).toHaveText(첫대안);
  });
});
