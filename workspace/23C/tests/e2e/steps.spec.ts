/**
 * 진행 표시는 시안 좌표를 지킨다 (Figma StepIndicator 181:177).
 *
 * 시안은 첫 점을 `left-0`, 마지막 점을 오른쪽 끝에 두고 나머지를 그 사이에 고르게 놓는다.
 * 즉 **첫 점의 왼쪽 끝이 제목·부제의 왼쪽 선과 같다.** 우리는 오랫동안 다섯 칸을 균등
 * 분할해 점을 각 칸 «가운데»에 두었고, 그래서 첫 점이 한 칸의 절반만큼 안쪽으로 밀려
 * 있었다. 눈에 띄는 어긋남이라 기획이 바로 지적했다.
 *
 * 고치는 과정에서 더 나쁜 것이 하나 나왔다 — flex 항목의 자동 최소 크기 때문에 90px
 * 라벨을 담은 칸이 점 크기(22px)를 무시하고 부풀어, 다섯 칸이 화면을 넘치고 마지막
 * 「세션 시작」이 잘려 나갔다. **다섯 단계 중 하나가 화면에 없는데도 e2e 는 전부 통과했다.**
 * 좌표를 재는 검사가 없었기 때문이다. 그래서 여기서 좌표를 잰다.
 */
import { expect, test } from "@playwright/test";
import { openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

test("다섯 단계가 전부 화면 안에 있다 — 하나도 잘리지 않는다", async ({ page }) => {
  await openHome(page);
  const 점 = page.locator(".kb-dot");
  await expect(점, "5단계 표시인데 점이 다섯 개가 아닙니다").toHaveCount(5);

  const 폭 = page.viewportSize()!.width;
  for (let i = 0; i < 5; i++) {
    const box = (await 점.nth(i).boundingBox())!;
    expect(box.x, `${i + 1}번째 점이 화면 왼쪽 밖에 있습니다`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${i + 1}번째 점이 화면 오른쪽 밖으로 잘렸습니다`).toBeLessThanOrEqual(폭);
  }
});

test("단계 이름이 잘리지 않는다 — 그리고 문서가 가로로 밀리지 않는다", async ({ page }) => {
  await openHome(page);
  /* 양끝 라벨은 점 중심에 맞추느라 상자 밖으로 나간다. 자르면 「세션 시작」이 「세션 시」가
     되고(실제로 그렇게 났다), 안 자르면 화면이 가로로 밀릴 수 있다. 둘 다 아니어야 한다. */
  // QR 연동은 흐름의 1걸음이다(기획 확정 2026-08-12) — 라벨 다섯이 전부 있어야 한다
  for (const 이름 of ["QR 연동", "홈", "프로필 생성", "저장 방식", "세션 시작"]) {
    const 잘렸나 = await page.locator(".kb-steplabel", { hasText: 이름 }).first()
      .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(잘렸나, `단계 이름 «${이름}»이 잘려 있습니다`).toBe(false);
  }
  const 밀렸나 = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(밀렸나, "라벨이 넘쳐 문서가 가로로 스크롤됩니다").toBe(false);
});

test("첫 점의 왼쪽 선이 제목·부제와 같다 (시안 181:177 `left-0`)", async ({ page }) => {
  await openHome(page);
  const 자리 = await page.evaluate(() => {
    const px = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().left) : NaN);
    return {
      dot: px(document.querySelector(".kb-dot")),
      title: px(document.querySelector(".kb-title")),
      subtitle: px(document.querySelector(".kb-subtitle")),
      cta: px(document.querySelector(".kb-actions .btn")),
    };
  });
  expect(자리.dot, `첫 점 ${자리.dot}px · 제목 ${자리.title}px — 왼쪽 선이 어긋납니다`).toBe(자리.title);
  expect(자리.subtitle).toBe(자리.title);
  expect(자리.cta, "아래 버튼도 같은 선에서 시작해야 합니다").toBe(자리.title);
});

test("마지막 점은 오른쪽 선에 붙는다 — 사이 간격이 고르다", async ({ page }) => {
  await openHome(page);
  const 중심 = await page.locator(".kb-dot").evaluateAll((els) =>
    els.map((e) => { const r = e.getBoundingClientRect(); return r.left + r.width / 2; }));

  const cta = (await page.locator(".kb-actions .btn").boundingBox())!;
  const 반지름 = (await page.locator(".kb-dot").first().boundingBox())!.width / 2;
  expect(Math.round(중심[중심.length - 1] + 반지름), "마지막 점이 오른쪽 선에 붙지 않았습니다")
    .toBe(Math.round(cta.x + cta.width));

  const 간격 = 중심.slice(1).map((c, i) => c - 중심[i]);
  for (const g of 간격) expect(Math.abs(g - 간격[0]), `간격이 고르지 않습니다: ${간격.join(", ")}`).toBeLessThan(1);
});
