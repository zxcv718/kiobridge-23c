/**
 * 「화면 안내」가 시안이 적은 그 일을 하는가 (Figma 150:509).
 *
 * 시안의 설명은 «다음에 누를 버튼을 테두리와 화살표로 강조해서 알려드려요»다.
 * 우리는 그 자리에 오랫동안 다른 기능(«선택지에 그림 병기»)을 넣어 두었고, 시안에 적힌
 * 기능은 만들지 않았다. 그러면 화면이 제 설명과 다른 말을 하게 된다 — 설정 이름을 읽고
 * 켠 사람이 기대한 것이 나오지 않는다는 뜻이고, 이 서비스에서는 그게 가장 큰 결함이다.
 *
 * 그래서 세 가지를 못 박는다:
 *  ① 켜면 실제로 아래 주 버튼이 강조된다 (테두리 + 화살표)
 *  ② 선택지 그림은 이 설정과 **무관하게 늘 있다** — 시안에서 그림은 토글 대상이 아니다
 *  ③ 아직 아무것도 고르지 않은 동안에는 **선택지 영역**을 가리킨다. 그때 다음에 누를
 *    것은 «다음»이 아니라 선택지이고, 실제로 «다음»은 눌리지 않는 상태다. 가리키는 곳은
 *    언제나 하나다 — 고르는 순간 선택지 쪽 테두리를 거두고 «다음»으로 넘긴다.
 */
import { expect, test, type Page } from "@playwright/test";
import { openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/** 프로필 3/3 까지 가서 「안내 켜짐」을 고르고, 질문 화면 직전까지 간다. */
async function 안내켜고(page: Page, 켤까: boolean): Promise<void> {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  if (켤까) await page.getByRole("button", { name: "안내 켜짐" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용" }).click();
  await page.getByRole("button", { name: "QR 없이 계속하기" }).click();
  await page.getByRole("button", { name: /^(주문 시작하기|아니오)$/ }).click();
  await expect(page.locator("#qtitle")).toBeVisible();
}

/** 아래 버튼바에 화살표가 실제로 «보이는가» — 자리는 늘 있으므로 투명도로 잰다. */
const 화살표보임 = (page: Page) =>
  page.locator(".kb-actions").evaluate((el) => {
    const s = getComputedStyle(el, "::after");
    return s.content !== "none" && Number(s.opacity) > 0.5;
  });

/** 선택지 영역에 안내 고리가 그려져 있는가 — «다음» 쪽과 같은 문법(7px 고리)으로 잰다. */
const 선택지고리 = (page: Page) =>
  page.locator(".q-choices .choices").first()
    .evaluate((el) => getComputedStyle(el).boxShadow);

const 고리있음 = /0px 0px 0px 7px|0 0 0 7px/;

test("안내를 켜면 고르기 전에는 선택지 영역을 가리키고, 고르면 «다음»으로 넘긴다", async ({ page }) => {
  await 안내켜고(page, true);

  /* 아직 아무것도 고르지 않았다 — 다음에 누를 것은 «다음»이 아니라 선택지다.
     이 구간이 그동안 비어 있었다: «다음»은 눌리지 않아 가리키지 않고, 선택지에는
     아무 표시도 없었다. 안내를 켠 사람이 가장 헤매는 순간이 바로 여기다. */
  expect(await 화살표보임(page), "누를 수 없는 버튼을 가리킵니다").toBe(false);
  expect(await 선택지고리(page), "고르기 전인데 선택지 영역에 안내 테두리가 없습니다")
    .toMatch(고리있음);

  /* 고리 반경은 **선택지 반경과 같아야 한다.** box-shadow 의 spread 는 모서리를
     «요소 반경 + spread» 로 그리므로, 격자 반경이 선택지보다 크면 두 곡선의 중심이
     어긋나 직선 구간 4px 이던 여백이 모서리에서 2.3px 로 좁아진다. 주황 선 자체는
     3px 로 일정한데도 틀이 모서리에서만 두꺼워 보인다 — 눈에는 «두께가 들쭉날쭉»
     으로 읽히지만 원인은 두께가 아니라 반경이라 그 자리를 보고는 못 찾는다. */
  const [고리반경, 선택지반경] = await Promise.all([
    page.locator(".q-choices .choices").first()
      .evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
    page.locator(".q-choices .choice").first()
      .evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
  ]);
  expect(고리반경, "안내 고리 반경이 선택지와 달라 모서리에서 틀 두께가 달라 보입니다")
    .toBe(선택지반경);

  await page.getByRole("button", { name: "없어요", exact: true }).click();

  // 골랐으면 가리킬 곳이 «다음»으로 옮겨간다 — 두 곳을 동시에 가리키지 않는다
  expect(await 화살표보임(page), "골랐는데 «다음» 쪽 화살표가 없습니다").toBe(true);
  expect(await 선택지고리(page), "이미 골랐는데 선택지 영역을 계속 가리킵니다")
    .not.toMatch(고리있음);
});

/**
 * 화살표가 흔들려도 고리를 파고들지 않는가.
 *
 * 화살표는 1.5em 이라 «큰 글씨»(기본값이다)를 켜면 같이 커지는데, 지나갈 통로가 44px
 * 고정이던 때는 그 커진 만큼이 그대로 고리 위로 넘어갔다. 겹치면 화살표와 고리가 한
 * 덩어리로 읽혀, «저기를 누르세요»가 «버튼에 붙은 장식»이 된다.
 *
 * 그래서 통로를 --fs 에 비례해 잡고(styles.css .app.guide .kb-actions), 여기서는 그
 * 계산이 실제로 여유를 남기는지 **가장 내려온 순간**에 잰다. 흔들림을 그 프레임에
 * 세워 두고 재는 이유는, 안 세우면 우연히 위에 있을 때 통과하기 때문이다.
 */
test("안내 화살표는 가장 내려왔을 때도 고리를 파고들지 않는다", async ({ page }) => {
  await 안내켜고(page, true);
  await page.addStyleTag({ content: `.app.guide .kb-actions::after {
    animation-delay: -0.7s !important; animation-play-state: paused !important; }` });

  const m = await page.locator(".kb-actions").evaluate((el) => {
    const cs = getComputedStyle(el);
    const after = getComputedStyle(el, "::after");
    const px = (v: string) => parseFloat(v);
    /* 흔들림 폭은 커스텀 속성이라 calc() 문자열로 나온다 — 멈춘 프레임의 transform 에서
       실제 적용량을 읽는다. keyframes 안의 var() 가 도는지도 이 줄이 함께 지킨다. */
    const t = new DOMMatrixReadOnly(after.transform === "none" ? undefined : after.transform);
    return {
      화살표아래끝: px(after.top) + px(after.fontSize) + t.m42, // line-height: 1 이라 글자상자 = font-size
      고리위끝: px(cs.paddingTop) - 7,                          // box-shadow spread 7px
    };
  });

  expect(m.고리위끝 - m.화살표아래끝,
    `화살표가 고리에 ${(m.화살표아래끝 - m.고리위끝).toFixed(1)}px 까지 닿습니다`)
    .toBeGreaterThan(0);
});

test("안내를 끄면 선택지 영역에도 테두리가 없다", async ({ page }) => {
  await 안내켜고(page, false);
  expect(await 선택지고리(page), "묻지도 않고 선택지 영역을 가리킵니다").not.toMatch(고리있음);
});

test("안내를 켜면 다음 버튼이 테두리와 화살표로 강조된다", async ({ page }) => {
  await 안내켜고(page, true);
  await expect(page.locator(".app")).toHaveClass(/guide/);

  // 답을 고르기 전에는 «다음»을 누를 수 없으므로 가리키지 않는다
  expect(await 화살표보임(page), "누를 수 없는 버튼을 다음에 누를 버튼이라고 가리킵니다").toBe(false);

  await page.getByRole("button", { name: "없어요", exact: true }).click();
  expect(await 화살표보임(page), "안내를 켰는데 화살표가 없습니다").toBe(true);

  /* 테두리 — 시안의 «테두리»에 해당하는 고리다. 초점 테두리(outline)와 다른 수단을 쓰는
     이유는 같은 자리에 겹치면 «지금 초점이 어디인가»가 안내에 묻히기 때문이다. */
  const 고리 = await page.getByRole("button", { name: "다음", exact: true })
    .evaluate((el) => getComputedStyle(el).boxShadow);
  expect(고리, "다음 버튼에 강조 테두리가 없습니다").toMatch(/0px 0px 0px 7px|0 0 0 7px/);
});

test("안내를 끄면 강조가 없다 — 켜지도 않은 것이 화면에 나오지 않는다", async ({ page }) => {
  await 안내켜고(page, false);
  await expect(page.locator(".app")).not.toHaveClass(/guide/);
  await page.getByRole("button", { name: "없어요", exact: true }).click();
  expect(await 화살표보임(page), "묻지도 않고 안내를 켰습니다").toBe(false);
});

test("선택지 그림은 안내를 끄든 켜든 늘 있다 — 시안에서 그림은 토글 대상이 아니다", async ({ page }) => {
  for (const 켤까 of [false, true]) {
    await 안내켜고(page, 켤까);
    const 그림 = await page.locator(".q-choices .choice .ico").count();
    expect(그림, `안내 ${켤까 ? "켬" : "끔"} 에서 선택지 그림이 사라졌습니다`).toBeGreaterThan(0);
  }
});
