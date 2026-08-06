import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 00_START_HERE.html — opened the way a participant opens it: straight off disk.
 *
 * The point of this page is that it works before anything is installed and
 * without a network. So the test loads it over file:// and fails the moment any
 * external request is attempted.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PAGE_URL = `file://${path.join(REPO_ROOT, "00_START_HERE.html")}`;
const PRODUCT_VERSION = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")).version;
/** ZIP 루트 기준 파일명. spec 폴더 기준 경로가 아니므로 조립해서 씁니다. */
const CHECKLIST = "WINDOWS_FINAL_CHECKLIST.md";

/** Records every off-disk request so the offline claim is measured, not assumed. */
async function trackNetwork(page: Page) {
  const external: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!url.startsWith("file://") && !url.startsWith("data:") && !url.startsWith("blob:")) external.push(url);
  });
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(String(err.message ?? err)));
  return { external, consoleErrors };
}

test.describe("오프라인 START_HERE", () => {
  test("[1–5] 인터넷 없이 열리고 외부 요청이 0이며 버전을 표시한다", async ({ page }) => {
    const net = await trackNetwork(page);
    await page.goto(PAGE_URL);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("KioBridge");
    expect(net.external, `외부 요청: ${net.external.join(", ")}`).toEqual([]);
    expect(net.consoleErrors, net.consoleErrors.join("\n")).toEqual([]);

    await expect(page.getByText(PRODUCT_VERSION).first()).toBeVisible();
    await expect(page.getByText("1.0.0").first()).toBeVisible();
  });

  test("[6] 주요 카드 10개가 모두 있다", async ({ page }) => {
    await page.goto(PAGE_URL);
    for (const title of ["5분 설치 확인", "Sandbox 첫 실행", "참가팀이 만드는 것", "수정할 파일",
      "환경 선택", "제출 검증", "최종 제출 만들기", "오류 해결", "PASS 의 의미", "실제 키오스크와의 차이"]) {
      await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();
    }
  });

  test("[7–8][16] 모든 상대 링크가 실제 파일을 가리킨다", async ({ page }) => {
    await page.goto(PAGE_URL);
    const hrefs = await page.locator("a[href]").evaluateAll((els) =>
      els.map((e) => e.getAttribute("href") ?? ""));

    const relative = hrefs.filter((h) => h && !/^(https?:|mailto:|#)/.test(h));
    expect(relative.length).toBeGreaterThan(5);

    const missing = relative.filter((h) => !existsSync(path.join(REPO_ROOT, decodeURIComponent(h))));
    expect(missing, `없는 파일: ${missing.join(", ")}`).toEqual([]);

    // 사용자 접점 자료로 이어지는 길이 있어야 합니다.
    expect(relative.some((h) => h.includes("participant-workspace"))).toBe(true);
  });

  test("[9] 복사 버튼이 동작한다", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => { /* file:// 에서는 무시 */ });
    await page.goto(PAGE_URL);

    const copy = page.getByRole("button", { name: /복사/ }).first();
    await expect(copy).toBeVisible();
    const before = await copy.textContent();
    await copy.click();
    // 클립보드 접근이 막혀도 사용자에게 결과를 알려야 합니다.
    await expect(copy).toHaveText("복사됨", { timeout: 3000 });
    expect(before).not.toBe("복사됨");
  });

  test("[10] 체크박스 상태가 새로고침 후에도 유지된다", async ({ page }) => {
    await page.goto(PAGE_URL);
    const first = page.locator("#checks input[type=checkbox]").first();
    await first.check();
    await page.reload();
    await expect(page.locator("#checks input[type=checkbox]").first()).toBeChecked();

    await page.getByRole("button", { name: "체크 초기화" }).click();
    await expect(page.locator("#checks input[type=checkbox]").first()).not.toBeChecked();
  });

  test("[11–12] 큰 글씨·고대비 토글이 실제로 적용된다", async ({ page }) => {
    await page.goto(PAGE_URL);
    const root = page.locator("html");

    const big = page.getByRole("button", { name: "큰 글씨" });
    const sizeBefore = await page.evaluate(() => getComputedStyle(document.body).fontSize);
    await big.click();
    await expect(root).toHaveAttribute("data-large", "on");
    await expect(big).toHaveAttribute("aria-pressed", "true");
    const sizeAfter = await page.evaluate(() => getComputedStyle(document.body).fontSize);
    expect(parseFloat(sizeAfter)).toBeGreaterThan(parseFloat(sizeBefore));

    const contrast = page.getByRole("button", { name: "고대비" });
    await contrast.click();
    await expect(root).toHaveAttribute("data-contrast", "on");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(0, 0, 0)");
  });

  test("[13–15] skip link · 키보드 이동 · 접근성 이름", async ({ page }) => {
    await page.goto(PAGE_URL);

    // 첫 Tab 이 본문 건너뛰기로 가야 합니다.
    await page.keyboard.press("Tab");
    const skip = page.locator("a.skip");
    await expect(skip).toBeFocused();
    await expect(skip).toHaveText("본문으로 건너뛰기");

    // 이어지는 Tab 이 실제 조작 요소로 이동합니다.
    await page.keyboard.press("Tab");
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(["BUTTON", "A", "INPUT"]).toContain(focusedTag);

    // 모든 버튼에 읽어줄 이름이 있어야 합니다.
    const unnamed = await page.locator("button").evaluateAll((els) =>
      els.filter((e) => !(e.textContent ?? "").trim() && !e.getAttribute("aria-label")).length);
    expect(unnamed).toBe(0);

    await expect(page.locator("main#main")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  });

  test("[17] Windows 최종 체크리스트 링크가 실제 파일을 연다", async ({ page }) => {
    const net = await trackNetwork(page);
    await page.goto(PAGE_URL);

    const link = page.getByRole("link", { name: "Windows 최종 체크리스트 열기" });
    await expect(link).toBeVisible();
    // 접근성 이름은 링크 텍스트에서 나옵니다. 아이콘만 있는 링크가 되지 않게 확인합니다.
    await expect(link).toHaveAccessibleName("Windows 최종 체크리스트 열기");
    await expect(link).toHaveAttribute("href", `./${CHECKLIST}`);

    // 링크 대상이 실제로 있고 읽히는지 — 브라우저는 .md 를 렌더링하지 않으므로
    // href 를 파일 경로로 풀어 직접 확인합니다.
    const target = path.join(REPO_ROOT, CHECKLIST);
    expect(existsSync(target), "WINDOWS_FINAL_CHECKLIST.md 가 없습니다").toBe(true);
    const text = readFileSync(target, "utf-8");
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain(PRODUCT_VERSION);
    expect(text).toMatch(/WINDOWS_RUNTIME_VALIDATION[^\n]*NOT_RUN/);

    // Windows 안내 문구가 START_HERE 에 보여야 합니다.
    await expect(page.getByText(/start-windows\.bat.*실행 전|실행 전[\s\S]*WINDOWS_FINAL_CHECKLIST/)).toBeVisible();

    expect(net.external, `외부 요청: ${net.external.join(", ")}`).toEqual([]);
  });

  test("[18] 체크리스트 링크에 키보드로 도달하고 Enter 로 열 수 있다", async ({ page }) => {
    await page.goto(PAGE_URL);
    const link = page.getByRole("link", { name: "Windows 최종 체크리스트 열기" });

    await link.focus();
    await expect(link).toBeFocused();

    // Enter 로 실제 이동이 일어나는지 — file:// 에서 .md 는 저장 대화상자 대신
    // 그대로 탐색되므로 URL 변화로 확인합니다.
    await page.keyboard.press("Enter");
    await page.waitForURL(/WINDOWS_FINAL_CHECKLIST\.md$/, { timeout: 5000 });
    expect(page.url()).toContain("WINDOWS_FINAL_CHECKLIST.md");
    // 404·파일 없음이 아니어야 합니다.
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).not.toMatch(/ERR_FILE_NOT_FOUND|404/);
    expect(body).toContain("KioBridge");
  });

  test("사용자 접점이 핵심이라는 과제 원칙이 표시된다", async ({ page }) => {
    await page.goto(PAGE_URL);
    await expect(page.getByText(/키오스크를 새로 만드는 것이 아닙니다|키오스크 자체를 다시 만드는/)).toBeVisible();
  });
});
