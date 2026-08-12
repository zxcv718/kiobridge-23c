/**
 * 보이는 대로 눌리는가 — «눌렀는데 다른 게 눌리는» 결함을 잡는다.
 *
 * 화면 아래 고정된 버튼바(.kb-actions)는 레이아웃 **위에 덧그려진다.** 그래서 내용이
 * 그 밑을 지나갈 때, 버튼은 멀쩡히 보이는데 손가락은 바에 닿는다. 눈으로는 절대
 * 못 잡는다 — 버튼이 보이기 때문이다. 실제로 이렇게 났다: 「화면 글씨 맞춰보기」의
 * «조금 작아요»를 누르면 그 자리의 주인이 «직원 도움»이었고, 조금 다른 위치에서는
 * «다음»이 눌려 고대비 설정 화면으로 넘어갔다.
 *
 * 그래서 «버튼이 보이는가»가 아니라 **«그 버튼의 한가운데를 누르면 그 버튼이 눌리는가»**를
 * 잰다. 브라우저의 elementFromPoint 는 실제로 손가락이 닿는 것을 돌려준다.
 */
import { expect, test, type Page } from "@playwright/test";
import { answerWizard, enterWizard, openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/**
 * 지금 화면의 모든 버튼에 대해 «보이게 스크롤한 뒤 한가운데를 누르면 무엇이 눌리는가»를 잰다.
 *
 * scrollIntoViewIfNeeded 를 쓰는 이유: 사람도 그렇게 한다. 버튼이 보일 만큼만 내리고,
 * 보이면 누른다. 브라우저의 «보이게»는 레이아웃만 보므로 덧그려진 바를 모른다 —
 * 바로 그 어긋남이 이 결함이다.
 */
async function 가려진버튼(page: Page): Promise<string[]> {
  const buttons = page.locator("button:visible");
  const n = await buttons.count();
  const 결과: string[] = [];
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    await b.scrollIntoViewIfNeeded().catch(() => undefined);
    const 판정 = await b.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      const cx = r.x + r.width / 2;
      const cy = Math.max(r.top, 0) / 2 + Math.min(r.bottom, window.innerHeight) / 2;
      if (cy < 0 || cy > window.innerHeight) return null;   // 화면 밖이면 판정하지 않는다
      const hit = document.elementFromPoint(cx, cy);
      const owner = hit?.closest("button");
      if (owner === el) return null;
      const 이름 = (t: Element | null | undefined) => (t?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 20);
      return `«${이름(el)}» 를 누르면 → ${owner ? `«${이름(owner)}»` : `버튼이 아닌 ${hit?.tagName ?? "빈 곳"}`}`;
    });
    if (판정) 결과.push(판정);
  }
  return 결과;
}

test("프로필 3단계 — 자세한 설정을 펼쳐도 모든 토글이 눌린다", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  // 기본은 접힘이다(기획 2026-08-12) — 접힌 채로 재면 토글 일곱이 검사에서 조용히 빠진다
  await page.locator("details.p-more > summary").click();
  expect(await 가려진버튼(page)).toEqual([]);
});

test("질문·장바구니 화면에서도 보이는 대로 눌린다", async ({ page }) => {
  await openHome(page);
  await enterWizard(page);
  expect(await 가려진버튼(page), "첫 질문").toEqual([]);

  await answerWizard(page, []);
  expect(await 가려진버튼(page), "추천 화면").toEqual([]);
});
