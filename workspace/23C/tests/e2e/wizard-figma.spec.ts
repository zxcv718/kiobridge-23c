/**
 * 마법사 여섯 화면이 시안 값 그대로인가.
 *
 * Figma: 99:1228(S06 기본) · 99:1246(S06 확장) · 99:1264(S07 맵기) · 99:1270(S08 뼈/순살)
 *        99:1281(S09 포장/매장) · 99:1292(S10 수량)
 *
 * 이 검사가 있는 이유는 **시안이 바뀌기 때문**이다. 2026-08-12 에 여섯 화면을 다시 대조했더니
 * 맵기의 선택지 목록이 통째로 새 노드(282:1082)로 교체돼 있었고, 코드가 근거로 적어 둔
 * `I99:1268;56:433` 은 사라진 뒤였다. 근거가 사라진 규칙(「줄 라벨은 Bold」)만 코드에 남아
 * 시안과 다른 굵기로 그려지고 있었는데, 그 사실을 아무도 재고 있지 않았다.
 *
 * 그래서 «눈에 보이는 것»을 수치로 잰다. 시안이 또 바뀌면 이 검사가 먼저 알려주고,
 * 그때 고칠 곳은 아래 `시안` 표 하나다 — 노드 번호를 값 옆에 붙여 두는 것도 그래서다.
 */
import { expect, test, type Page } from "@playwright/test";
import { enterWizard, openHome } from "./nav";

test.use({ viewport: { width: 390, height: 844 } });

/** 시안 값 — 바꿀 때는 근거 노드를 함께 확인하고 함께 고친다. */
const 시안 = {
  /** 안내텍스트 덩어리와 선택지 사이 (99:1235 · 99:1257 · 99:1277 · 99:1288 의 gap) */
  안내텍스트아래: 34,
  /** 제목과 부제 사이 — 한 덩어리라 좁다 (99:1248 의 gap) */
  제목부제사이: 8,
  /** 타일 높이 (99:1235 · 99:1277 · 99:1288 옵션 목록 높이) */
  타일높이: 187,
  /** 줄 높이 (99:1258. 고른 줄이 73px 인 것은 테두리가 1px 씩 굵어진 몫이다) */
  줄높이: 71,
  /** 선택지 라벨 굵기 — 타일도 줄도 Regular 다 (I99:1278;38:1935 · 282:1180 · I99:1258;66:1785) */
  라벨굵기: "400",
  /** 수량 화면만 질문과 증감 사이가 넓다 (123:7 의 gap). 시안 프레임 874px 기준 값이다. */
  수량간격: 109,
};

/**
 * 지금 화면의 «시안이 정한 자리»를 잰다.
 *
 * 안내텍스트 아래 간격은 **부제가 있으면 부제부터** 잰다 — 시안에서 그 셋(인사말·제목·부제)은
 * 한 덩어리이고, 34px 은 그 덩어리와 선택지 사이의 값이기 때문이다.
 */
const 재기 = (page: Page) =>
  page.evaluate(() => {
    const px = (v: number) => Math.round(v * 10) / 10;
    const q = (s: string) => document.querySelector(s) as HTMLElement | null;
    const 제목 = q("#qtitle");
    const 부제 = q(".kb-subtitle");
    const 선택지들 = q(".q-choices .choices");
    const 증감 = q(".stepper-wrap");
    const 첫선택지 = q(".q-choices .choice");
    const 아래것 = 선택지들 ?? 증감;
    const out: Record<string, unknown> = {};

    if (아래것 && (부제 ?? 제목)) {
      out.안내텍스트아래 = px(아래것.getBoundingClientRect().top - (부제 ?? 제목)!.getBoundingClientRect().bottom);
    }
    if (부제 && 제목) {
      out.제목부제사이 = px(부제.getBoundingClientRect().top - 제목.getBoundingClientRect().bottom);
    }
    if (첫선택지) {
      out.선택지높이 = px(첫선택지.getBoundingClientRect().height);
      out.라벨굵기 = getComputedStyle(첫선택지).fontWeight;
    }
    out.본문상단여백 = px(parseFloat(getComputedStyle(q(".kb-screen-body")!).paddingTop));
    return out;
  });

/** 마법사를 한 바퀴 돌며 화면마다 잰다 — 여섯 화면이 한 흐름이므로 한 번만 걷는다. */
async function 여섯화면(page: Page) {
  await openHome(page);
  await enterWizard(page);

  const 잰것: Record<string, Awaited<ReturnType<typeof 재기>>> = {};
  잰것["S06 기본"] = await 재기(page);

  await page.getByRole("button", { name: "있어요", exact: true }).click();
  잰것["S06 확장"] = await 재기(page);

  await page.getByRole("button", { name: "대두", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  잰것["S07 맵기"] = await 재기(page);

  await page.locator(".q-choices .choice").first().click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  잰것["S08 뼈/순살"] = await 재기(page);

  await page.locator(".q-choices .choice").first().click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  잰것["S09 포장/매장"] = await 재기(page);

  await page.locator(".q-choices .choice").first().click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  잰것["S10 수량"] = await 재기(page);

  return 잰것;
}

test("여섯 화면의 여백·높이·굵기가 시안 값이다", async ({ page }) => {
  const 잰것 = await 여섯화면(page);

  /* 수량은 이 두 값의 대상이 아니다 — 선택지가 없고(굵기를 잴 것이 없다), 질문과 증감
     사이는 시안이 34 가 아니라 109 로 그렸다(아래 별도 검사). 그 화면을 «자기 자신과 같다»로
     통과시키지 않고 목록에서 빼는 이유는, 그런 줄이 검사처럼 보이면서 아무것도 재지 않기
     때문이다. 제목 위 여백은 반대로 **여섯 화면 전부**가 대상이다. */
  const 선택지화면 = Object.entries(잰것).filter(([화면]) => 화면 !== "S10 수량");

  for (const [화면, m] of 선택지화면) {
    expect(m.안내텍스트아래, `${화면}: 안내텍스트와 선택지 사이가 시안(34px)과 다릅니다`)
      .toBe(시안.안내텍스트아래);
    expect(m.라벨굵기, `${화면}: 선택지 라벨 굵기가 시안(Regular 400)과 다릅니다`)
      .toBe(시안.라벨굵기);
  }

  for (const [화면, m] of Object.entries(잰것)) {
    /* 제목 위 여백은 여섯 화면이 **같아야** 한다. 한때 이 규칙이 «선택지가 있는 화면»에
       걸려 있어서 수량만 0 이었다 — 그 화면은 선택지가 아니라 증감이라 걸리지 않았고,
       마법사 안에서 한 장만 제목이 진행 표시에 붙어 있었다. */
    expect(m.본문상단여백, `${화면}: 제목 위 여백만 다릅니다 — 마법사 여섯 화면은 같아야 합니다`)
      .toBe(잰것["S06 기본"].본문상단여백);
    expect(m.본문상단여백, "제목 위 여백이 0 이면 위 검사가 «모두 0» 으로도 통과합니다")
      .toBeGreaterThan(0);
  }

  expect(잰것["S06 확장"].제목부제사이, "제목과 부제 사이가 시안(8px)과 다릅니다")
    .toBe(시안.제목부제사이);

  for (const 화면 of ["S06 기본", "S08 뼈/순살", "S09 포장/매장"]) {
    expect(잰것[화면].선택지높이, `${화면}: 타일 높이가 시안(187px)과 다릅니다`).toBe(시안.타일높이);
  }
  for (const 화면 of ["S06 확장", "S07 맵기"]) {
    expect(잰것[화면].선택지높이, `${화면}: 줄 높이가 시안(71px)과 다릅니다`).toBe(시안.줄높이);
  }
});

/**
 * 맵기의 불꽃은 라벨에 **붙는다** (282:1096 · 282:1102 에 gap 이 없다).
 *
 * 붙여도 답답해 보이지 않는 것은 불꽃 도안 자체가 54px 상자 안에 좌우 11px 씩 여백을 두고
 * 그려져 있어서다. 그걸 모르고 여백을 한 겹 더 주면 시안의 두 배가 되는데, 실제로 그랬다
 * (「보통맛     🔥」). 그래서 «CSS 값»이 아니라 **글자 끝과 그림 상자 사이의 실제 거리**를
 * 잰다 — 줄의 gap 이 바뀌어도 이 검사가 참이어야 한다.
 */
test("맵기의 불꽃은 라벨에 붙는다 — 시안에 없는 여백을 두지 않는다", async ({ page }) => {
  await openHome(page);
  await enterWizard(page);
  await page.getByRole("button", { name: "없어요", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator(".kb-marks").first()).toBeVisible();

  const 거리 = await page.locator(".kb-marks").first().evaluate((marks) => {
    /* 라벨은 요소가 아니라 버튼 안의 글자다 — Range 로 실제 그려진 상자를 잡는다 */
    const 글자 = [...marks.parentElement!.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    const r = document.createRange();
    r.selectNode(글자[0]);
    return Math.round((marks.getBoundingClientRect().left - r.getBoundingClientRect().right) * 10) / 10;
  });

  expect(거리, `라벨과 불꽃 사이에 시안에 없는 ${거리}px 이 있습니다`).toBe(0);
});

/**
 * 수량은 증감을 화면 중턱에 둔다 (123:7 `gap-[109px]`).
 *
 * 시안 프레임(874px)에서 시안 값이 그대로 나오는지로 잰다 — vh 로 두었으므로 짧은 기기에서는
 * 줄어드는 것이 맞고, 그 줄어듦까지 시안 값으로 못 박으면 짧은 화면에서 증감이 버튼바에 닿는다.
 */
test("수량 화면의 증감은 시안 크기에서 시안 자리에 온다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 874 });
  await openHome(page);
  await enterWizard(page);
  for (let i = 0; i < 4; i++) {
    if (await page.getByRole("button", { name: "없어요", exact: true }).count()) {
      await page.getByRole("button", { name: "없어요", exact: true }).click();
    } else {
      await page.locator(".q-choices .choice").first().click();
    }
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await expect(page.locator(".stepper")).toBeVisible();

  const 간격 = await page.evaluate(() => {
    const 제목 = document.querySelector("#qtitle")!.getBoundingClientRect();
    const 증감 = document.querySelector(".stepper-wrap")!.getBoundingClientRect();
    return Math.round((증감.top - 제목.bottom) * 10) / 10;
  });

  expect(간격, `수량 화면의 질문과 증감 사이가 시안(109px)과 다릅니다`)
    .toBeGreaterThanOrEqual(시안.수량간격 - 1);
  expect(간격).toBeLessThanOrEqual(시안.수량간격 + 1);
});
