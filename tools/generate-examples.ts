import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvironmentPack } from "../apps/simulation-api/src/loader";
import { validateSubmission } from "../apps/simulation-api/src/validate";
import { buildSandboxSubmission } from "../tests/public/sandbox/sandbox-plan-builder";

const ROOT = process.cwd();
const pack = loadEnvironmentPack("sandbox");
const base = buildSandboxSubmission(pack);

const v = validateSubmission(pack, base);
console.log("sandbox base valid:", v.valid, JSON.stringify(v.errors));

const w = (dir: string, name: string, obj: unknown) =>
  writeFileSync(path.join(ROOT, "examples", dir, name), JSON.stringify(obj, null, 2) + "\n");

w("submission-format-example", "sandbox.json", base);

const clone = () => JSON.parse(JSON.stringify(base));
const boundary = pack.manifest.reviewBoundaryState;

let s = clone(); s.userDecision = { approved: false, decision: "REJECT" };
w("invalid-submissions", "user-not-approved.json", s);

s = clone(); s.executionPlan.actions.push({ actionIndex: s.executionPlan.actions.length, action: "select_payment", target: { kind: "review", id: boundary }, expectedBeforeState: boundary, expectedAfterState: boundary });
w("invalid-submissions", "payment-action.json", s);

s = clone(); s.recommendation.recommendedCandidateId = "SANDBOX-999";
w("invalid-submissions", "unknown-candidate.json", s);

s = clone(); const un = pack.candidates.find((c) => !c.available)!;
s.recommendation.recommendedCandidateId = un.candidateId;
s.recommendation.excludedCandidates = [];
for (const a of s.executionPlan.actions) if (a.target.kind === "candidate") a.target.id = un.candidateId;
w("invalid-submissions", "unavailable-candidate.json", s);

s = clone(); s.executionPlan.actions[1].expectedAfterState = "WRONG_STATE";
w("invalid-submissions", "state-mismatch.json", s);

s = clone(); s.executionPlan.actions = s.executionPlan.actions.slice(0, 2);
w("invalid-submissions", "incomplete-plan.json", s);

s = clone(); s.executionPlan.actions = s.executionPlan.actions.filter((a: any) => a.action !== pack.manifest.requiredVerifierAction).map((a: any, i: number) => ({ ...a, actionIndex: i }));
w("invalid-submissions", "missing-verifier.json", s);

s = clone(); s.executionPlan.actualDeviceCommandSent = true;
w("invalid-submissions", "actual-device-command-true.json", s);

s = clone(); const cand = s.executionPlan.actions.find((a: any) => a.target.kind === "candidate");
s.executionPlan.actions.push({ actionIndex: s.executionPlan.actions.length, action: cand.action, target: { kind: "candidate", id: "SANDBOX-002" }, expectedBeforeState: cand.expectedBeforeState, expectedAfterState: cand.expectedAfterState });
w("invalid-submissions", "coordinate-or-duplicate-selection.json", s);

console.log("examples written");
