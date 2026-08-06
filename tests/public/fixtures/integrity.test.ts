import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Candidate, ScreenDef, Transition } from "@kiobridge/contracts";
import { loadEnvironmentPack } from "../../shared";
import { discoverEnvironmentIds } from "../../../apps/simulation-api/src/loader";

const ENV_IDS = discoverEnvironmentIds();
const ENV_DIR = new URL("../../../environments/", import.meta.url).pathname;

describe("환경 데이터팩 정합성 (driver-agnostic)", () => {
  it("환경은 파일시스템에서 자동 발견된다", () => {
    expect(ENV_IDS).toEqual(expect.arrayContaining(["chicken-store", "hospital", "public-office", "sandbox"]));
  });

  for (const id of ENV_IDS) {
    describe(id, () => {
      const pack = loadEnvironmentPack(id);

      it("manifest 경계/verifier 필드", () => {
        expect(pack.manifest.environmentId).toBe(id);
        expect(pack.manifest.states).toContain(pack.manifest.initialState);
        expect(pack.manifest.terminalState).toBe("STOP");
        expect(pack.manifest.states).toContain(pack.manifest.reviewBoundaryState);
        expect(pack.manifest.requiredVerifierAction).toMatch(/^verify_/);
      });

      it("verifier 는 읽기전용이며 경계 상태를 벗어나지 않는다", () => {
        const t = pack.transitions.find((tr: Transition) => tr.action === pack.manifest.requiredVerifierAction);
        expect(t).toBeTruthy();
        expect(t!.from).toBe(pack.manifest.reviewBoundaryState);
        expect(t!.to).toBe(pack.manifest.reviewBoundaryState);
        expect(t!.guards ?? []).toContain("readOnly");
      });

      it("transitions 의 from/to 는 정의된 상태 + 허용 Action", () => {
        const states = new Set(pack.manifest.states);
        for (const t of pack.transitions as Transition[]) {
          expect(states.has(t.from)).toBe(true);
          expect(states.has(t.to)).toBe(true);
          expect(pack.manifest.allowedActions).toContain(t.action);
        }
      });

      it("screens 는 상태별 targetKinds 를 가진다 (컨트롤 ID 없음)", () => {
        for (const s of pack.screens as ScreenDef[]) {
          expect(pack.manifest.states).toContain(s.state);
          expect(Array.isArray(s.targetKinds)).toBe(true);
          expect(s).not.toHaveProperty("controls");
        }
      });

      it("candidates 는 도메인 일치 + SYNTHETIC_MOCK", () => {
        expect(pack.candidates.length).toBeGreaterThan(0);
        for (const c of pack.candidates as Candidate[]) {
          expect(c.domain).toBe(id);
          expect(c.dataClassification).toBe("SYNTHETIC_MOCK");
        }
      });

      it("옵션 그룹의 모든 값은 고유 id 를 가진다", () => {
        for (const g of pack.optionGroups) {
          const ids = g.options.map((o) => o.id);
          expect(new Set(ids).size).toBe(ids.length);
        }
      });

      it("candidate.supportedOptions 는 실재하는 그룹/값만 참조한다", () => {
        for (const c of pack.candidates) {
          for (const [groupId, values] of Object.entries(c.supportedOptions ?? {})) {
            const g = pack.optionGroups.find((x) => x.groupId === groupId);
            expect(g, `${c.candidateId}: 그룹 ${groupId}`).toBeTruthy();
            for (const v of values) expect(g!.options.some((o) => o.id === v), `${groupId}=${v}`).toBe(true);
          }
        }
      });

      it("환경팩은 프로필 데이터를 포함하지 않는다 (역할 분리)", () => {
        expect(pack).not.toHaveProperty("profiles");
        expect(existsSync(path.join(ENV_DIR, id, "profiles"))).toBe(false);
      });

      it("금지 Action 과 허용 Action 은 겹치지 않음", () => {
        const allowed = new Set(pack.manifest.allowedActions);
        for (const f of pack.manifest.forbiddenActions) expect(allowed.has(f)).toBe(false);
      });

      it("simulation binding 은 모든 상태(STOP 제외)에 템플릿을 정의한다", () => {
        for (const s of pack.manifest.states.filter((x) => x !== "STOP")) {
          expect(pack.bindings.simulation.screens[s], `${s} 템플릿`).toBeTruthy();
        }
      });

      it("uprlite binding 은 아직 PENDING_REAL_DEVICE 이다", () => {
        expect(pack.bindings.uprlite.driver).toBe("UPRLITE");
        expect(pack.bindings.uprlite.status).toBe("PENDING_REAL_DEVICE");
      });

      it("공통 파일에는 좌표/UIA 식별자가 없다 (driver-agnostic)", () => {
        const common = JSON.stringify({
          manifest: pack.manifest, screens: pack.screens, candidates: pack.candidates,
          optionGroups: pack.optionGroups, transitions: pack.transitions, safetyRules: pack.safetyRules,
        });
        expect(common).not.toMatch(/automationId/);
        expect(common).not.toMatch(/coordinate/);
      });
    });
  }
});
