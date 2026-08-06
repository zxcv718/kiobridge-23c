/**
 * KioBridge official Simulation API (:4000).
 *
 * Serves environments & public fixtures, creates sessions, RECEIVES participant
 * submissions, validates (schema + semantics + full dry-run), replays ONLY the
 * submitted plan on the digital twin, and emits server-authoritative Evidence.
 *
 * It does NOT generate profiles/recommendations/decisions/plans, call any
 * participant adapter, or fall back to a local recommender. SIMULATION_ONLY.
 */
import express from "express";
import path from "node:path";
import cors from "cors";
import type { ParticipantSubmission, SafetyErrorCode } from "@kiobridge/contracts";
import { FIXED_PRINCIPLES } from "@kiobridge/contracts";
import { hashSubmission, runSubmission } from "@kiobridge/evaluator";
import { SimulationDriver } from "@kiobridge/simulation-driver";
import { contractCapabilities, convertLegacyV4, validateProfile, validateSessionContext, validateUnknownPolicy } from "@kiobridge/profile-contract";
import { loadAllPacks, loadEnvironmentPack, toPublicFixture } from "./loader.js";
import { readSchema, readVocabulary, validateContractInput, validateSubmission } from "./validate.js";
import { clearRun, createSession, getRun, getSession, setRun, updateSession } from "./store.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PLATFORM_VERSION = "5.1.4";
const PACKS = loadAllPacks();
const packOf = (id: string) => PACKS[id] ?? loadEnvironmentPack(id);

/** Startup/liveness probe used by the start scripts and the web status badge. */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "kiobridge-simulation-api",
    productVersion: PLATFORM_VERSION,
    version: PLATFORM_VERSION,
    inputContractVersion: contractCapabilities().defaultInputContractVersion,
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true, status: "ok", service: "kiobridge-simulation-api",
    productVersion: PLATFORM_VERSION, version: PLATFORM_VERSION,
    inputContractVersion: contractCapabilities().defaultInputContractVersion,
    ...FIXED_PRINCIPLES, adapterDependency: false, recommenderFallback: false,
  });
});

// --- Contract negotiation (§13/§22) ------------------------------------------
app.get("/api/v1/contracts", (_req, res) => res.json(contractCapabilities()));

app.get("/api/v1/contracts/profile", (_req, res) => {
  res.json({ ...contractCapabilities(), schema: readSchema("canonical-profile.schema.json") });
});

app.get("/api/v1/environments/:environmentId/input-contract", (req, res) => {
  const pack = PACKS[req.params.environmentId];
  if (!pack) return res.status(404).json({ error: `Unknown environment: ${req.params.environmentId}` });
  const ic = pack.manifest.inputContract;
  res.json({
    environmentId: pack.manifest.environmentId,
    inputContractVersion: ic.version,
    schemaUrl: `/api/v1/schemas/${path.basename(ic.schemaRef)}`,
    vocabularyUrl: `/api/v1/vocabularies/${pack.manifest.environmentId}`,
    supportedProfileContractVersions: pack.manifest.supportedProfileContractVersions,
    requiredFields: ["intent", "facts", "preferences", "hardConstraints", "capabilities"],
    optionalFields: ["fieldMetadata"],
  });
});

app.get("/api/v1/vocabularies/:environmentId", (req, res) => {
  const vocab = readVocabulary(req.params.environmentId);
  if (!vocab) return res.status(404).json({ error: `Unknown vocabulary: ${req.params.environmentId}` });
  res.json({ common: readSchema("common.vocabulary.json"), accessibility: readSchema("accessibility.vocabulary.json"), environment: vocab });
});

app.get("/api/v1/schemas/:schemaName", (req, res) => {
  const schema = readSchema(req.params.schemaName);
  if (!schema) return res.status(404).json({ error: `Unknown schema: ${req.params.schemaName}` });
  res.json(schema);
});

app.post("/api/v1/contracts/input/validate", (req, res) => {
  res.json(validateContractInput(req.body?.environmentId, req.body));
});

app.post("/api/v1/contracts/profile/validate", (req, res) => {
  const errors = validateProfile(req.body?.profile ?? req.body);
  res.json({ valid: errors.length === 0, contractVersion: "1.0.0", errors });
});

app.post("/api/v1/contracts/session-context/validate", (req, res) => {
  const environmentId = req.body?.environmentId ?? "";
  const ctx = req.body?.sessionContext ?? req.body;
  const errors = [...validateSessionContext(environmentId, ctx), ...validateUnknownPolicy(environmentId, ctx)];
  res.json({ valid: errors.length === 0, contractVersion: "1.0.0", errors });
});

/** Legacy v4 → canonical conversion (development aid; NOT used for evaluation). */
app.post("/api/v1/contracts/legacy/convert", (req, res) => {
  const environmentId = req.body?.environmentId ?? "";
  const legacy = req.body?.profile ?? {};
  res.json(convertLegacyV4(legacy, environmentId, req.body?.teamId ?? "LEGACY"));
});

// --- Environments & public fixtures -----------------------------------------
app.get("/api/v1/environments", (_req, res) => {
  res.json(Object.values(PACKS).map((p) => ({
    environmentId: p.manifest.environmentId, name: p.manifest.name, description: p.manifest.description,
    summary: p.manifest.summary, testFocus: p.manifest.testFocus,
    dataClassification: p.manifest.dataClassification, fixtureVersion: p.manifest.fixtureVersion,
  })));
});

app.get("/api/v1/environments/:id/fixture", (req, res) => {
  const pack = PACKS[req.params.id];
  if (!pack) return res.status(404).json({ error: `Unknown environment: ${req.params.id}` });
  res.json(toPublicFixture(pack));
});

// --- Sessions ---------------------------------------------------------------
app.post("/api/v1/sessions", (req, res) => {
  const environmentId = req.body?.environmentId;
  if (!environmentId || !PACKS[environmentId]) return res.status(400).json({ error: `environmentId 가 유효하지 않습니다: ${environmentId}` });
  res.status(201).json(createSession(PACKS[environmentId]));
});

app.get("/api/v1/sessions/:sessionId", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
  res.json(session);
});

// --- Submission (participant -> platform) -----------------------------------
function acceptSubmission(req: express.Request, res: express.Response) {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
  const submission = req.body as ParticipantSubmission;
  if (!submission || typeof submission !== "object" || !submission.executionPlan) {
    return res.status(400).json({ error: "제출 본문이 올바르지 않습니다 (ParticipantSubmission)." });
  }
  session.submission = submission;
  session.submissionSeq = (session.submissionSeq ?? 0) + 1;
  session.submissionStatus = "SUBMITTED";
  session.validationStatus = "NOT_STARTED";
  session.executionStatus = "NOT_STARTED";
  session.validation = undefined;
  session.evidence = undefined;
  clearRun(session.sessionId);
  updateSession(session);
  res.status(202).json(session);
}
app.post("/api/v1/sessions/:sessionId/submission", acceptSubmission);
app.post("/api/v1/sessions/:sessionId/submission-file", acceptSubmission);

/**
 * Public contracts a team can fetch to self-check before submitting.
 * These declare HOW compatibility is judged; they never reveal which candidate
 * is the right answer.
 */
app.get("/api/v1/environments/:environmentId/compatibility-rules", (req, res) => {
  try {
    const pack = packOf(req.params.environmentId);
    res.json(pack.compatibilityRules);
  } catch {
    res.status(404).json({ error: `알 수 없는 환경: ${req.params.environmentId}` });
  }
});

app.get("/api/v1/environments/:environmentId/review-mapping", (req, res) => {
  try {
    const pack = packOf(req.params.environmentId);
    res.json(pack.reviewMapping);
  } catch {
    res.status(404).json({ error: `알 수 없는 환경: ${req.params.environmentId}` });
  }
});

// --- Validate ---------------------------------------------------------------
app.post("/api/v1/sessions/:sessionId/validate", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
  if (!session.submission) return res.status(409).json({ error: "제출물이 없습니다 (submissionStatus=WAITING)." });

  session.validationStatus = "VALIDATING";
  session.submissionStatus = "VALIDATING";
  const validation = validateSubmission(packOf(session.environmentId), session.submission);
  session.validation = validation;
  session.validationStatus = validation.valid ? "VALIDATED" : "VALIDATION_FAILED";
  session.submissionStatus = validation.valid ? "READY_TO_RUN" : "VALIDATION_FAILED";
  updateSession(session);
  res.json(validation);
});

// --- Execute (replay validated plan on the digital twin) --------------------
async function doExecute(sessionId: string, injectError?: SafetyErrorCode) {
  const session = getSession(sessionId)!;
  const pack = packOf(session.environmentId);
  const validation = validateSubmission(pack, session.submission!);
  session.validation = validation;
  if (!validation.valid) {
    session.validationStatus = "VALIDATION_FAILED";
    session.submissionStatus = "VALIDATION_FAILED";
    session.executionStatus = "NOT_STARTED";
    updateSession(session);
    return { ok: false as const, validation };
  }
  session.validationStatus = "VALIDATED";
  session.submissionStatus = "RUNNING";
  session.executionStatus = "RUNNING";
  // The official run always uses the Simulation Driver in this repository.
  const { run, evidence } = await runSubmission(pack, session.submission!, {
    injectError, submissionValid: true, validationErrors: validation.errors,
    validationWarnings: validation.warnings ?? [], sessionId,
    driver: new SimulationDriver(),
  });
  setRun(sessionId, run);
  session.evidence = evidence;
  session.executionStatus = evidence.result === "PASS" ? "PASSED" : run.stopped ? "STOPPED" : "FAILED";
  session.submissionStatus = evidence.result === "PASS" ? "PASSED" : run.stopped ? "STOPPED" : "FAILED";
  updateSession(session);
  return { ok: true as const, run, evidence };
}

app.post("/api/v1/sessions/:sessionId/execute", async (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
  if (!session.submission) return res.status(409).json({ error: "제출물이 없습니다." });
  const result = await doExecute(session.sessionId, req.body?.injectError);
  if (!result.ok) return res.json({ valid: false, validation: result.validation });
  res.json({ valid: true, run: result.run, evidence: result.evidence });
});

// --- Error injection (operator/participant) ---------------------------------
app.post("/api/v1/sessions/:sessionId/error-injection", async (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
  if (!session.submission) return res.status(409).json({ error: "제출물이 없습니다." });
  const code = req.body?.code as SafetyErrorCode | undefined;
  if (!code) return res.status(400).json({ error: "code (SafetyErrorCode) 가 필요합니다." });
  const result = await doExecute(session.sessionId, code);
  if (!result.ok) return res.json({ valid: false, validation: result.validation });
  res.json({ valid: true, injected: code, run: result.run, evidence: result.evidence });
});

// --- Run progress (server-authoritative execution history) ------------------
app.get("/api/v1/sessions/:sessionId/run", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
  const run = getRun(req.params.sessionId);
  if (!run) return res.status(409).json({ error: "아직 실행되지 않았습니다." });
  res.json({
    executionStatus: session.executionStatus, driverId: run.driverId,
    executedActions: run.executedActions, events: run.events,
    stateHistory: run.stateHistory, lastBusinessState: run.lastBusinessState,
    safetyChecks: run.safetyChecks, stopType: run.stopType, stopReason: run.stopReason,
    boundaryReached: run.boundaryReached, requiredVerifierExecuted: run.requiredVerifierExecuted,
    reviewSnapshot: run.reviewSnapshot, finalUiState: run.finalUiState,
  });
});

app.get("/api/v1/sessions/:sessionId/evidence", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
  if (!session.evidence) return res.status(409).json({ error: "아직 실행되지 않았습니다 (evidence 없음)." });
  res.json(session.evidence);
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[simulation-api] SIMULATION_ONLY listening on http://localhost:${PORT} (no adapter, no fallback)`);
});

export { hashSubmission };
