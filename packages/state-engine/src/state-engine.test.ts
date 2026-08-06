import { describe, it, expect } from "vitest";
import type { EnvironmentPack } from "@kiobridge/contracts";
import { applyAction, isTargetKindAllowed } from "./index";

const pack = {
  manifest: {
    environmentId: "test",
    states: ["A", "B", "STOP"],
    initialState: "A",
    reviewBoundaryState: "B",
    requiredVerifierAction: "verify_result",
    terminalState: "STOP",
    allowedActions: ["go"],
    forbiddenActions: ["select_payment"],
  },
  transitions: [{ from: "A", action: "go", to: "B" }],
  screens: [
    { state: "A", title: "A", targetKinds: ["candidate", "option"], progress: 0.5 },
    { state: "B", title: "B", targetKinds: ["review"], progress: 1 },
  ],
  candidates: [{ candidateId: "C1", name: "후보1", domain: "test", available: true, dataClassification: "SYNTHETIC_MOCK" }],
  optionGroups: [{ groupId: "SIZE", label: "크기", required: true, options: [{ id: "SMALL", label: "작게" }] }],
} as unknown as EnvironmentPack;

const candidate = { kind: "candidate", id: "C1" };

describe("state-engine applyAction (semantic targets)", () => {
  it("정상 전환", () => {
    const r = applyAction(pack, { currentState: "A", action: "go", target: candidate, expectedBeforeState: "A", expectedAfterState: "B" });
    expect(r.ok).toBe(true);
    expect(r.nextState).toBe("B");
  });

  it("UNKNOWN_STATE", () => {
    expect(applyAction(pack, { currentState: "ZZZ", action: "go" }).errorCode).toBe("UNKNOWN_STATE");
  });

  it("FORBIDDEN_ACTION", () => {
    expect(applyAction(pack, { currentState: "A", action: "select_payment" }).errorCode).toBe("FORBIDDEN_ACTION");
  });

  it("INVALID_TRANSITION", () => {
    expect(applyAction(pack, { currentState: "B", action: "go" }).errorCode).toBe("INVALID_TRANSITION");
  });

  it("STATE_MISMATCH (expectedAfter 불일치)", () => {
    expect(applyAction(pack, { currentState: "A", action: "go", expectedAfterState: "WRONG" }).errorCode).toBe("STATE_MISMATCH");
  });

  it("TARGET_NOT_RESOLVABLE — 존재하지 않는 후보", () => {
    const r = applyAction(pack, { currentState: "A", action: "go", target: { kind: "candidate", id: "NOPE" } });
    expect(r.errorCode).toBe("TARGET_NOT_RESOLVABLE");
  });

  it("TARGET_KIND_NOT_ALLOWED — 화면에서 선택할 수 없는 종류", () => {
    const r = applyAction(pack, { currentState: "A", action: "go", target: { kind: "review", id: "B" } });
    expect(r.errorCode).toBe("TARGET_KIND_NOT_ALLOWED");
  });

  it("옵션 타깃은 groupId 로 해석된다", () => {
    expect(applyAction(pack, { currentState: "A", action: "go", target: { kind: "option", groupId: "SIZE", id: "SMALL" } }).ok).toBe(true);
    expect(applyAction(pack, { currentState: "A", action: "go", target: { kind: "option", groupId: "SIZE", id: "HUGE" } }).errorCode).toBe("TARGET_NOT_RESOLVABLE");
  });

  it("isTargetKindAllowed", () => {
    expect(isTargetKindAllowed(pack, "A", "candidate")).toBe(true);
    expect(isTargetKindAllowed(pack, "A", "review")).toBe(false);
  });
});
