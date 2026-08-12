/**
 * 레인 C — 질문 화면(S06~S10)과 계산 화면(S11).
 *
 * 실행: npx playwright test -c workspace/23C/tests/e2e/playwright.config.ts lane-c
 * 전제: 데모 UI 가 http://localhost:5173 에 떠 있어야 한다.
 *
 * verify-b.spec.ts 가 «흐름»(질문 7개 고정·첫 질문 알레르기·상관없어요)을 지키고,
 * 여기서는 그 흐름 위에 얹은 **디자인 반영이 접근성 계약을 깨지 않았는지**를 본다.
 * 두 가지가 대상이다.
 *
 *  ① 그림 아이콘을 이모지에서 디자인 에셋으로 바꾸면서 «아이콘 단독 금지»가 무너지지 않았는가.
 *    아이콘을 CSS 배경 그림으로 깔면 글자를 지우고 싶은 유혹이 생기고, 그 순간
 *    화면 낭독기에는 아무것도 남지 않는다. 그래서 그림이 붙은 자리마다 글자를 같이 잰다.
 *
 *  ② 제목을 «강조 어절 + 나머지»로 쪼갠 것이 문장을 깨뜨리지 않았는가.
 *    쪼갠 조각 사이에 공백이 끼면 B3(«첫 질문은 알레르기») 같은 검사는 정규식이라 통과하지만,
 *    낭독기에는 «알레르기 가 있으세요»처럼 끊겨 읽힌다. 전체 문장을 통째로 비교한다.
 */
import { expect, test, type Page } from "@playwright/test";

const HOME = "http://localhost:5173/";

/**
 * 화면 설정을 원하는 대로 켜고 첫 질문까지 간다.
 *
 * 홈에서 질문까지 가는 길에는 다른 갈래가 만드는 중인 화면 넷(S02~S05)이 끼어 있고,
 * 그 버튼 이름들은 아직 바뀐다. 이 레인이 검사할 것은 질문 화면이므로 그 길을 흉내 내는
 * 대신 **저장본으로 시작하는 길**을 쓴다 — 답변이 하나도 없는 저장본이면 화면 설정만
 * 실어 오고 첫 질문(알레르기)부터 그대로 묻는다. 이 길은 flow.tsx 의 startFromSaved
 * 하나만 지나므로 앞 화면이 어떻게 바뀌든 흔들리지 않는다.
 *
 * 빠뜨린 화면 설정은 A11Y_DEFAULT 가 채운다(model.ts 의 readSaved).
 */
const openWizard = async (page: Page, a11y: Record<string, boolean> = {}) => {
  await page.goto(HOME);
  await page.evaluate((flags) => {
    localStorage.clear();
    localStorage.setItem("kb23c-saved-settings-v4", JSON.stringify({
      v: 4, answers: {}, a11y: flags, savedAt: "2026-08-11T00:00:00.000Z",
    }));
  }, a11y);
  await page.reload();
  await page.getByRole("button", { name: /이전 화면 설정 사용|지난번과 똑같이 주문하기/ }).click();
  await expect(page.locator("#qtitle")).toBeVisible();
};

/**
 * 지금 질문의 n번째(1부터) 선택지를 고르고 다음으로 넘어간다.
 * 수량 질문에는 고를 선택지가 없다(«− 1 +» 증감) — 이미 1이 답이므로 그냥 넘어간다.
 */
const pick = async (page: Page, nth: number) => {
  if (await page.locator(".stepper").count()) {
    await page.getByRole("button", { name: /다음|추천 보기/ }).click();
    return;
  }
  await page.locator(".choices .choice").nth(nth - 1).click();
  await page.getByRole("button", { name: /다음|추천 보기/ }).click();
};

/**
 * 선택지 n번째의 그림. Figma SVG 면 파일 경로, 이모지면 그 글자, 없으면 "".
 *
 * 한때 CSS 배경 그림으로 깔았다가 «아무것도 안 보이는» 상태가 됐다. 지금은 <img> 라
 * 로드 실패도 바로 드러난다 — naturalWidth 가 0 이면 파일이 없는 것이다.
 */
const iconOf = async (page: Page, nth: number) => {
  const el = page.locator(".choices .choice").nth(nth - 1).locator(".ico").first();
  /* <img> 는 로드가 끝나야 naturalWidth 로 «파일이 실제로 왔는가»를 잴 수 있다.
     화면이 바뀐 직후에 그대로 재면 «파일이 없다»와 «아직 안 왔다»가 구분되지 않아,
     멀쩡한 에셋이 «로드 실패»로 잡힌다. 끝날 때까지(성공이든 실패든) 기다린 뒤에 잰다 —
     정말 없는 파일은 error 로 끝나므로 여전히 «로드 실패»로 걸린다. */
  await el.waitFor();
  await el.evaluate((e) => {
    const img = e as HTMLImageElement;
    if (e.tagName !== "IMG" || img.complete) return undefined;
    return new Promise<void>((done) => {
      img.addEventListener("load", () => done(), { once: true });
      img.addEventListener("error", () => done(), { once: true });
    });
  });
  return el.evaluate((e) => {
    if (e.tagName === "IMG") {
      const img = e as HTMLImageElement;
      return img.naturalWidth > 0 ? new URL(img.src).pathname : "(로드 실패)";
    }
    return (e as HTMLElement).innerText;
  });
};

test.describe("레인 C — 질문 화면", () => {
  test("C-L1 제목을 강조 어절로 쪼개도 문장이 그대로 읽힌다", async ({ page }) => {
    await openWizard(page);
    // 조각 사이에 공백이 끼면 여기서 걸린다 (정규식이 아니라 문장 전체 비교)
    await expect(page.locator("#qtitle")).toHaveText("알레르기가 있으신가요?");
    // 강조 어절이 실제로 따로 그려진다
    await expect(page.locator("#qtitle .kb-title-key")).toHaveText("알레르기");
  });

  test("C-L2 그림이 붙은 선택지에도 글자가 반드시 남는다", async ({ page }) => {
    await openWizard(page, { visualGuidance: true });
    // 알레르기 첫 걸음은 타일 두 장뿐이다 — 그림이 여럿 붙는 곳은 항목 목록이다
    await page.getByRole("button", { name: "있어요", exact: true }).click();

    /* 항목은 이모지로 통일했다 — 항목마다 다른 음식이라 이모지가 실제로 구별을 돕는다.
       첫 걸음의 방패(safe/danger)는 «있다/없다»를 가르는 그림이라 여기 섞지 않는다. */
    expect(await iconOf(page, 1)).not.toBe("");

    // 그림만 두지 않는다 — 그림이 붙은 **모든** 선택지에 글자가 함께 있어야 한다
    const rows = await page.locator(".choices .choice").evaluateAll((els) =>
      els.map((e) => ({
        hasMark: !!e.querySelector(".ico") || !!e.querySelector(".kb-marks"),
        text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
      })));
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) {
      if (r.hasMark) expect(r.text, "그림만 있고 글자가 없는 선택지가 있습니다").not.toBe("");
    }
  });

  test("C-L3 매핑에 없는 선택지는 이모지를 그대로 쓴다", async ({ page }) => {
    await openWizard(page, { visualGuidance: true });

    /* 「땅콩」은 디자인 에셋이 없으므로 그림이 깔리지 않고 이모지가 남는다.
       기대값이 "none" 이던 자리다 — 그림을 CSS 배경으로 깔던 시절 backgroundImage 의
       «없음»이었고, `<img class="ico">` 로 바뀐 지금은 그 값이 나올 수 없다.
       재는 것은 그대로다: iconOf 는 <img> 면 파일 경로를 돌려주므로, 이모지가 그대로
       나온다는 사실이 곧 «디자인 그림이 끼어들지 않았다»는 뜻이다. */
    await page.getByRole("button", { name: "있어요", exact: true }).click();
    expect(await iconOf(page, 1)).toBe("🥜");
    await expect(page.locator(".choices .choice").first().locator(".ico")).toHaveText("🥜");
  });

  test("C-L4 종류에는 그림, 정도에는 같은 표식의 개수", async ({ page }) => {
    await openWizard(page, { visualGuidance: true });
    await pick(page, 1); // 알레르기 없어요

    /* 맵기는 «정도»다. 서로 다른 그림을 쓰면 «더 매운 것»이 아니라 «다른 종류»로 읽힌다 —
       실제로 그렇게 보였다(보통맛에 빨간 고추, 매운맛에 불꽃). 디자인대로 **같은 불꽃을
       개수로** 쓴다: 순한맛 0 · 보통맛 1 · 매운맛 3 (Figma 99:1264). */
    await expect(page.locator("#qtitle")).toHaveText(/맵기/);
    const flames = await page.locator(".choices .choice").evaluateAll((els) =>
      els.map((e) => ({
        label: (e as HTMLElement).innerText.replace(/\s+/g, "").trim(),
        n: e.querySelectorAll(".kb-marks img").length,
        srcs: [...e.querySelectorAll(".kb-marks img")].map((i) => (i as HTMLImageElement).src),
      })));
    expect(flames.map((f) => f.n)).toEqual([0, 1, 3, 0]);
    // 개수가 뜻을 만들려면 표식이 같아야 한다
    expect(new Set(flames.flatMap((f) => f.srcs)).size,
      "표식이 서로 다르면 개수가 정도를 뜻하지 못합니다").toBe(1);
    // 그림은 거드는 신호일 뿐 — 순서는 글자가 말한다
    expect(flames.map((f) => f.label)).toEqual(["순한맛", "보통맛", "매운맛", "상관없어요"]);
    await pick(page, 3);

    /* 형태·이용 방식은 «종류»다 — 서로 다른 그림이 맞다.
       좌우 순서도 시안 그대로여야 한다: 뼈 → 순살(99:1270), 먹고 가기 → 포장하기(99:1281).
       타일 두 장은 좌우 위치가 곧 그 선택지의 자리라, 뒤집히면 시안을 본 사람이 기억한
       자리와 어긋난다. 둘 다 반대로 두고 있었다. */
    await expect(page.locator("#qtitle")).toHaveText(/뼈 있는 것과 없는 것/);
    const bone = await iconOf(page, 1);
    expect(bone).toMatch(/bone[-.\w]*\.svg/);
    expect(bone, "첫 타일이 뼈가 아닙니다 — 시안과 좌우가 뒤집혔습니다").not.toMatch(/boneless/);
    expect(await iconOf(page, 2)).toMatch(/boneless[-.\w]*\.svg/);
    await pick(page, 1);

    await expect(page.locator("#qtitle")).toHaveText(/드시고 가나요, 포장하나요\?/);
    expect(await iconOf(page, 1)).toMatch(/here[-.\w]*\.svg/);
    expect(await iconOf(page, 2)).toMatch(/takeout[-.\w]*\.svg/);
  });

  test("C-L5 7문항 어디에도 글자 없는 선택지가 없다", async ({ page }) => {
    await openWizard(page, { visualGuidance: true });

    for (let i = 0; i < 7; i++) {
      await expect(page.locator("#qtitle")).toBeVisible();

      /* 수량은 선택지가 아니라 «− 1 +» 증감이다(디자인 S10). 고를 것이 없으니 라벨을
         셀 수도 없다 — 대신 여기서 지키려던 것(«그림만 있고 글자가 없는 조작 요소를
         만들지 않는다»)을 증감 버튼에 대해 잰다. 검사를 건너뛰지 않고 옮긴다. */
      if (await page.locator(".stepper").count()) {
        const 이름 = await page.locator(".stepper button").evaluateAll((els) =>
          els.map((e) => (e.getAttribute("aria-label") ?? (e as HTMLElement).innerText).trim()));
        expect(이름.length, "증감 버튼을 못 찾았습니다").toBe(2);
        for (const n of 이름) expect(n.length, "글자 없는 증감 버튼이 있습니다").toBeGreaterThan(0);
        await page.getByRole("button", { name: /다음|추천 보기/ }).click();
        continue;
      }

      const labels = await page.locator(".choices .choice").allInnerTexts();
      expect(labels.length, `${i + 1}번째 질문에 선택지가 없습니다`).toBeGreaterThan(1);
      for (const l of labels) {
        expect(l.trim().length, `${i + 1}번째 질문에 글자 없는 선택지가 있습니다`).toBeGreaterThan(0);
      }
      await pick(page, 1);
    }
    await expect(page.locator("#qtitle")).toHaveCount(0);
    // verify-b B1 과 같은 자리 — 시스템이 먼저 끝내지 않으므로 생략 고지가 나올 일이 없다
    await expect(page.getByText(/여쭤보지 않았습니다/)).toHaveCount(0);
  });

  test("C-L6 고른 것은 색 말고 기호로도 읽힌다", async ({ page }) => {
    await openWizard(page);
    await page.getByRole("button", { name: "있어요", exact: true }).click();
    await page.locator(".choices .choice").first().click(); // 땅콩

    const chosen = page.locator('.choices .choice[aria-pressed="true"]');
    await expect(chosen).toHaveCount(1);
    const mark = await chosen.evaluate((el) => getComputedStyle(el, "::after").content);
    expect(mark, "선택 표식이 색뿐입니다 — 기호가 없습니다").toContain("✓");
  });

  test("C-L7 뒤로가기가 첫 질문에서는 홈으로, 그 뒤에는 앞 질문으로 간다", async ({ page }) => {
    await openWizard(page);
    await pick(page, 1); // 알레르기 → 맵기

    await expect(page.locator("#qtitle")).toHaveText(/맵기/);
    await page.getByRole("button", { name: "뒤로" }).click();
    await expect(page.locator("#qtitle")).toHaveText(/알레르기/);

    await page.getByRole("button", { name: "뒤로" }).click();
    await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요|다시 오셨네요/ })).toBeVisible();
  });

  test("C-L8 계산 화면에도 진행 표시가 남는다", async ({ page }) => {
    await openWizard(page);
    for (let i = 0; i < 7; i++) await pick(page, 1);

    // 결과는 이미 계산돼 있고 화면만 거친다 — 짧게 지나가므로 바로 잡는다
    await expect(page.locator(".calcspin")).toBeVisible();
    await expect(page.getByRole("heading", { name: /메뉴를 찾고 있어요/ })).toBeVisible();
    const anim = await page.locator(".calcspin").evaluate((el) => getComputedStyle(el).animationName);
    expect(anim, "진행 표시가 돌지 않습니다").not.toBe("none");
  });

  test("C-L9 큰 글씨·누르기 편하게를 켜도 가로로 넘치지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWizard(page, { largeText: true, mobilitySupport: true, visualGuidance: true });
    await expect(page.locator(".app")).toHaveClass(/large/);
    await expect(page.locator(".app")).toHaveClass(/roomy/);

    // 선택지가 가장 많은 질문(알레르기 8개)에서 잰다
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `가로로 ${over}px 넘칩니다`).toBeLessThanOrEqual(1);

    // 그림이 붙어 선택지가 커져도, 뒤로가기가 늘어도 타깃 기준은 그대로다
    const small = await page.locator("button").evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({ h: e.getBoundingClientRect().height, t: (e as HTMLElement).innerText.slice(0, 12) }))
        .filter((b) => b.h < 48));
    expect(small, `48px 미만인 버튼: ${JSON.stringify(small)}`).toEqual([]);
  });

  test("C-L10 질문 화면에 생략·조기 종료를 권하는 자리가 없다", async ({ page }) => {
    await openWizard(page);
    const body = await page.locator(".kb-screen").first().innerText();
    expect(body).not.toMatch(/생략|건너뛰|바로 추천|그만 묻/);
    await pick(page, 1);
    // 「상관없어요」는 없애지 않는다 — NO_PREFERENCE 로 계약에 들어간다
    await expect(page.getByRole("button", { name: "상관없어요" })).toBeVisible();
  });
});

test.describe("레인 C — 움직임 줄이기", () => {
  // 1.62 의 타입에는 최상위 reducedMotion 이 없다 — 컨텍스트 옵션으로 건다.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("C-L11 움직임을 줄이면 계산 화면을 아예 거치지 않는다", async ({ page }) => {
    await openWizard(page);
    // 흉내가 실제로 걸렸는지 먼저 확인한다 — 안 걸렸으면 아래 단정이 공짜로 통과한다
    const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    expect(reduced, "브라우저에 «움직임 줄이기»가 걸리지 않았습니다").toBe(true);

    for (let i = 0; i < 7; i++) await pick(page, 1);

    // 도는 표시를 멈추는 데서 그치지 않고 지연 자체를 없앤다.
    // 기다리면 어차피 사라지므로 마지막 답 직후 그 자리에서 잰다(재시도 없는 count).
    expect(await page.locator(".calcspin").count(), "계산 화면을 거쳤습니다").toBe(0);
    /* 화면 제목은 h2(.kb-title) 하나뿐이다 — 본문 소제목이 같은 정규식에 걸리지 않게
       단계를 지정해 화면 제목만 본다. 추천·메뉴 확인은 «메뉴 확인» 한 화면이 됐다. */
    await expect(page.getByRole("heading", { level: 2, name: /이 메뉴를 선택하시겠어요|조건에 맞는 메뉴가 없어요/ }))
      .toBeVisible();
  });
});
