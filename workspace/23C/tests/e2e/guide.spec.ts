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

/** 프로필 3/3 까지 가서 「안내 켜짐」을 고르고, 질문 화면 직전까지 간다.
 *  «큰 글씨»도 함께 켠다 — 기본이 «기본 크기»가 되면서(기획 2026-08-12), 이 파일의
 *  화살표·통로 실측이 재 온 가장 불리한 조합(큰 화살표)을 이제 직접 만들어야 한다. */
async function 안내켜고(page: Page, 켤까: boolean): Promise<void> {
  await openHome(page);
  await page.getByRole("button", { name: /^시작하기$/ }).click();
  await page.locator(".kb-radio", { hasText: "큰 글씨" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  if (켤까) await page.getByRole("button", { name: "안내 켜짐" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이번만 사용" }).click();
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

/**
 * 고리가 본문 상자 안에 **온전히** 들어오는지 방향별 여유(px)로 잰다.
 *
 * 본문(.kb-screen-body)은 스크롤 상자라 넘치는 것을 자른다 — overflow-y 만 auto 로 둬도
 * 가로가 함께 auto 가 되어 좌우로도 자른다. 고리는 box-shadow 라 요소 상자 **바깥** 7px 에
 * 그려지는데, box-shadow 는 스크롤 범위를 넓히지 않으므로(ink overflow) 상자가 안쪽 여백을
 * 그만큼 벌려 두지 않으면 그대로 깎인다.
 */
const 고리여유 = (page: Page) =>
  page.locator(".q-choices .choices").first().evaluate((el) => {
    const 고리 = 7; // box-shadow spread — question.css 와 styles.css 의 CTA 가 같은 값을 쓴다
    const g = el.getBoundingClientRect();
    const body = el.closest(".kb-screen-body") as HTMLElement;
    const b = body.getBoundingClientRect();
    const cs = getComputedStyle(body);
    // 자르는 자리는 border box 가 아니라 **padding box** 다
    return {
      왼쪽: g.left - 고리 - (b.left + parseFloat(cs.borderLeftWidth)),
      오른쪽: b.right - parseFloat(cs.borderRightWidth) - (g.right + 고리),
      아래: b.bottom - parseFloat(cs.borderBottomWidth) - (g.bottom + 고리),
      스크롤됨: body.scrollHeight > body.clientHeight,
    };
  });

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
 * 고리가 본문 상자에 잘리지 않는가.
 *
 * 본문 좌우 여백이 6px(초점 테두리 몫)이던 동안, 7px 로 그려지는 고리는 양옆이 1px 씩
 * 깎였다. 눈에는 «세로 선만 가늘고 모서리는 납작하다»로 보였는데 — 둥근 모서리는 잘리는
 * 선과 접선 방향이라 1px 만 깎여도 12px 가량이 평평해진다 — 정작 굵기는 어디서나 3px 라
 * 고리 쪽을 아무리 들여다봐도 원인이 나오지 않는 자리였다.
 *
 * 아래쪽도 같은 결함이 난다. 끝까지 내렸을 때 마지막 줄 아래에는 고리가 들어올 자리가
 * 없는데, box-shadow 는 스크롤 범위를 넓히지 않아 그 자리를 스스로 만들지 못한다.
 * 그래서 실제로 스크롤되는 화면(알레르기 항목 목록)에서 끝까지 내려 두고 잰다.
 */
test("안내 고리는 본문 스크롤 상자에 잘리지 않는다", async ({ page }) => {
  await 안내켜고(page, true);

  const 여유 = await 고리여유(page);
  expect(여유.왼쪽, `고리 왼쪽이 ${(-여유.왼쪽).toFixed(1)}px 잘립니다`).toBeGreaterThanOrEqual(0);
  expect(여유.오른쪽, `고리 오른쪽이 ${(-여유.오른쪽).toFixed(1)}px 잘립니다`).toBeGreaterThanOrEqual(0);

  await page.setViewportSize({ width: 390, height: 640 });
  await page.getByRole("button", { name: "있어요", exact: true }).click();
  await page.locator(".kb-screen-body").evaluate((el) => { el.scrollTop = el.scrollHeight; });

  const 끝 = await 고리여유(page);
  // 스크롤되지 않는 화면에서 재면 아래쪽 검사가 조용히 통과한다 — 잰 자리부터 확인한다
  expect(끝.스크롤됨, "이 화면이 스크롤되지 않아 아래쪽을 재지 못했습니다").toBe(true);
  expect(끝.아래, `끝까지 내렸을 때 고리 아래가 ${(-끝.아래).toFixed(1)}px 잘립니다`)
    .toBeGreaterThanOrEqual(0);
});

/**
 * 화살표가 흔들려도 고리를 파고들지 않는가.
 *
 * 화살표는 1.5em 이라 «큰 글씨»(안내켜고 가 켠다)를 켜면 같이 커지는데, 지나갈 통로가 44px
 * 고정이던 때는 그 커진 만큼이 그대로 고리 위로 넘어갔다. 겹치면 화살표와 고리가 한
 * 덩어리로 읽혀, «저기를 누르세요»가 «버튼에 붙은 장식»이 된다.
 *
 * 그래서 통로를 --fs 에 비례해 잡고(styles.css .app.guide .kb-actions), 여기서는 그
 * 계산이 실제로 여유를 남기는지 **가장 내려온 순간**에 잰다. 흔들림을 그 프레임에
 * 세워 두고 재는 이유는, 안 세우면 우연히 위에 있을 때 통과하기 때문이다.
 */
/* 720px 아래에서는 화살표를 줄인다(styles.css @media). 줄이는 쪽에서 여유가 사라지기
   쉬우므로 긴 화면과 짧은 화면 **둘 다** 잰다 — 한쪽만 재면 나머지가 조용히 깨진다. */
for (const 높이 of [844, 640]) {
test(`안내 화살표는 가장 내려왔을 때도 고리를 파고들지 않는다 (높이 ${높이})`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 높이 });
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
}

/* 아래 바가 짧은 화면에서 본문을 얼마나 먹는지 못 박는다. 시안 프레임(874)에서는
   시안 값 그대로여야 하고, 짧아지면 줄어야 한다 — 둘 다 지켜지는지 함께 본다. */
test("아래 버튼바는 시안 크기에서 시안 값 그대로, 짧은 화면에서만 줄어든다", async ({ page }) => {
  const 재기 = async (높이: number) => {
    await page.setViewportSize({ width: 390, height: 높이 });
    await 안내켜고(page, true);
    return page.locator(".kb-actions").evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        아래여백: Math.round(parseFloat(cs.paddingBottom)),
        바깥여백: Math.round(parseFloat(cs.marginTop)),
        바높이: Math.round(el.getBoundingClientRect().height),
      };
    });
  };

  const 시안 = await 재기(874);
  expect(시안.아래여백, "시안 프레임에서 아래 여백이 py-40 이 아닙니다").toBe(40);
  expect(시안.바깥여백, "시안 프레임에서 바깥 여백이 24px 이 아닙니다").toBe(24);

  /* 짧은 화면에서는 «조금 줄었다»로는 부족하다 — 눈에 띄게 줄어야 본문이 한 줄이라도
     더 보인다. 임의의 px 대신 시안 크기 대비 비율로 못 박는다: 한 자릿수 픽셀이 아니라
     최소 10%는 돌려받아야 이 결정을 했다고 말할 수 있다. */
  const 짧음 = await 재기(640);
  expect(짧음.바높이, `짧은 화면에서 바가 ${시안.바높이}px → ${짧음.바높이}px 밖에 안 줄었습니다`)
    .toBeLessThan(시안.바높이 * 0.9);
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

/**
 * QR 연동 화면 — 안내는 «지금 해야 할 일»을 가리킨다.
 *
 * 이 화면은 대안 묶음(직접 입력 · 직원 요청 · 건너뛰기)을 통째로 아래 바에 담는다.
 * 그래서 기본 규칙(«아래 주 버튼을 가리킨다»)을 그대로 두면, 카메라로 비추면 되는
 * 사람에게 «폈을 때 나오는 폼의 제출 버튼»을 가리키게 된다. 화살표도 바 맨 위,
 * 캡션보다도 위에 떠서 아무것도 가리키지 않았다.
 *
 * 대상은 상태를 따라간다 — 카메라가 살아 있으면 창, 막혔으면 직접 입력 칸.
 * 어느 쪽이든 **가리키는 곳은 하나**여야 하므로 아래 주 버튼은 함께 물러난다.
 */
test.describe("QR 화면의 안내 대상", () => {
  /* QR 연동은 흐름의 1걸음이라(기획 확정 2026-08-12) 그냥 열면 이것이 첫 화면이다.
     다만 안내를 켜는 자리(프로필 3/3)는 이 걸음 **뒤**라, 오늘의 사용자 경로로는 안내가
     켜진 채 이 화면에 설 수 없다(저장본 a11y 도 홈에서 확인한 뒤에야 적용된다). 여기서
     재는 것은 «안내가 켜졌을 때 이 화면이 무엇을 가리키는가»라는 화면 계약이므로, 안전
     중단 검사(lane-d D12)와 같은 방법으로 클래스를 직접 얹어 그 상태를 만든다 — 각
     검사에서 카메라 국면이 정해진 **뒤에** 얹는다(그 전에 얹으면 상태 변화 렌더가 도로
     지운다). QR 걸음이 프로필 뒤로 옮겨지는 날이 오면 이 우회도 같이 걷어낸다. */
  const qr까지 = async (page: Page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://localhost:5173/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole("heading", { name: /매장 QR을 스캔해주세요|카메라로 QR을 읽을 수 없습니다/ }))
      .toBeVisible();
  };
  const 안내상태로 = (page: Page) =>
    page.evaluate(() => document.querySelector(".app")?.classList.add("guide"));
  const 그림자 = (page: Page, sel: string) =>
    page.locator(sel).first().evaluate((el) => getComputedStyle(el).boxShadow);
  const 화살표 = (page: Page, sel: string) =>
    page.locator(sel).first().evaluate((el) => getComputedStyle(el, "::before").content);

  test("카메라를 못 쓰면 직접 입력 칸을 가리킨다", async ({ page }) => {
    await qr까지(page);
    // 헤드리스에는 카메라가 없다 — «못 쓴다» 국면이 정해진 것을 보고 나서 안내를 얹는다
    await expect(page.locator(".field.kb-guide")).toHaveCount(1);
    await expect(page.locator(".qr-view.kb-guide")).toHaveCount(0);
    await 안내상태로(page);

    /* 고리는 «칸»에 두른다 — 라벨 상자에 두르면 위의 설명 한 줄까지 묶여
       가리키는 것이 «칸»이 아니라 «문단»이 된다. */
    expect(await 그림자(page, ".field.kb-guide input"), "입력칸에 고리가 없습니다").toMatch(고리있음);
    expect(await 화살표(page, ".field.kb-guide"), "입력칸 위에 화살표가 없습니다").not.toBe("none");

    // 한 화면에서 가리키는 곳은 하나다 — 아래 주 버튼은 물러난다
    expect(await 그림자(page, ".kb-actions .btn.primary"), "아래 주 버튼까지 같이 가리킵니다")
      .not.toMatch(고리있음);
  });

  test("카메라가 켜지면 창을 가리키고, 화살표가 창에 잘리지 않는다", async ({ page }) => {
    await page.addInitScript(() => {
      /* 실기기 없이 «스캔 중» 국면을 만든다. 해독기는 끝내 아무것도 못 찾게 두어
         그 국면에 머무르게 한다 — 읽히면 곧바로 다음 화면으로 넘어가 버린다. */
      const c = document.createElement("canvas");
      c.width = 320; c.height = 240;
      c.getContext("2d")!.fillRect(0, 0, 320, 240);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: async () =>
          (c as HTMLCanvasElement & { captureStream(f?: number): MediaStream }).captureStream(30) },
      });
      (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector =
        class { async detect() { return []; } };
    });
    await qr까지(page);
    await expect(page.getByText("카메라가 켜졌습니다")).toBeVisible();

    await expect(page.locator(".qr-view.kb-guide")).toHaveCount(1);
    await expect(page.locator(".field.kb-guide")).toHaveCount(0);
    await 안내상태로(page);
    expect(await 그림자(page, ".qr-view.kb-guide"), "카메라 창에 고리가 없습니다").toMatch(고리있음);
    expect(await 화살표(page, ".qr-view.kb-guide"), "창 위에 화살표가 없습니다").not.toBe("none");

    /* 창은 영상 모서리를 다듬으려고 overflow: hidden 을 쓴다 — 그대로 두면 창 **위**에
       서는 화살표까지 잘려 나간다. 실제로 그렇게 만들었다가 화살표가 통째로 사라졌다. */
    const 넘침 = await page.locator(".qr-view.kb-guide").evaluate((el) => getComputedStyle(el).overflow);
    expect(넘침, "창이 제 위의 화살표를 잘라냅니다").toBe("visible");
  });
});
