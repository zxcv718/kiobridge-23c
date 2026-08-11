/**
 * 비상구는 머리 줄에, 아래는 그 화면의 주 동작만.
 *
 * 재방문 홈의 아래 버튼이 넉 장(시작·새로·지우기·직원 도움)이라 화면의 3분의 1을
 * 차지했다. 시안(150:190)의 아래 버튼은 **둘**이다 — 「이전 화면 설정 사용」·「새로 설정하기」.
 *
 * 직원 도움을 «떠 있는 버튼(FAB)»으로 두는 길도 있었지만 택하지 않았다. 떠 있는 것은
 * 내용을 덮고, 덮인 부분은 눌러도 딴 것이 눌린다 — tap-target.spec.ts 가 잡은 결함이
 * 정확히 그것이다. 머리 줄은 뒤로가기 하나뿐이라 오른쪽이 늘 비어 있었고, 거기 두면
 * 자기 자리를 차지하므로 아무것도 가리지 않는다.
 */
import { expect, test, type Page } from "@playwright/test";
import { 아무거나답하고다음, HOME, enterWizard, openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

const 아래버튼 = (page: Page) =>
  page.locator(".kb-actions button").evaluateAll((els) =>
    els.map((e) => (e.textContent ?? "").trim().replace(/\s+/g, " ")));

/** 저장본을 만들고 홈으로 돌아온다 */
async function 재방문홈(page: Page): Promise<void> {
  await openHome(page);
  await enterWizard(page, true);
  for (let i = 0; i < 7; i++) {
    if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
    await 아무거나답하고다음(page);
  }
  await page.goto(HOME);
  await expect(page.getByRole("heading", { name: /다시 오셨네요/ })).toBeVisible();
}

test("재방문 홈의 아래 버튼은 시안대로 둘뿐이다", async ({ page }) => {
  await 재방문홈(page);
  const 버튼 = await 아래버튼(page);
  expect(버튼.length, `아래 버튼이 ${버튼.length}장입니다: ${버튼.join(" / ")}`).toBe(2);
  expect(버튼[0]).toMatch(/지난번과 똑같이 주문하기|저장된 설정으로 시작하기/);
  expect(버튼[1]).toMatch(/처음부터 새로 시작하기/);
});

test("아래 버튼바가 화면을 반쯤 먹지 않는다", async ({ page }) => {
  await 재방문홈(page);
  const 비율 = await page.evaluate(() => {
    const el = document.querySelector(".kb-actions")!;
    return el.getBoundingClientRect().height / window.innerHeight;
  });
  expect(비율, `아래 버튼바가 화면의 ${Math.round(비율 * 100)}% 를 차지합니다`).toBeLessThan(0.25);
});

test("삭제와 수정 둘 다 닿는다 — 아래 버튼 자리를 쓰지 않고", async ({ page }) => {
  await 재방문홈(page);

  /* 무로그인 가이드 4번은 «조회·수정·삭제»를 요구한다. 셋 다 있어야 하지만, 그렇다고
     아래 버튼을 셋으로 늘리면 시안의 두 장이 무너진다. 삭제는 「처음부터 새로 시작하기」가
     겸하고(이름이 이미 그 뜻이다), 수정은 고칠 대상인 카드 바로 아래 둔다. */
  const 수정 = page.getByRole("button", { name: /저장된 내용 수정/ });
  await expect(수정, "저장된 내용을 고칠 길이 없습니다").toBeVisible();
  const 본문안 = await 수정.evaluate((el) => !!el.closest(".kb-screen-body") && !el.closest(".kb-actions"));
  expect(본문안, "수정 버튼이 아래 버튼 더미에 있습니다").toBe(true);

  // 삭제는 아래 버튼이 겸한다 — 누르기 전에 그 사실을 말한다
  await expect(page.locator(".home-warn")).toContainText("지웁니다");

  await page.getByRole("button", { name: "처음부터 새로 시작하기" }).click();
  const 남았나 = await page.evaluate(() => localStorage.getItem("kb23c-saved-settings-v4"));
  expect(남았나, "«처음부터 새로 시작»인데 기록이 남아 있습니다").toBeNull();
});

test("직원 도움은 어느 화면에서든 머리 줄 같은 자리에 있다", async ({ page }) => {
  await openHome(page);

  const 확인 = async (어디: string) => {
    const staff = page.getByRole("button", { name: "직원 도움", exact: true });
    await expect(staff, `${어디} 에 직원 도움이 없습니다`).toBeVisible();
    const 머리줄 = await staff.evaluate((el) => !!el.closest(".kb-header"));
    expect(머리줄, `${어디} 의 직원 도움이 머리 줄에 있지 않습니다`).toBe(true);
    const box = (await staff.boundingBox())!;
    expect(box.height, `${어디} 의 직원 도움이 48px 미만입니다`).toBeGreaterThanOrEqual(48);
  };

  await 확인("홈");
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  for (let i = 0; i < 3; i++) {
    await 확인(`프로필 ${i + 1}/3`);
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await 확인("저장 방식");
  await page.getByRole("button", { name: "이번만 사용하기" }).click();
  await 확인("QR 연동");
  await page.getByRole("button", { name: "QR 없이 계속하기" }).click();
  await 확인("세션 시작");
  await page.getByRole("button", { name: /^(주문 시작하기|아니오, 새로 고를게요)$/ }).click();
  await 확인("첫 질문");
});

test("안전 중단에서는 직원 도움이 «비상구»가 아니라 주 동작이다", async ({ page }) => {
  await openHome(page);
  await enterWizard(page);
  await page.getByRole("button", { name: /잘 모르겠어요/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
    await 아무거나답하고다음(page);
  }
  await page.getByRole("button", { name: "조건 수정" }).click();
  await page.getByRole("button", { name: /이 조건으로 추천 다시 받기/ }).click();
  await expect(page.getByRole("heading", { name: /확인이 어려워/ })).toBeVisible();

  /* 여기서는 머리 줄의 작은 버튼으로 내려가면 안 된다 — 진행이 멈춘 화면에서 다음에
     할 일이 곧 직원 도움이므로, 아래 첫 버튼이어야 한다. */
  const 아래 = await 아래버튼(page);
  expect(아래[0], `안전 중단의 첫 버튼이 «${아래[0]}» 입니다`).toContain("직원 도움");
  const 머리줄에도 = await page.locator(".kb-header .kb-staff").count();
  expect(머리줄에도, "같은 이름의 버튼이 한 화면에 둘 있습니다").toBe(0);
});
