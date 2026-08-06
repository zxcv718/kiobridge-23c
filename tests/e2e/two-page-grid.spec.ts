import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Real two-page kiosk UI, checked in the browser.
 *
 * This asserts the DOM — how many cards exist, which page indicator shows,
 * which pager buttons are disabled — not the fixture's configuration. A test
 * that only re-reads pageSize would pass even if the grid rendered all six
 * cards at once.
 *
 * Sandbox only: it is not an evaluated environment, so shipping a complete
 * example plan for it reveals no answer.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const API = process.env.SIM_API_URL ?? "http://127.0.0.1:4000";

const sandboxExample = () => {
  const doc = JSON.parse(readFileSync(path.join(REPO_ROOT, "examples/submission-format-example/sandbox.json"), "utf-8"));
  delete doc._note;
  return doc;
};

const cards = (page: Page) => page.locator('[data-testid="candidate-card"]');
const indicator = (page: Page) => page.getByTestId("candidate-page-indicator");
const prev = (page: Page) => page.getByTestId("candidate-page-prev");
const next = (page: Page) => page.getByTestId("candidate-page-next");

async function openSandboxTwin(page: Page) {
  await page.goto("/");
  const card = page.locator(".card").filter({ hasText: "Sandbox" }).first();
  await card.getByRole("button", { name: "세션 생성 →" }).click();
  await expect(page.getByRole("heading", { name: /세션 · 제출 대기/ })).toBeVisible();
  await page.getByRole("button", { name: "형식 예제 제출 불러오기" }).click();
  await expect(page.getByRole("heading", { name: /제출 검토/ })).toBeVisible();
  await page.getByRole("button", { name: "검증 실행" }).click();
  await expect(page.getByText(/검증 통과/)).toBeVisible();
  await page.getByRole("button", { name: "디지털 트윈 재생 →" }).click();
  await expect(page.getByRole("heading", { name: /가상 키오스크/ })).toBeVisible();
}

/** Sandbox opens on WELCOME; the card grid is the next screen. */
async function stepToGrid(page: Page) {
  await openSandboxTwin(page);
  const step = page.getByRole("button", { name: "한 단계 실행" });
  for (let i = 0; i < 8; i += 1) {
    if (await cards(page).count() > 0) return;
    await step.click();
  }
  await expect(cards(page)).not.toHaveCount(0);
}

test.describe("시나리오 9 — 실제 2페이지 가상 키오스크 (DOM 검증)", () => {
  test("[1] Sandbox 후보가 6개다", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/environments/sandbox/fixture`);
    const fixture = await res.json();
    expect(fixture.candidates.length).toBe(6);
  });

  test("[2–11] 첫 페이지 4개 · 두 번째 페이지 2개 · 페이저 상태", async ({ page }) => {
    await stepToGrid(page);

    // [2] 첫 화면에는 정확히 4개의 카드만 렌더링된다.
    await expect(cards(page)).toHaveCount(4);
    // [3] 페이지 표시
    await expect(indicator(page)).toHaveText("1 / 2 페이지");
    // [4][5] 이전 비활성 · 다음 활성
    await expect(prev(page)).toBeDisabled();
    await expect(next(page)).toBeEnabled();

    const firstPageIds = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-candidate-id")));
    expect(firstPageIds).toHaveLength(4);

    // [6] 다음 페이지로
    await next(page).click();

    // [7] 남은 2개만
    await expect(cards(page)).toHaveCount(2);
    // [8] 페이지 표시
    await expect(indicator(page)).toHaveText("2 / 2 페이지");
    // [9][10] 이전 활성 · 다음 비활성
    await expect(prev(page)).toBeEnabled();
    await expect(next(page)).toBeDisabled();

    // [11] 두 번째 페이지 후보는 첫 페이지와 겹치지 않는다.
    const secondPageIds = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-candidate-id")));
    expect(secondPageIds).toHaveLength(2);
    expect(secondPageIds.some((id) => firstPageIds.includes(id))).toBe(false);

    // slot 인덱스가 0부터 다시 시작한다.
    const slots = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-slot-index")));
    expect(slots).toEqual(["0", "1"]);
    const pages = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-page-index")));
    expect(pages).toEqual(["1", "1"]);

    // [12] 첫 페이지로 복귀
    await prev(page).click();
    await expect(cards(page)).toHaveCount(4);
    await expect(indicator(page)).toHaveText("1 / 2 페이지");
  });

  test("[13–22] 두 번째 페이지 후보를 Driver 가 자동 선택하고 Review·Evidence 에 반영한다", async ({ page, request }) => {
    const example = sandboxExample();
    const targetId = example.recommendation.recommendedCandidateId as string;

    // 예제가 실제로 두 번째 페이지 후보를 고르는지 먼저 확인한다.
    const fixture = await (await request.get(`${API}/api/v1/environments/sandbox/fixture`)).json();
    const index = fixture.candidates.findIndex((c: { candidateId: string }) => c.candidateId === targetId);
    expect(Math.floor(index / 4), "예제 후보는 2페이지에 있어야 한다").toBe(1);
    const targetName = fixture.candidates[index].name as string;

    await openSandboxTwin(page);

    // [16][17] 한 단계씩 진행하며 Driver 의 가상 페이지 전환을 실제 로그에서 본다.
    // (자동재생은 로그가 최근 14건만 남겨 초반 이벤트가 밀려난다.)
    const step = page.getByRole("button", { name: "한 단계 실행" });
    const pageEvent = page.locator(".log .row", { hasText: "SYNTHETIC_PAGE_CHANGED" });
    let sawPageChange = false;
    for (let i = 0; i < 12 && !sawPageChange; i += 1) {
      await step.click();
      sawPageChange = (await pageEvent.count()) > 0;
    }
    expect(sawPageChange, "SYNTHETIC_PAGE_CHANGED 이벤트가 로그에 나타나야 한다").toBe(true);
    await expect(pageEvent.first()).toContainText("가상 페이지 이동: 1 → 2");

    // [18] 페이지가 넘어간 뒤 대상 카드가 실제로 보이고 강조된다.
    const target = page.locator(`[data-candidate-id="${targetId}"]`);
    await expect(target).toBeVisible();
    await expect(target).toHaveAttribute("data-page-index", "1");
    await step.click(); // TARGET_PRESSED
    await expect(page.locator(`[data-candidate-id="${targetId}"][data-pressed="true"], [data-candidate-id="${targetId}"][data-highlighted="true"]`))
      .toHaveCount(1);

    // 남은 단계를 마저 재생한다.
    await page.getByRole("button", { name: "전체 자동재생" }).click();
    await expect(page.getByText(/경계 도달 \+ verifier 실행 후 STOP/)).toBeVisible({ timeout: 20_000 });

    // [19] Review 에 정확한 두 번째 페이지 후보명이 보인다.
    await expect(page.getByText(targetName).first()).toBeVisible();

    // [20][21] Evidence 의 page/slot
    await page.getByRole("button", { name: "Evidence →" }).click();
    const evidence = JSON.parse(await page.locator("pre.json").innerText());
    const trace = evidence.resolvedSimulationTrace.find(
      (t: { semanticTarget: { id: string } }) => t.semanticTarget.id === targetId);
    expect(trace, "선택 후보의 resolve 기록").toBeTruthy();
    expect(trace.resolvedTarget.pageIndex).toBe(1);
    expect(trace.resolvedTarget.slotIndex).toBe(index % 4);
    expect(trace.resolvedTarget.navigationClassification).toBe("SYNTHETIC_MOCK");

    // Evidence 는 두 단계 호환성을 분리해 담는다.
    expect(evidence.domainCompatibility.candidate).toBeTruthy();
    expect(evidence.domainCompatibility.executionChoice).toBeTruthy();
    expect(evidence.executionChoices.candidateId).toBe(targetId);
    expect(evidence.profileSummary.language).toBe("ko-KR");
  });

  test("[22] 수동 페이지 이동은 서버 run/evidence 를 바꾸지 않는다", async ({ page }) => {
    await openSandboxTwin(page);
    await page.getByRole("button", { name: "전체 자동재생" }).click();
    await expect(page.getByText(/경계 도달 \+ verifier 실행 후 STOP/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Evidence →" }).click();
    const before = await page.locator("pre.json").innerText();

    // 트윈으로 돌아가 운영자가 직접 페이지를 넘겨본다.
    await page.getByRole("button", { name: "← 트윈으로" }).click();
    await stepToGridFromTwin(page);
    const startCount = await cards(page).count();
    if (await next(page).isEnabled()) await next(page).click();
    else await prev(page).click();
    await expect(cards(page)).not.toHaveCount(startCount);

    await page.getByRole("button", { name: "Evidence →" }).click();
    const after = await page.locator("pre.json").innerText();
    expect(after).toBe(before);
  });
});

/** Advance an already-open twin until the grid screen is showing. */
async function stepToGridFromTwin(page: Page) {
  const step = page.getByRole("button", { name: "한 단계 실행" });
  const restart = page.getByRole("button", { name: "다시 시작" });
  await restart.click();
  for (let i = 0; i < 8; i += 1) {
    if (await cards(page).count() > 0) return;
    await step.click();
  }
  await expect(cards(page)).not.toHaveCount(0);
}

test.describe("시나리오 10 — 공개 계약 API", () => {
  test("compatibility-rules · review-mapping · fixture 확장 필드", async ({ request }) => {
    for (const env of ["hospital", "public-office", "chicken-store", "sandbox"]) {
      const rules = await request.get(`${API}/api/v1/environments/${env}/compatibility-rules`);
      expect(rules.status(), env).toBe(200);
      const rulesBody = await rules.json();
      expect(rulesBody.environmentId).toBe(env);
      expect(Array.isArray(rulesBody.rules)).toBe(true);

      const mapping = await request.get(`${API}/api/v1/environments/${env}/review-mapping`);
      expect(mapping.status(), env).toBe(200);
      expect((await mapping.json()).environmentId).toBe(env);

      const fixture = await (await request.get(`${API}/api/v1/environments/${env}/fixture`)).json();
      expect(fixture.compatibilityRules, `${env} fixture.compatibilityRules`).toBeTruthy();
      expect(fixture.reviewMapping, `${env} fixture.reviewMapping`).toBeTruthy();
    }
  });

  test("공개 계약 API 가 추천 정답을 노출하지 않는다", async ({ request }) => {
    const body = await (await request.get(`${API}/api/v1/environments/hospital/compatibility-rules`)).text();
    expect(body).not.toMatch(/expectedRecommendation|recommendedCandidateId|executionPlan/);
  });

  test("알 수 없는 환경은 404", async ({ request }) => {
    expect((await request.get(`${API}/api/v1/environments/nope/compatibility-rules`)).status()).toBe(404);
  });
});
