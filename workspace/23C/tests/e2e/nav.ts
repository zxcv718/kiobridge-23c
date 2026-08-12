/**
 * 홈에서 질문·추천까지 가는 길 (테스트 전용).
 *
 * 시작 화면과 질문 사이의 걸음 — 프로필 생성(3걸음) · 저장 방식 · 세션 시작.
 * QR 걸음(S04)은 기획(2026-08-12)으로 흐름에서 빠졌다 — QR 은 앱 밖에서 폰 기본
 * 카메라로 찍는 행위이고, 그 확인은 홈이 한다(qr-url.spec.ts 가 잰다).
 *
 * 이 길을 스펙마다 따로 적으면 화면이 하나 늘 때마다 여섯 파일을 같이 고쳐야 하고,
 * 그중 하나를 빠뜨리면 «왜 실패하는지 알 수 없는» 테스트가 남는다. 한 곳에 둔다.
 *
 * 실제 흐름 (2026-08-12 실측):
 *   홈          [시작하기]
 *   프로필 1/3  라디오 2 · [다음]
 *   프로필 2/3  라디오 2 · [다음]
 *   프로필 3/3  라디오 2 · 접근성 토글 7 · 입력 방식 2 · [다음]
 *   저장 방식   [이 기기에 저장하기] | [이번만 사용하기]   ← 고르는 즉시 세션 시작으로 간다
 *   세션 시작   [주문 시작하기]
 *   질문 ×7     선택지 · [다음]
 */
import { expect, type Page } from "@playwright/test";

export const HOME = "http://localhost:5173/";

/** 알레르기 «확장» 걸음에만 있는 항목들 — 첫 걸음에는 「없어요/있어요」 두 장뿐이다 */
const ALLERGY_ITEMS = ["땅콩", "대두", "우유", "계란", "밀", "새우"];

/**
 * 지금 질문에 «아무 답이나» 하고 다음으로 넘어간다.
 *
 * 질문 화면은 세 가지 모양이 있다 — 선택지 버튼, 알레르기 첫 걸음(있다/없다),
 * 그리고 수량 증감(«− 1 +»). 스펙마다 `.choices .choice` 를 눌러 왔는데, 수량이
 * 증감으로 바뀌자 그 자리에 누를 것이 없어 여덟 개 스펙이 한꺼번에 멈췄다.
 * «다음 질문으로 간다»는 한 가지 일이므로 아는 곳도 한 곳이어야 한다.
 */
export async function 아무거나답하고다음(page: Page): Promise<void> {
  if (await page.locator(".stepper").count()) {
    // 증감은 이미 1이 떠 있고 그 값이 곧 답이다 — 누를 것이 없다
  } else if (await page.getByRole("button", { name: "있어요", exact: true }).count()) {
    await page.getByRole("button", { name: "없어요", exact: true }).click();
  } else {
    await page.locator(".choices .choice").first().click();
  }
  await page.getByRole("button", { name: /다음|추천 보기/ }).click();
}

/**
 * 라벨로 선택지를 찾는다. 정확히 일치하는 것이 없으면 «그 말로 시작하는» 것을 쓴다.
 *
 * 선택지 중에는 설명을 함께 읽어 주는 것이 있다 — 「잘 모르겠어요」에는 «확실하지 않으면
 * 이걸 골라 주세요»가 버튼 안에 들어 있고, 화면 낭독기는 그것까지 한 이름으로 읽는다.
 * 그게 맞는 설계라서, 설명을 빼는 대신 여기서 찾는 방법을 넓힌다. 정확히 일치하는 쪽을
 * 먼저 보는 이유는 「없어요」처럼 짧은 라벨이 다른 것의 앞부분과 겹칠 수 있어서다.
 */
function 선택지(page: Page, label: string) {
  const exact = page.getByRole("button", { name: label, exact: true });
  return {
    click: async () => {
      if (await exact.count()) { await exact.first().click(); return; }
      const 앞말 = new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      await page.getByRole("button", { name: 앞말 }).first().click();
    },
  };
}

/**
 * 재방문 홈에서 저장된 내용을 펼친다.
 *
 * 시안(150:190)의 재방문 홈에는 카드가 없어서 조회·수정을 «저장된 내용 보기»로 접어
 * 두었다. 조회할 수 있다는 사실은 그대로지만 **한 걸음이 늘었으므로**, 그 걸음을 아는
 * 곳도 한 곳이어야 한다 — 스펙마다 summary 선택자를 적으면 접는 방식을 바꿀 때
 * 여섯 파일이 같이 틀린다.
 */
export async function 저장된내용펼치기(page: Page): Promise<void> {
  const 접힘 = page.locator("details.home-saved");
  await expect(접힘, "재방문 홈에 «저장된 내용 보기»가 없습니다").toHaveCount(1);
  if (!(await 접힘.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await page.locator("details.home-saved > summary").click();
  }
  await expect(page.getByRole("region", { name: "이 기기에 저장된 기록" })).toBeVisible();
}

/** 홈을 연다. 저장본을 비우므로 늘 «최초 방문» 상태에서 시작한다.
 *  매장 QR 링크 없이 열면 연동 관문이 홈보다 먼저 나온다(기획 2026-08-12) —
 *  관문 자체는 lane-b.spec.ts 가 검사하므로 여기서는 «QR 없이» 지나 홈에 선다. */
export async function openHome(page: Page): Promise<void> {
  await page.goto(HOME);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "QR 없이 계속하기" }).click();
  await expect(page.getByRole("heading", { name: /KioBridge에 오신 걸 환영해요/ })).toBeVisible();
}

/**
 * 홈 → 첫 질문. 화면 설정은 기본값 그대로 지나간다.
 *
 * @param store 저장 방식에서 «이 기기에 저장하기»를 고를지. 기본은 «이번만 사용».
 */
export async function enterWizard(page: Page, store = false): Promise<void> {
  await page.getByRole("button", { name: /^(시작하기|새로 설정하기)$/ }).click();

  // S02 프로필 생성 — 글씨 크기 → 고대비 → 화면 안내
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  // S03 저장 방식 — 고르는 즉시 다음 걸음(세션 시작)으로 간다. QR 걸음은 없다.
  await page.getByRole("button", { name: store ? "저장하기" : "이번만 사용" }).click();
  // S05 세션 시작
  await page.getByRole("button", { name: /^(주문 시작하기|아니오)$/ }).click();

  await expect(page.locator("#qtitle")).toBeVisible();
}

/**
 * 같은 길을 **키보드만으로** 간다.
 *
 * 마우스 판과 따로 두는 이유는, 화면이 늘어난 뒤에도 «탭으로 닿을 수 있는가»가
 * 여전히 참인지 재야 하기 때문이다. 버튼이 늘었는데 탭 순서에서 빠지면
 * 마우스 판만으로는 아무 일도 없어 보인다.
 */
export async function enterWizardByKeyboard(
  page: Page,
  pressOn: (page: Page, name: RegExp | string) => Promise<void>,
): Promise<void> {
  await pressOn(page, /^(시작하기|새로 설정하기)$/);
  for (let i = 0; i < 3; i++) await pressOn(page, /^다음$/);
  await pressOn(page, /^이번만 사용$/);
  await pressOn(page, /^(주문 시작하기|아니오)$/);
  await expect(page.locator("#qtitle")).toBeVisible();
}

/** 질문 7개를 첫 선택지로 답해 추천까지 간다. */
export async function answerAllFirst(page: Page): Promise<void> {
  for (let i = 0; i < 7; i++) {
    const c = page.locator(".choices .choice").first();
    if (!(await c.isVisible().catch(() => false))) break;
    await c.click();
    await page.getByRole("button", { name: /다음|추천 보기/ }).click();
  }
  await expect(page.locator("#qtitle")).toHaveCount(0);
}

/**
 * 질문에 값을 지정해 답한다.
 *
 * 시연 프리셋이 사라져서, 특정 상황(알레르기 있음·예산 부족)을 만들려면 이제 실제로
 * 답을 골라야 한다 — 사용자가 걷는 길과 같은 길이라 오히려 검사로서 낫다.
 *
 * 순서는 model.ts 의 QUESTIONS 와 같다: 알레르기 → 맵기 → 형태 → 이용방식 → 수량 → 컵 → 예산.
 * 배열 원소가 `null` 이면 그 질문은 첫 선택지로 답한다.
 */
export async function answerWizard(page: Page, picks: (string | string[] | null)[]): Promise<void> {
  for (let i = 0; i < 7; i++) {
    if (!(await page.locator("#qtitle").isVisible().catch(() => false))) break;
    const pick = picks[i] ?? null;
    /* 수량은 선택지가 아니라 «− 1 +» 증감이다(디자인 S10). 고를 버튼이 없으므로
       «N개» 라벨을 수로 읽어 1에서부터 그만큼 올린다. 답을 지정하지 않으면(null)
       화면에 이미 1이 떠 있고 그것이 곧 기록되는 값이라 아무것도 누르지 않는다. */
    if (await page.locator(".stepper").count()) {
      const 목표 = typeof pick === "string" ? Number(pick.replace(/[^0-9]/g, "")) : NaN;
      for (let n = 1; Number.isFinite(목표) && n < 목표; n++) {
        await page.getByRole("button", { name: "하나 늘리기" }).click();
      }
      await page.getByRole("button", { name: /다음|추천 보기/ }).click();
      continue;
    }

    if (pick === null) {
      await page.locator(".choices .choice").first().click();
    } else {
      for (const label of Array.isArray(pick) ? pick : [pick]) {
        /* 알레르기는 «있으신가요?» → 항목 목록 두 걸음이다(디자인 S06). 항목 이름을
           바로 누르려면 먼저 «있어요»로 목록을 펴야 한다. 스펙마다 이 두 줄을 적으면
           또 여섯 파일이 되므로 길을 아는 이 파일이 대신 안다. */
        if (ALLERGY_ITEMS.includes(label) && (await page.getByRole("button", { name: "있어요", exact: true }).count())) {
          await page.getByRole("button", { name: "있어요", exact: true }).click();
        }
        await 선택지(page, label).click();
      }
    }
    await page.getByRole("button", { name: /다음|추천 보기/ }).click();
  }
}

/**
 * 추천 확인 → 장바구니 확인(S13).
 *
 * 추천(Recommend)과 메뉴 확인(MenuConfirm) 두 화면이 «메뉴 확인» 하나로 합쳐졌다
 * (노션 기획 «장바구니 수정 플로우 변경» 2026-08-12) — 같은 메뉴를 두 번 확인시키는
 * 중복이었다. «네, 좋아요» → «이대로 담기» 두 걸음이 «선택하기» 한 걸음이 됐다.
 */
export async function approveToCartReview(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /이 메뉴를 선택하시겠어요/ })).toBeVisible();
  await page.getByRole("button", { name: "선택하기", exact: true }).click();
  /* 장바구니 확인(S13)에는 시안대로 큰 제목 문장이 없다 — CTA «주문하기»가 도착 표식이다 */
  await expect(page.getByRole("button", { name: "주문하기", exact: true })).toBeVisible();
}

/** 주문을 확정해 결과 화면까지 (라이브·체험 모드 모두 시안 라벨 «주문하기» 하나다). */
export async function finishOrder(page: Page): Promise<void> {
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  /* level 2 를 지정한다 — 결과 화면 본문에 «주문 계획» 소제목(h3)이 생겨
     이름만으로 찾으면 둘이 걸린다. 화면 제목은 언제나 h2 하나뿐이다. */
  await expect(page.getByRole("heading", { level: 2, name: /실행 결과|주문이 완성되었습니다|실행하지 못했습니다/ }))
    .toBeVisible({ timeout: 20_000 });
}
