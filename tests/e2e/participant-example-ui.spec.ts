import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 사용자 접점 예제 UI — 참가팀이 여는 그대로 file:// 로 엽니다.
 *
 * 확인하는 것은 "화면이 뜬다" 가 아니라 실제 약속입니다:
 * 로그인 없이 시작되는가, 저장을 강요하지 않는가, 확인 전에 실행계획을 만들지
 * 않는가, 서버가 없을 때 가짜 PASS 를 만들지 않는가.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const UI = `file://${path.join(REPO_ROOT, "participant-workspace", "example-ui", "index.html")}`;
const API = process.env.SIM_API_URL ?? "http://127.0.0.1:4000";

/** 외부(디스크·API 외) 요청을 세어 오프라인 주장을 측정합니다. */
async function track(page: Page) {
  const offDisk: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith("file://") || u.startsWith("data:") || u.startsWith("blob:")) return;
    if (u.startsWith("http://127.0.0.1:4000") || u.startsWith("http://localhost:4000")) return; // 의도된 로컬 API
    offDisk.push(u);
  });
  /**
   * file:// 에서 Chromium 은 fetch("mock-context.json") 자체를 막고 콘솔에 적습니다.
   * 앱 결함이 아니라 스킴 제한이며, 앱은 이 실패를 잡아 기본값으로 진행합니다.
   * HTTP 로 열면 나오지 않는다는 사실은 아래 "HTTP 로 열었을 때" 묶음이 확인합니다.
   */
  const isFileSchemeFetchBlock = (t: string) =>
    /URL scheme "file" is not supported|Fetch API cannot load file:/.test(t);
  page.on("pageerror", (e) => {
    const t = String(e.message ?? e);
    if (!isFileSchemeFetchBlock(t)) errors.push(t);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !isFileSchemeFetchBlock(m.text())) errors.push(m.text());
  });
  return { offDisk, errors };
}

/** 익명 시작 → 설정 → QR → 조건 → 추천 화면까지. */
async function toRecommendation(page: Page, opts: { save?: boolean; url?: string } = {}) {
  await page.goto(opts.url ?? UI);
  await page.getByRole("button", { name: /이번만 사용하기/ }).click();
  await expect(page.locator("#step-a11y")).toBeVisible();
  if (opts.save) await page.locator("#save-yes").check();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.locator("#step-env")).toBeVisible();
  await page.getByRole("button", { name: /예시 QR 읽기/ }).click();
  await expect(page.locator("#step-need")).toBeVisible();
  await page.getByRole("button", { name: "추천 받기" }).click();
  await expect(page.locator("#step-rec")).toBeVisible();
}

test.describe("사용자 접점 예제 UI", () => {
  test("[1–2][17] 로그인 없이 시작하고 외부 네트워크 요청이 0이다", async ({ page }) => {
    const net = await track(page);
    await page.goto(UI);

    // 로그인을 "요구" 하지 않는지는 컨트롤로 판정합니다.
    // 안내 문구에 로그인이라는 낱말이 나오는 것은 정상입니다 — 선택사항이라고 설명하기 때문입니다.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^로그인$|^회원가입$|^가입하기$/ })).toHaveCount(0);

    const start = page.getByRole("button", { name: /이번만 사용하기/ });
    await expect(start).toBeVisible();
    await start.click();
    await expect(page.locator("#step-a11y")).toBeVisible();

    expect(net.offDisk, `외부 요청: ${net.offDisk.join(", ")}`).toEqual([]);
    expect(net.errors, net.errors.join("\n")).toEqual([]);
  });

  test("[3–5] 접근성 설정 저장 · 이번만 사용 · 삭제", async ({ page }) => {
    await page.goto(UI);
    await page.getByRole("button", { name: /이번만 사용하기/ }).click();

    // 기본값은 저장하지 않는 쪽이어야 합니다.
    await expect(page.locator("#save-no")).toBeChecked();

    await page.locator("#p-large").check();
    await page.locator("#p-simple").check();
    await page.locator("#save-yes").check();
    await page.getByRole("button", { name: "다음" }).click();

    const stored = await page.evaluate(() => localStorage.getItem("kio.example.profile"));
    expect(stored, "저장을 선택했으면 기기에 남아야 합니다").toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.largeText).toBe(true);
    // 접근성 설정만 저장합니다 — 개인정보 필드가 있으면 안 됩니다.
    expect(Object.keys(parsed).sort()).toEqual(["highContrast", "largeText", "savedAt", "simpleSteps", "voice"]);

    // 다시 열면 저장된 설정으로 시작하는 선택지가 보입니다.
    await page.reload();
    await expect(page.getByRole("button", { name: /저장된 설정으로 시작/ })).toBeVisible();
    await page.getByRole("button", { name: /저장된 설정으로 시작/ }).click();
    // 자동 적용이 아니라 확인 화면을 거칩니다.
    await expect(page.locator("#step-a11y")).toBeVisible();
    await expect(page.locator("#p-large")).toBeChecked();

    // 삭제
    await page.getByRole("button", { name: "저장된 설정 지우기" }).click();
    expect(await page.evaluate(() => localStorage.getItem("kio.example.profile"))).toBeNull();

    // "이번만 사용" 을 고르면 저장하지 않습니다.
    await page.locator("#save-no").check();
    await page.getByRole("button", { name: "다음" }).click();
    expect(await page.evaluate(() => localStorage.getItem("kio.example.profile"))).toBeNull();
  });

  test("[6] Mock QR 에 개인정보가 없다", async ({ page }) => {
    await page.goto(UI);
    await page.getByRole("button", { name: /이번만 사용하기/ }).click();
    await page.getByRole("button", { name: "다음" }).click();
    await page.getByRole("button", { name: /예시 QR 읽기/ }).click();

    const payload = JSON.parse(await page.locator("#qr-payload").innerText());
    expect(Object.keys(payload).sort()).toEqual(["environmentId", "fixtureVersion", "sessionNonce"]);
    expect(payload.environmentId).toBe("sandbox");
    expect(JSON.stringify(payload)).not.toMatch(/name|phone|email|birth|주민/i);
  });

  test("[7–9] 추천 결과 · 이유 · 대안이 표시된다", async ({ page }) => {
    await toRecommendation(page);

    await expect(page.locator("#rec-name")).not.toBeEmpty();

    const reasons = page.locator("#rec-reasons li");
    expect(await reasons.count(), "이유는 최소 1개").toBeGreaterThan(0);
    const reasonText = (await reasons.allTextContents()).join(" ");
    // 설명이 아닌 문장을 쓰면 안 됩니다.
    expect(reasonText).not.toMatch(/AI가 추천|최적의 선택|시스템이 결정/);

    await expect(page.getByRole("heading", { name: "다른 선택" })).toBeVisible();
    expect(await page.locator("#rec-alts .alt").count()).toBeGreaterThan(0);
  });

  test("[10–11] 추천을 거절하고 다른 후보로 바꿀 수 있다", async ({ page }) => {
    await toRecommendation(page);
    const first = await page.locator("#rec-name").innerText();

    await page.getByRole("button", { name: "다른 걸 보여주세요" }).click();
    await expect(page.locator("#rec-name")).not.toHaveText(first);

    // 대안에서 직접 고르기
    const alt = page.locator("#rec-alts .alt button").first();
    const altLabel = await page.locator("#rec-alts .alt span").first().innerText();
    await alt.click();
    expect(altLabel).toContain(await page.locator("#rec-name").innerText());
    // 직접 고르면 그 사실이 이유에 남습니다.
    await expect(page.locator("#rec-reasons")).toContainText("직접");
  });

  test("[12–13] 사용자 확인 전에는 실행계획이 없고, 확인 후에 생긴다", async ({ page }) => {
    await toRecommendation(page);

    // 추천 화면에서는 아직 계획이 없습니다.
    expect(await page.evaluate(() => document.getElementById("preview-plan")!.textContent)).toBe("");
    await expect(page.locator("#step-done")).toBeHidden();

    await page.getByRole("button", { name: "이걸로 할게요" }).click();
    await expect(page.locator("#step-confirm")).toBeVisible();
    // 확인 화면에서도 아직 없습니다.
    expect(await page.evaluate(() => document.getElementById("preview-plan")!.textContent)).toBe("");

    await page.getByRole("button", { name: "네, 이대로 해주세요" }).click();
    await expect(page.locator("#step-done")).toBeVisible();

    const plan = JSON.parse(await page.locator("#preview-plan").innerText());
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actualDeviceCommandSent).toBe(false);
    expect(plan.validationMode).toBe("SIMULATION_ONLY");
  });

  test("[14] Canonical Submission 이 계약 형태를 갖춘다", async ({ page }) => {
    await toRecommendation(page);
    await page.getByRole("button", { name: "이걸로 할게요" }).click();
    await page.getByRole("button", { name: "네, 이대로 해주세요" }).click();

    const sub = JSON.parse(await page.locator("#preview-submission").innerText());
    expect(sub.inputContractVersion).toBe("1.0.0");
    expect(sub.environmentId).toBe("sandbox");
    expect(sub.profile.interaction.language).toBe("ko-KR");
    expect(sub.profile.dataClassification).toBe("SYNTHETIC_PROFILE");
    // UTC Z 타임스탬프
    expect(sub.profile.source.collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    expect(sub.userDecision.approved).toBe(true);
    expect(sub.recommendation.recommendationReasons.length).toBeGreaterThan(0);
    // 외부 맥락은 팀 namespace 아래에만
    if (sub.sessionContext.extensions) {
      for (const key of Object.keys(sub.sessionContext.extensions)) {
        expect(key).toMatch(/^TEAM_[A-Z0-9_]+\./);
      }
    }
  });

  test("[15] JSON 을 내려받을 수 있다", async ({ page }) => {
    await toRecommendation(page);
    await page.getByRole("button", { name: "이걸로 할게요" }).click();
    await page.getByRole("button", { name: "네, 이대로 해주세요" }).click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "JSON 내려받기" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("participant-submission.json");
  });

  test("[16] 키보드만으로 시작할 수 있다", async ({ page }) => {
    await page.goto(UI);
    await page.keyboard.press("Tab");
    await expect(page.locator("a.skip")).toBeFocused();

    // 시작 버튼까지 Tab 으로 도달해 Enter 로 누릅니다.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => document.activeElement?.id ?? "");
      if (id === "start-anon") break;
    }
    await expect(page.locator("#start-anon")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#step-a11y")).toBeVisible();

    // 모든 버튼에 읽어줄 이름이 있어야 합니다.
    const unnamed = await page.locator("button").evaluateAll((els) =>
      els.filter((e) => !(e.textContent ?? "").trim() && !e.getAttribute("aria-label")).length);
    expect(unnamed).toBe(0);
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  });

  test("[18] 서버가 없으면 미리보기만 표시하고 가짜 PASS 를 만들지 않는다", async ({ page }) => {
    await page.route("**://127.0.0.1:4000/**", (route) => route.abort());
    await page.route("**://localhost:4000/**", (route) => route.abort());

    await toRecommendation(page);
    await page.getByRole("button", { name: "이걸로 할게요" }).click();
    await page.getByRole("button", { name: "네, 이대로 해주세요" }).click();

    await expect(page.locator("#result-banner")).toContainText("LOCAL UI PREVIEW ONLY");
    await page.getByRole("button", { name: "KioBridge 서버로 보내기" }).click();

    await expect(page.locator("#result-banner")).toContainText(/연결하지 못했습니다/, { timeout: 10_000 });
    // 실패를 성공처럼 보이게 만들지 않습니다.
    await expect(page.locator("#result-banner")).not.toContainText("SIMULATION SERVER RESULT");
    await expect(page.locator("#result-banner")).not.toContainText("PASS");
  });

  test("[19–20] 서버가 있으면 실제 Sandbox 검증 결과를 구분해 보여준다", async ({ page, request }) => {
    // 서버가 실제로 떠 있을 때만 의미가 있는 검사입니다.
    const health = await request.get(`${API}/health`).catch(() => null);
    test.skip(!health || !health.ok(), "Simulation API 가 실행 중이 아닙니다");

    await toRecommendation(page);
    await page.getByRole("button", { name: "이걸로 할게요" }).click();
    await page.getByRole("button", { name: "네, 이대로 해주세요" }).click();
    await expect(page.locator("#result-banner")).toContainText("LOCAL UI PREVIEW ONLY");

    await page.getByRole("button", { name: "KioBridge 서버로 보내기" }).click();
    await expect(page.locator("#result-banner")).toContainText("SIMULATION SERVER RESULT", { timeout: 20_000 });

    const evidence = JSON.parse(await page.locator("#preview-evidence").innerText());
    expect(evidence.resultScope).toBe("SIMULATION_VALIDATION_ONLY");
    expect(evidence.actualDeviceCommandSent).toBe(false);
    expect(evidence.result).toBe("PASS");
  });

  test("큰 글씨·고대비가 실제로 적용된다", async ({ page }) => {
    await page.goto(UI);
    const before = await page.evaluate(() => getComputedStyle(document.body).fontSize);
    await page.getByRole("button", { name: "큰 글씨" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-large", "on");
    const after = await page.evaluate(() => getComputedStyle(document.body).fontSize);
    expect(parseFloat(after)).toBeGreaterThan(parseFloat(before));

    await page.getByRole("button", { name: "고대비" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "on");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(0, 0, 0)");
  });

  /* ─────────── v5.1.3 안내 문구 · 저장 선택성 ─────────── */

  test("[21] 상단 안내가 예제 동작과 참가팀 규칙을 나누어 보여준다", async ({ page }) => {
    const t = await track(page);
    await page.goto(UI);

    const notice = page.locator("section.notice");
    await expect(notice).toBeVisible();
    const paras = await notice.locator("p").allInnerTexts();
    expect(paras.length, "상단 안내는 여러 문단이어야 합니다").toBeGreaterThanOrEqual(3);

    const joined = paras.join(" ");
    expect(joined).toMatch(/Sandbox 참고 예제/);          // 1. 참고 예제
    expect(joined).toMatch(/이 예제는 로그인 없이 동작/);   // 2. 예제의 동작
    expect(joined).toMatch(/자유롭게 구현/);               // 3. 참가팀 자유
    expect(joined).toMatch(/핵심 이용 흐름은 로그인 없이/); // 4. 반드시 지킬 것
    expect(joined).toMatch(/가상 데이터/);                 // 5. 심사 데이터

    // 첫 문장이 강조되어야 합니다.
    await expect(notice.locator("p").first().locator("strong")).toHaveCount(1);

    expect(t.offDisk, `외부 요청: ${t.offDisk.join(", ")}`).toEqual([]);
    expect(t.errors, t.errors.join("\n")).toEqual([]);
  });

  test("[22] 로그인 선택사항 안내를 키보드로 펼칠 수 있다", async ({ page }) => {
    await page.goto(UI);
    const block = page.locator("#login-optional");
    await expect(block).toBeVisible();

    const summary = block.locator("summary");
    await expect(summary).toHaveText(/로그인 기능은 선택사항입니다/);

    // 접힌 상태에서 시작해 첫 화면을 복잡하게 만들지 않습니다.
    expect(await block.evaluate((e: HTMLDetailsElement) => e.open)).toBe(false);

    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await block.evaluate((e: HTMLDetailsElement) => e.open)).toBe(true);

    const body = await block.innerText();
    expect(body).toMatch(/금지되지 않습니다/);
    expect(body).toMatch(/핵심 기능을 사용할 수 있어야 합니다/);
    expect(body).toMatch(/익명 시작 또는 건너뛰기/);
  });

  test("[23] 시작 버튼 두 개의 문구와 저장 없음 안내", async ({ page }) => {
    await page.goto(UI);

    await expect(page.locator("#step-start")).toContainText("이 예제에서는 계정 없이 바로 시작합니다");
    await expect(page.locator("#start-anon .t")).toHaveText("이번만 사용하기");
    await expect(page.locator("#start-anon .d")).toHaveText(/이번 이용에서는 아무 정보도 기기에 저장하지 않습니다/);

    // 저장된 설정이 없으면 불러오기 버튼은 보이지 않아야 합니다.
    await expect(page.locator("#start-saved")).toBeHidden();
    await expect(page.locator("#saved-none")).toHaveText("이 기기에 저장된 접근성 설정이 없습니다.");
    await expect(page.locator("#step-start")).toContainText("저장 기능은 선택사항");
  });

  test("[24] 저장하면 다음 방문에 불러오기 버튼이 생기고, 지우면 사라진다", async ({ page }) => {
    await page.goto(UI);
    await page.locator("#start-anon").click();
    await page.locator("#p-large").check();
    await page.locator("#save-yes").check();
    await page.getByRole("button", { name: "다음" }).click();

    await page.reload();
    await expect(page.locator("#start-saved")).toBeVisible();
    await expect(page.locator("#saved-summary")).not.toBeEmpty();
    await expect(page.locator("#saved-none")).toBeHidden();

    await page.locator("#start-saved").click();
    await page.getByRole("button", { name: "저장된 설정 지우기" }).click();
    await page.reload();
    await expect(page.locator("#start-saved")).toBeHidden();
    expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
  });

  test("[25] 하단 안내가 교체 자유·가상 데이터·실제 서비스 요건을 말한다", async ({ page }) => {
    await page.goto(UI);
    const footer = await page.locator("footer").innerText();

    expect(footer).toMatch(/참고 예제/);
    expect(footer).toMatch(/공식 정답이나 필수 디자인이 아닙니다/);
    expect(footer).toMatch(/자유롭게 교체하거나 처음부터 새로 만들 수 있습니다/);
    expect(footer).toMatch(/QR|음성/);
    expect(footer).toMatch(/Canonical Contract/);
    expect(footer).toMatch(/가상[·・]?합성 데이터|가상 데이터/);
    expect(footer).toMatch(/실제 서비스로 확장/);

    // 한 문단으로 뭉쳐 있지 않아야 합니다.
    expect(await page.locator("footer p").count()).toBeGreaterThanOrEqual(3);
  });

  test("[26] 로그인 입력이 없고, 저장 없이 최종 확인까지 끝난다", async ({ page }) => {
    const t = await track(page);
    await toRecommendation(page);           // 저장하지 않은 기본 경로

    // 기본 흐름을 막는 로그인 컨트롤이 없어야 합니다.
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await expect(page.locator("input[type=email]")).toHaveCount(0);

    await page.locator("#rec-accept").click();
    await expect(page.locator("#step-confirm")).toBeVisible();
    await page.locator("#confirm-yes").click();
    await expect(page.locator("#step-done")).toBeVisible();

    expect(await page.evaluate(() => Object.keys(localStorage).length),
      "저장을 고르지 않았는데 저장되었습니다").toBe(0);
    expect(t.offDisk).toEqual([]);
    expect(t.errors, t.errors.join("\n")).toEqual([]);
  });
});

/* ─────────────────── HTTP 로 열었을 때 (§23) ───────────────────
 *
 * 참가팀에게 권장하는 실행 방식입니다. file:// 과 달리 mock-context.json 을
 * 읽을 수 있어 콘솔 오류가 0 이어야 합니다.
 */
test.describe("예제 UI — 로컬 HTTP 서버", () => {
  const UI_DIR = path.join(REPO_ROOT, "participant-workspace", "example-ui");
  const TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  };
  let server: import("node:http").Server;
  let origin = "";

  test.beforeAll(async () => {
    const { createServer } = await import("node:http");
    const { readFile } = await import("node:fs/promises");
    server = createServer(async (req, res) => {
      const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const file = path.join(UI_DIR, rel === "/" ? "index.html" : rel);
      // 디렉터리 밖으로 나가는 경로는 거부합니다.
      if (!file.startsWith(UI_DIR)) { res.writeHead(403).end(); return; }
      try {
        const buf = await readFile(file);
        res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
        res.end(buf);
      } catch { res.writeHead(404).end("not found"); }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    origin = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });

  test.afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  test("[27] CSS·JS 가 적용되고 콘솔 오류가 0이다", async ({ page }) => {
    const errors: string[] = [];
    const offOrigin: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e.message ?? e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("request", (r) => {
      const u = r.url();
      if (u.startsWith(origin) || u.startsWith("http://127.0.0.1:4000")) return;
      if (u.startsWith("data:") || u.startsWith("blob:")) return;
      offOrigin.push(u);
    });

    await page.goto(`${origin}/`);

    // 스타일시트가 실제로 적용됐는지 — 기본 16px 이 아니어야 합니다.
    const fs = await page.evaluate(() => getComputedStyle(document.body).fontSize);
    expect(parseFloat(fs)).toBeGreaterThan(16);

    // 스크립트가 붙었는지 — 버튼이 실제로 반응해야 합니다.
    await page.locator("#start-anon").click();
    await expect(page.locator("#step-a11y")).toBeVisible();

    expect(errors, errors.join("\n")).toEqual([]);
    expect(offOrigin, `외부 요청: ${offOrigin.join(", ")}`).toEqual([]);
  });

  test("[28] HTTP 에서는 Mock 상황정보를 읽고 흐름이 끝까지 간다", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e.message ?? e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await toRecommendation(page, { url: `${origin}/` });

    await page.locator("#rec-accept").click();
    await page.locator("#confirm-yes").click();
    await expect(page.locator("#step-done")).toBeVisible();

    // file:// 에서 나던 스킴 차단 오류가 여기서는 없어야 합니다.
    expect(errors.filter((e) => /file/.test(e))).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("[29] 큰 글씨·고대비가 HTTP 에서도 실제로 적용된다", async ({ page }) => {
    await page.goto(`${origin}/`);
    const before = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));

    await page.getByRole("button", { name: "큰 글씨" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-large", "on");
    const after = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    expect(after).toBeGreaterThan(before);

    await page.getByRole("button", { name: "고대비" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "on");
  });

  test("[30] 키보드만으로 시작 버튼에 도달해 시작할 수 있다", async ({ page }) => {
    await page.goto(`${origin}/`);
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      if (await page.locator("#start-anon").evaluate((e) => e === document.activeElement)) break;
    }
    await expect(page.locator("#start-anon")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#step-a11y")).toBeVisible();
  });
});
