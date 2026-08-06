import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * E2E through the OFFICIAL simulator UI, on the SANDBOX environment only.
 *
 * Sandbox is the one environment that ships a complete example submission; the
 * three evaluated environments deliberately do not, because building their
 * execution plans is the participant's job. These tests therefore never load
 * (or construct) a completed plan for chicken-store / hospital / public-office.
 *
 * Everything is SIMULATION_ONLY — no real device is ever contacted.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const API = process.env.SIM_API_URL ?? "http://127.0.0.1:4000";
const SANDBOX_EXAMPLE = path.join(REPO_ROOT, "examples", "submission-format-example", "sandbox.json");

function loadSandboxSubmission(): Record<string, unknown> {
  const doc = JSON.parse(readFileSync(SANDBOX_EXAMPLE, "utf-8"));
  delete doc._note;
  return doc;
}

/** The sandbox card is identified by its environment name, not by position. */
async function createSandboxSession(page: Page): Promise<string> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "환경을 선택하세요" })).toBeVisible();

  const card = page.locator(".card").filter({ hasText: "Sandbox" }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "세션 생성 →" }).click();

  await expect(page.getByRole("heading", { name: /세션 · 제출 대기/ })).toBeVisible();
  const sessionId = await page.getByText(/SIM-\d{8}-\d{3}/).first().innerText();
  expect(sessionId).toMatch(/^SIM-\d{8}-\d{3}$/);
  return sessionId.trim();
}

async function postSubmission(request: APIRequestContext, sessionId: string, body: unknown) {
  const res = await request.post(`${API}/api/v1/sessions/${sessionId}/submission`, { data: body });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return res;
}

test.describe("시나리오 1 — 공식 웹 Sandbox 전체 흐름", () => {
  test("세션 → 제출 → 검증 → 트윈 → 경계 정지 → Evidence(SIMULATION PASS)", async ({ page }) => {
    // 1~2. 접속 + API 연결 상태 (연결 실패 배너가 없어야 한다)
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Simulation API 에 연결할 수 없습니다" })).toHaveCount(0);
    await expect(page.getByText("SIMULATION ONLY").first()).toBeVisible();

    // 3~4. Sandbox 세션 생성
    await createSandboxSession(page);
    await expect(page.getByText("WAITING")).toBeVisible();

    // 5~6. Sandbox 형식 예제 제출 → 자동 감지로 검토 화면 진입
    await page.getByRole("button", { name: "형식 예제 제출 불러오기" }).click();
    await expect(page.getByRole("heading", { name: /제출 검토/ })).toBeVisible();
    await expect(page.getByText("PARTICIPANT SUBMISSION · 읽기 전용")).toBeVisible();

    // 7~8. 검증 → PASS
    await page.getByRole("button", { name: "검증 실행" }).click();
    await expect(page.getByText(/검증 통과/)).toBeVisible();

    // 9. 검증 통과 후에만 실행 버튼이 활성화된다
    const runButton = page.getByRole("button", { name: "디지털 트윈 재생 →" });
    await expect(runButton).toBeEnabled();

    // 10~11. 실행 + 가상 키오스크 화면 전환
    await runButton.click();
    await expect(page.getByRole("heading", { name: /가상 키오스크/ })).toBeVisible();
    await page.getByRole("button", { name: "전체 자동재생" }).click();

    // 12~13. REVIEW 경계 도달 + verifier 실행
    await expect(page.getByText(/경계 도달 \+ verifier 실행 후 STOP/)).toBeVisible({ timeout: 20_000 });

    // 14~17. Evidence: SIMULATION PASS + 범위 한정 + 추천 미평가 안내
    await page.getByRole("button", { name: "Evidence →" }).click();
    await expect(page.getByRole("heading", { level: 2, name: /Evidence/ })).toBeVisible();
    await expect(page.getByText("SIMULATION PASS").first()).toBeVisible();
    await expect(page.getByTestId("result-scope")).toHaveText("SIMULATION_VALIDATION_ONLY");
    await expect(page.getByText("stopType === NORMAL_BOUNDARY_STOP").first()).toBeVisible();
    await expect(page.getByText("requiredVerifierExecuted").first()).toBeVisible();

    // 추천 품질은 공개 배포본에서 평가하지 않는다는 안내
    await expect(page.getByText("Recommendation Quality").first()).toBeVisible();
    await expect(page.getByText("비공개 심사").first()).toBeVisible();
    await expect(page.getByText(/추천 품질, 접근성 UX, 창의성과 최종 심사 점수를 의미하지 않습니다/)).toBeVisible();
  });
});

test.describe("시나리오 2 — 외부 API 제출 자동 감지", () => {
  test("웹에서 세션만 만들고 API 로 제출하면 붙여넣기 없이 검토 화면으로 전환된다", async ({ page, request }) => {
    const sessionId = await createSandboxSession(page);

    // 브라우저 업로드/붙여넣기 없이, 다른 서비스인 척 API 로 제출한다.
    await postSubmission(request, sessionId, loadSandboxSubmission());

    await expect(page.getByRole("heading", { name: /제출 검토/ })).toBeVisible({ timeout: 10_000 });

    // 감지 후에도 검증과 실행이 정상 동작한다.
    await page.getByRole("button", { name: "검증 실행" }).click();
    await expect(page.getByText(/검증 통과/)).toBeVisible();
    await expect(page.getByRole("button", { name: "디지털 트윈 재생 →" })).toBeEnabled();
  });
});

test.describe("시나리오 3 — 검증 전 실행 차단", () => {
  test("제출을 받아도 검증 전에는 디지털 트윈 재생이 비활성화된다", async ({ page, request }) => {
    const sessionId = await createSandboxSession(page);
    await postSubmission(request, sessionId, loadSandboxSubmission());
    await expect(page.getByRole("heading", { name: /제출 검토/ })).toBeVisible({ timeout: 10_000 });

    const runButton = page.getByRole("button", { name: "디지털 트윈 재생 →" });
    await expect(runButton).toBeDisabled();
    await expect(runButton).toHaveAttribute("title", /먼저 검증을 통과해야/);

    // 검증을 통과해야 비로소 열린다.
    await page.getByRole("button", { name: "검증 실행" }).click();
    await expect(page.getByText(/검증 통과/)).toBeVisible();
    await expect(runButton).toBeEnabled();
  });
});

test.describe("시나리오 4 — 새 제출 시 이전 결과 초기화", () => {
  test("두 번째 제출이 도착하면 validation·run·evidence 가 초기화되고 실행이 다시 잠긴다", async ({ page, request }) => {
    const sessionId = await createSandboxSession(page);
    const submission = loadSandboxSubmission();

    // 첫 제출 → 검증 → 실행 → Evidence
    await postSubmission(request, sessionId, submission);
    await expect(page.getByRole("heading", { name: /제출 검토/ })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "검증 실행" }).click();
    await expect(page.getByText(/검증 통과/)).toBeVisible();
    await page.getByRole("button", { name: "디지털 트윈 재생 →" }).click();
    await page.getByRole("button", { name: "전체 자동재생" }).click();
    await expect(page.getByText(/경계 도달 \+ verifier 실행 후 STOP/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Evidence →" }).click();
    await expect(page.getByText("SIMULATION PASS").first()).toBeVisible();

    // 두 번째 제출 (teamId 만 다른 동일 계획)
    await postSubmission(request, sessionId, { ...submission, teamId: "TEAM-SECOND" });

    // 이전 Evidence 화면에서 벗어나 검토 화면으로 되돌아온다.
    await expect(page.getByRole("heading", { name: /제출 검토/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("SIMULATION PASS")).toHaveCount(0);
    await expect(page.getByText(/검증 통과/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "디지털 트윈 재생 →" })).toBeDisabled();
  });
});

test.describe("시나리오 5 — 잘못된 제출", () => {
  test("금지된 결제 Action 이 있으면 검증 FAIL 이고 실행이 잠긴 채 오류 code 가 표시된다", async ({ page, request }) => {
    const sessionId = await createSandboxSession(page);

    // 공개된 "오류 제출 예제" 를 그대로 쓴다 — 정답을 새로 만들지 않는다.
    const bad = JSON.parse(readFileSync(
      path.join(REPO_ROOT, "examples", "invalid-submissions", "payment-action.json"), "utf-8"));
    delete bad._note;
    await postSubmission(request, sessionId, bad);

    await expect(page.getByRole("heading", { name: /제출 검토/ })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "검증 실행" }).click();

    await expect(page.getByText(/검증 실패/)).toBeVisible();
    await expect(page.getByText("FORBIDDEN_ACTION").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "디지털 트윈 재생 →" })).toBeDisabled();
  });
});
