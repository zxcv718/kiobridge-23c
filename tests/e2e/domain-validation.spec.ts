import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Domain-level E2E: four-card paging, and the two rejection paths that used to
 * slip through (hospital appointment conflict, public-office auth mismatch).
 *
 * The evaluated environments appear here ONLY through submissions that must be
 * REJECTED. No completed execution plan for chicken-store / hospital /
 * public-office is constructed or shipped — building those stays the
 * participant's job.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const API = process.env.SIM_API_URL ?? "http://127.0.0.1:4000";

const readJson = (...segs: string[]) => JSON.parse(readFileSync(path.join(REPO_ROOT, ...segs), "utf-8"));

/** Profile shape shared by the rejection fixtures below. */
const profile = () => ({
  profileId: "E2E-PROFILE",
  dataClassification: "SYNTHETIC_PROFILE",
  source: { collectionChannel: "WEB_FORM", providerId: "TEAM-E2E", collectedAt: "2026-08-02T00:00:00.000Z" },
  accessibility: {
    largeText: false, simpleSteps: false, visualGuidance: false,
    hearingSupport: false, mobilitySupport: false, highContrast: false, staffAssistancePreferred: false,
  },
  interaction: { preferredInput: "TOUCH", language: "ko-KR", confirmationRequired: true },
  consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
});

/**
 * A submission whose RECOMMENDATION conflicts with the session context. The
 * execution plan is intentionally empty: the point is that validation rejects
 * the recommendation before any plan matters.
 */
const conflictingSubmission = (environmentId: string, sessionContext: unknown, recommendedCandidateId: string) => ({
  inputContractVersion: "1.0.0",
  submissionVersion: "1.0.0",
  teamId: "TEAM-E2E",
  environmentId,
  profile: profile(),
  sessionContext,
  recommendation: {
    recommendedCandidateId,
    alternativeCandidateIds: [], excludedCandidates: [], scoreBreakdown: {},
    recommendationReasons: ["E2E 충돌 시나리오"], unmetConditions: [],
    confidence: 0.9, requiresReconfirmation: false,
  },
  userDecision: { approved: true, decision: "APPROVE" },
  executionPlan: {
    planId: "E2E-CONFLICT", validationMode: "SIMULATION_ONLY",
    executionEnvironment: "DIGITAL_TWIN", actualDeviceCommandSent: false, actions: [],
  },
});

async function createSession(page: Page, envLabel: string): Promise<string> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "환경을 선택하세요" })).toBeVisible();
  const card = page.locator(".card").filter({ hasText: envLabel }).first();
  await card.getByRole("button", { name: "세션 생성 →" }).click();
  await expect(page.getByRole("heading", { name: /세션 · 제출 대기/ })).toBeVisible();
  return (await page.getByText(/SIM-\d{8}-\d{3}/).first().innerText()).trim();
}

async function post(request: APIRequestContext, sessionId: string, body: unknown) {
  const res = await request.post(`${API}/api/v1/sessions/${sessionId}/submission`, { data: body });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

/* ─────────────────── 4카드 페이지 ─────────────────── */

test.describe("시나리오 6 — FOUR_CARD_GRID 4카드 페이지", () => {
  test("한 페이지에 4개만 보이고, 페이지 이동으로 나머지 후보를 볼 수 있다", async ({ page }) => {
    // chicken-store 는 후보 8개 → 2페이지. 세션만 만들고 화면 구조만 확인한다
    // (완성 실행계획은 참가팀 몫이므로 제출하지 않는다).
    await createSession(page, "닭강정");

    // 대기 화면에서는 아직 키오스크가 없다. 후보 수와 페이지 계산은 fixture 로 확인.
    const fixture = await page.request.get(`${API}/api/v1/environments/chicken-store/fixture`);
    const body = await fixture.json();
    expect(body.candidates.length).toBeGreaterThan(4);
    const grid = Object.values(body.simulationBinding.screens as Record<string, { template: string; pageSize?: number }>)
      .find((b) => b.template === "FOUR_CARD_GRID")!;
    expect(grid.pageSize).toBe(4);
  });

  test("sandbox 실행 화면에서 페이저가 표시되고 수동 탐색은 보기 전용이다", async ({ page }) => {
    await createSession(page, "Sandbox");
    await page.getByRole("button", { name: "형식 예제 제출 불러오기" }).click();
    await expect(page.getByRole("heading", { name: /제출 검토/ })).toBeVisible();
    await page.getByRole("button", { name: "검증 실행" }).click();
    await expect(page.getByText(/검증 통과/)).toBeVisible();
    await page.getByRole("button", { name: "디지털 트윈 재생 →" }).click();
    await page.getByRole("button", { name: "전체 자동재생" }).click();
    await expect(page.getByText(/경계 도달 \+ verifier 실행 후 STOP/)).toBeVisible({ timeout: 20_000 });

    // Evidence 에 synthetic page/slot 해석 기록이 남는다.
    await page.getByRole("button", { name: "Evidence →" }).click();
    const evidenceJson = await page.locator("pre.json").innerText();
    const evidence = JSON.parse(evidenceJson);
    expect(evidence.resolvedSimulationTrace.length).toBeGreaterThan(0);
    expect(evidence.resolvedSimulationTrace[0].resolvedTarget.navigationClassification).toBe("SYNTHETIC_MOCK");
    expect(evidence.resolvedSimulationTrace[0].resolvedTarget.template).toBe("FOUR_CARD_GRID");
    expect(evidence.reviewResolution.unresolvedRequiredFields).toEqual([]);
  });
});

/* ─────────────────── 병원 검토 ─────────────────── */

test.describe("시나리오 7 — 병원 예약 충돌", () => {
  test("NO_APPOINTMENT 사용자에게 예약필수 후보를 추천하면 검증 FAIL 이고 실행이 잠긴다", async ({ page, request }) => {
    const candidates = readJson("environments", "hospital", "candidates.json") as {
      candidateId: string; supportedOptions: Record<string, string[]>;
    }[];
    // 예약이 반드시 필요한 후보를 데이터에서 찾는다 (ID 하드코딩 없음).
    const appointmentOnly = candidates.find((c) => c.supportedOptions.APPOINTMENT.join() === "HAS_APPOINTMENT")!;
    expect(appointmentOnly, "예약필수 후보").toBeTruthy();

    const sessionId = await createSession(page, "병원");
    await post(request, sessionId, conflictingSubmission("hospital", {
      intent: { task: "CHECK_IN" },
      facts: {
        visitType: appointmentOnly.supportedOptions.VISIT_TYPE[0],
        appointmentStatus: "NO_APPOINTMENT",
        departmentId: appointmentOnly.supportedOptions.DEPARTMENT[0],
      },
      preferences: {}, hardConstraints: { medicalInferenceAllowed: false },
      capabilities: {}, fieldMetadata: {},
    }, appointmentOnly.candidateId));

    await expect(page.getByRole("heading", { name: /제출 검토/ })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "검증 실행" }).click();

    await expect(page.getByText(/검증 실패/)).toBeVisible();
    await expect(page.getByText("APPOINTMENT_MISMATCH").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "디지털 트윈 재생 →" })).toBeDisabled();
  });

  test("진료과 라벨이 '-' 가 아니라 실제 이름으로 매핑되어 있다", async () => {
    const mapping = readJson("environments", "hospital", "review-mapping.json") as {
      fields: { fieldId: string; valueLabels?: Record<string, string> }[];
    };
    const dept = mapping.fields.find((f) => f.fieldId === "departmentId")!;
    expect(dept.valueLabels!.INTERNAL_MEDICINE).toBe("내과");
    expect(dept.valueLabels!.UNSPECIFIED).toBe("진료과 미지정");
    expect(dept.valueLabels!.UNKNOWN).toBe("진료과 확인 필요");
    expect(Object.values(dept.valueLabels!)).not.toContain("-");
  });
});

/* ─────────────────── 관공서 인증 ─────────────────── */

test.describe("시나리오 8 — 관공서 인증수단 교집합", () => {
  test("이용 가능한 인증수단과 후보 요구수단이 겹치지 않으면 AUTH_METHOD_UNAVAILABLE", async ({ page, request }) => {
    const candidates = readJson("environments", "public-office", "candidates.json") as {
      candidateId: string; requirements: { authenticationMethods: string[] };
      supportedOptions: Record<string, string[]>;
    }[];
    // 모바일 인증만 요구하는 후보를 찾는다.
    const mobileOnly = candidates.find((c) => c.requirements.authenticationMethods.join() === "MOBILE_AUTH")!;
    expect(mobileOnly, "MOBILE_AUTH 전용 후보").toBeTruthy();

    const sessionId = await createSession(page, "관공서");
    await post(request, sessionId, conflictingSubmission("public-office", {
      intent: { task: "PUBLIC_SERVICE_GUIDANCE" },
      facts: { serviceCategory: mobileOnly.supportedOptions.CATEGORY[0] },
      preferences: { stepByStep: true, simpleLanguage: true },
      hardConstraints: { legalEligibilityInferenceAllowed: false },
      // 사용자는 신분증만 가지고 있다.
      capabilities: { availableAuthMethods: ["ID_CARD"] },
      fieldMetadata: {},
    }, mobileOnly.candidateId));

    await expect(page.getByRole("heading", { name: /제출 검토/ })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "검증 실행" }).click();

    await expect(page.getByText(/검증 실패/)).toBeVisible();
    await expect(page.getByText("AUTH_METHOD_UNAVAILABLE").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "디지털 트윈 재생 →" })).toBeDisabled();
  });
});
