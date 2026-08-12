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
import { 아무거나답하고다음, 저장된내용펼치기, HOME, enterWizard, openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

const 아래버튼 = (page: Page) =>
  page.locator(".kb-actions button").evaluateAll((els) =>
    els.map((e) => (e.textContent ?? "").trim().replace(/\s+/g, " ")));

/** 저장본을 만들고 홈으로 돌아온다 */
async function 재방문홈(page: Page): Promise<void> {
  await openHome(page);
  await enterWizard(page, true);
  for (let i = 0; i < 6; i++) {
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
  expect(버튼[0]).toMatch(/지난번과 똑같이 주문하기|이전 화면 설정 사용/);
  expect(버튼[1]).toMatch(/새로 설정하기/);
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
     아래 버튼을 셋으로 늘리면 시안의 두 장이 무너진다. 삭제는 「새로 설정하기」가
     겸하고(이름이 이미 그 뜻이다), 조회와 수정은 «저장된 내용 보기» 안에 접어 둔다. */
  await 저장된내용펼치기(page);
  const 수정 = page.getByRole("button", { name: /저장된 내용 수정/ });
  await expect(수정, "저장된 내용을 고칠 길이 없습니다").toBeVisible();
  const 본문안 = await 수정.evaluate((el) => !!el.closest(".kb-screen-body") && !el.closest(".kb-actions"));
  expect(본문안, "수정 버튼이 아래 버튼 더미에 있습니다").toBe(true);

  // 삭제는 아래 버튼이 겸한다 — 되돌릴 수 없으므로 한 번 되묻는다
  await page.getByRole("button", { name: "새로 설정하기" }).click();
  await expect(page.getByRole("alert")).toContainText("되돌릴 수 없습니다");
  await page.getByRole("button", { name: /네, 지우고 새로 시작할게요/ }).click();
  const 남았나 = await page.evaluate(() => localStorage.getItem("kb23c-saved-settings-v4"));
  expect(남았나, "«새로 설정»인데 기록이 남아 있습니다").toBeNull();
});
