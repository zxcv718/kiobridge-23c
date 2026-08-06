import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { locateCandidate, pageCountFor, pageOf, SimulationDriver } from "@kiobridge/simulation-driver";
import type { Candidate, EnvironmentPack, PlanAction } from "@kiobridge/contracts";
import { loadEnvironmentPack, processSubmission } from "../../shared";
import { buildSandboxSubmission } from "../sandbox/sandbox-plan-builder";

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ candidateId: `C-${i + 1}` }));

/* ─────────────────── 페이지 계산 (35–42) ─────────────────── */

describe("FOUR_CARD_GRID — 페이지 계산", () => {
  it("[35] 후보 3개면 1페이지", () => expect(pageCountFor(3, 4)).toBe(1));
  it("[36] 후보 4개면 1페이지", () => expect(pageCountFor(4, 4)).toBe(1));
  it("[37] 후보 5개면 2페이지", () => expect(pageCountFor(5, 4)).toBe(2));
  it("[38] 후보 8개면 2페이지", () => expect(pageCountFor(8, 4)).toBe(2));
  it("후보 9개면 3페이지", () => expect(pageCountFor(9, 4)).toBe(3));
  it("후보 0개여도 1페이지", () => expect(pageCountFor(0, 4)).toBe(1));

  it("[39] 첫 페이지에 최대 4개만 보인다", () => {
    expect(pageOf(ids(8), 0, 4).map((c) => c.candidateId)).toEqual(["C-1", "C-2", "C-3", "C-4"]);
  });

  it("[40] 마지막 페이지에는 남은 후보만 보인다", () => {
    expect(pageOf(ids(6), 1, 4).map((c) => c.candidateId)).toEqual(["C-5", "C-6"]);
    expect(pageOf(ids(8), 1, 4).map((c) => c.candidateId)).toEqual(["C-5", "C-6", "C-7", "C-8"]);
  });

  it("[41] index 4 는 page 1 slot 0", () => {
    const pos = locateCandidate(ids(8), "C-5", 4)!;
    expect([pos.pageIndex, pos.slotIndex]).toEqual([1, 0]);
  });

  it("[42] index 7 은 page 1 slot 3", () => {
    const pos = locateCandidate(ids(8), "C-8", 4)!;
    expect([pos.pageIndex, pos.slotIndex]).toEqual([1, 3]);
  });

  it("첫 페이지 후보의 위치", () => {
    expect(locateCandidate(ids(8), "C-1", 4)).toMatchObject({ pageIndex: 0, slotIndex: 0 });
    expect(locateCandidate(ids(8), "C-4", 4)).toMatchObject({ pageIndex: 0, slotIndex: 3 });
  });

  it("존재하지 않는 후보는 null", () => expect(locateCandidate(ids(8), "C-99", 4)).toBeNull());
});

/* ─────────────────── 환경팩 binding ─────────────────── */

describe("FOUR_CARD_GRID — 환경 binding", () => {
  const ENVS = ["chicken-store", "hospital", "public-office", "sandbox"] as const;

  it("모든 FOUR_CARD_GRID 화면에 pageSize=4 가 선언되어 있다", () => {
    let grids = 0;
    for (const env of ENVS) {
      const pack = loadEnvironmentPack(env);
      for (const [state, b] of Object.entries(pack.bindings.simulation.screens)) {
        if (b.template !== "FOUR_CARD_GRID") continue;
        grids += 1;
        expect(b.pageSize, `${env}/${state}`).toBe(4);
        expect(b.navigation?.classification, `${env}/${state}`).toBe("SYNTHETIC_MOCK");
      }
    }
    expect(grids).toBeGreaterThan(0);
  });

  it("후보 수가 5개 이상인 환경은 실제로 2페이지 이상이다", () => {
    for (const env of ENVS) {
      const pack = loadEnvironmentPack(env);
      const expected = pack.candidates.length > 4 ? 2 : 1;
      expect(pageCountFor(pack.candidates.length, 4), `${env} (${pack.candidates.length}후보)`).toBeGreaterThanOrEqual(expected);
    }
  });
});

/* ─────────────────── Driver 자동 resolve (43–48) ─────────────────── */

/** Drive the grid screen directly with a synthetic candidate selection. */
async function selectCandidateOnGrid(pack: EnvironmentPack, gridState: string, candidateId: string) {
  const driver = new SimulationDriver();
  const context = {
    pack,
    profile: { accessibility: { largeText: true, highContrast: true, simpleSteps: false, visualGuidance: false, hearingSupport: false } },
    sessionContext: {},
    recommendedCandidateId: candidateId,
  } as never;
  const initial = await driver.initialize(context);
  const state = { ...initial, currentState: gridState };
  const action: PlanAction = {
    actionIndex: 0, action: "select_menu",
    target: { kind: "candidate", id: candidateId },
    expectedBeforeState: gridState, expectedAfterState: gridState,
  } as PlanAction;
  return driver.execute(action, state, context);
}

describe("FOUR_CARD_GRID — 의미 기반 후보 자동 resolve", () => {
  const pack = loadEnvironmentPack("chicken-store");
  const gridState = "MENU_SELECTION";
  const secondPageCandidate = () => pack.candidates[5].candidateId; // index 5 -> page 1

  it("[43] 두 번째 페이지 후보를 참가팀 개입 없이 자동으로 찾는다", async () => {
    const out = await selectCandidateOnGrid(pack, gridState, secondPageCandidate());
    expect(out.ok).toBe(true);
    expect(out.state.uiState.resolvedCandidatePage).toBe(1);
    expect(out.state.uiState.resolvedCandidateSlot).toBe(1);
  });

  it("[44] synthetic 페이지 전환 이벤트가 생성된다", async () => {
    const out = await selectCandidateOnGrid(pack, gridState, secondPageCandidate());
    const ev = out.events.find((e) => e.type === "SYNTHETIC_PAGE_CHANGED")!;
    expect(ev, "SYNTHETIC_PAGE_CHANGED 이벤트").toBeTruthy();
    expect(ev.classification).toBe("SYNTHETIC_MOCK");
    expect(ev.fromPage).toBe(0);
    expect(ev.toPage).toBe(1);
    expect(ev.reason).toBe("RESOLVE_SEMANTIC_CANDIDATE");
  });

  it("첫 페이지 후보는 페이지 전환 없이 선택된다", async () => {
    const out = await selectCandidateOnGrid(pack, gridState, pack.candidates[1].candidateId);
    expect(out.events.some((e) => e.type === "SYNTHETIC_PAGE_CHANGED")).toBe(false);
    expect(out.state.uiState.resolvedCandidatePage).toBe(0);
    expect(out.state.uiState.resolvedCandidateSlot).toBe(1);
  });

  it("[45] 페이지 변경 후 해당 후보가 보이는 카드에 포함되고 강조된다", async () => {
    const id = secondPageCandidate();
    const out = await selectCandidateOnGrid(pack, gridState, id);
    // 카드가 눌리는 시점의 화면에 그 후보가 실제로 보여야 한다.
    const pressed = out.events.find((e) => e.type === "TARGET_PRESSED")!;
    expect(pressed.uiState.visibleCandidateIds).toContain(id);
    expect(pressed.uiState.visibleCandidateIds.length).toBeLessThanOrEqual(4);
    expect(pressed.uiState.pressedTarget).toMatchObject({ kind: "candidate", id });
    const highlighted = out.events.find((e) => e.type === "TARGET_HIGHLIGHTED")!;
    expect(highlighted.uiState.highlightedTarget).toMatchObject({ kind: "candidate", id });
  });

  it("[46] 선택된 후보 이름이 UI 상태에 정확히 반영된다", async () => {
    const c = pack.candidates[5];
    const out = await selectCandidateOnGrid(pack, gridState, c.candidateId);
    expect(out.state.uiState.selectedCandidate).toMatchObject({ id: c.candidateId, name: c.name });
  });

  it("[48] 접근성 모드는 페이지 전환 후에도 유지된다", async () => {
    const out = await selectCandidateOnGrid(pack, gridState, secondPageCandidate());
    expect(out.state.uiState.accessibilityMode.largeText).toBe(true);
    expect(out.state.uiState.accessibilityMode.highContrast).toBe(true);
  });

  it("[47] 수동 페이지 탐색은 UI 전용 — 실행상태를 바꾸지 않는다", () => {
    // 페이지 이동 Action 자체가 계약에 없다: 참가팀은 페이지를 제출할 수 없다.
    const actionKinds = pack.transitions.map((t) => t.action);
    expect(actionKinds.some((a) => /page|next_page|prev_page/i.test(a))).toBe(false);
    // 웹 컴포넌트의 페이지 상태는 로컬 state 이며 서버로 전송되지 않는다.
    const src = readFileSync(fileURLToPath(new URL("../../../apps/simulator-web/src/Kiosk.tsx", import.meta.url)), "utf-8");
    expect(src).toMatch(/보기 전용/);
    expect(src).not.toMatch(/api\.|fetch\(/);
  });
});

describe("FOUR_CARD_GRID — Evidence 기록", () => {
  it("resolvedSimulationTrace 에 page/slot 이 SYNTHETIC 으로 기록된다", async () => {
    const out = await processSubmission(buildSandboxSubmission(loadEnvironmentPack("sandbox")));
    const trace = out.evidence!.resolvedSimulationTrace ?? [];
    expect(trace.length).toBeGreaterThan(0);
    for (const t of trace) {
      expect(t.semanticTarget.kind).toBe("candidate");
      expect(t.resolvedTarget.navigationClassification).toBe("SYNTHETIC_MOCK");
      expect(t.resolvedTarget.template).toBe("FOUR_CARD_GRID");
      expect(t.resolvedTarget.pageIndex).toBeGreaterThanOrEqual(0);
      expect(t.resolvedTarget.slotIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it("Evidence 에 실제 좌표나 디바이스 컨트롤 ID 가 없다", async () => {
    const out = await processSubmission(buildSandboxSubmission(loadEnvironmentPack("sandbox")));
    const json = JSON.stringify(out.evidence!.resolvedSimulationTrace);
    expect(json).not.toMatch(/automationId|coordinate|"x":|"y":|UPRLite/i);
  });
});
