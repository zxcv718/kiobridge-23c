import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, type EnvSummary, type ExecuteResponse } from "./api";
import { DataBadge, OutcomeBadge, SimBadge, SubmissionBadge } from "./ui";
import { Kiosk } from "./Kiosk";
import { Playground } from "./Playground";
import type {
  Evidence, ParticipantSubmission, PublicFixture, RunResultLike, Session, SimulationUiState, ValidationResult,
} from "./types";

import sandboxExample from "../../../examples/submission-format-example/sandbox.json";

/** Only the sandbox (non-evaluated) environment ships a complete example plan. */
const EXAMPLES: Record<string, ParticipantSubmission> = {
  sandbox: sandboxExample as unknown as ParticipantSubmission,
};

type Step = "env" | "session" | "review" | "twin" | "evidence" | "playground";
const STEP_LABELS: Record<Exclude<Step, "playground">, string> = {
  env: "1. 환경 선택", session: "2. 세션 · 제출 대기", review: "3. 제출 검토 · 검증",
  twin: "4. 디지털 트윈 재생", evidence: "5. Evidence",
};
const INJECT_OPTIONS = ["UNKNOWN_STATE", "FORBIDDEN_ACTION", "USER_NOT_APPROVED", "CANDIDATE_UNAVAILABLE", "PAYMENT_ACTION_ATTEMPT", "STATE_MISMATCH", "MISSING_VERIFIER"];

export function App() {
  const [step, setStep] = useState<Step>("env");
  const [envs, setEnvs] = useState<EnvSummary[]>([]);
  const [envState, setEnvState] = useState<"loading" | "ready" | "offline">("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [fixture, setFixture] = useState<PublicFixture | null>(null);
  const [submission, setSubmission] = useState<ParticipantSubmission | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [run, setRun] = useState<RunResultLike | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState<"connecting" | "connected" | "failed">("connecting");
  const [a11y, setA11y] = useState({ largeText: false, highContrast: false, easyRead: false });

  useEffect(() => {
    const r = document.documentElement;
    r.classList.toggle("large-text", a11y.largeText);
    r.classList.toggle("high-contrast", a11y.highContrast);
    r.classList.toggle("easy-read", a11y.easyRead);
  }, [a11y]);

  async function loadEnvs() {
    setEnvState("loading");
    try { setEnvs(await api.environments()); setEnvState("ready"); }
    catch { setEnvState("offline"); }
  }
  useEffect(() => { loadEnvs(); }, []);

  // API 연결 상태 표시 (연결됨 / 연결 대기 / 연결 실패)
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      const ok = await api.health();
      if (cancelled) return;
      if (ok) { setApiStatus("connected"); return; }
      attempts += 1;
      setApiStatus(attempts >= 5 ? "failed" : "connecting");
      setTimeout(tick, 2000);
    };
    tick();
    return () => { cancelled = true; };
  }, []);

  // Auto-detect participant submissions. This keeps polling AFTER the first
  // one arrives: a second submission must replace what is on screen, otherwise
  // stale validation/run/evidence would sit next to fresh input.
  useEffect(() => {
    if (!session || step === "env" || step === "playground") return;
    const seenSeq = session.submissionSeq ?? 0;
    const id = window.setInterval(async () => {
      try {
        const s = await api.getSession(session.sessionId);
        const seq = s.submissionSeq ?? 0;
        if (!s.submission || s.submissionStatus === "WAITING") return;
        if (step === "session") {
          setSession(s); setSubmission(s.submission); setValidation(s.validation ?? null); setStep("review");
          return;
        }
        // Already past the waiting screen: only a NEW submission matters.
        if (seq > seenSeq) {
          setSession(s); setSubmission(s.submission);
          setValidation(null); setRun(null); setEvidence(null);
          setStep("review");
        }
      } catch { /* transient network error — the next tick retries */ }
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, session?.sessionId, session?.submissionSeq]);

  async function chooseEnv(id: string) {
    setBusy(true); setError(null);
    try {
      const [s, fx] = await Promise.all([api.createSession(id), api.fixture(id)]);
      setSession(s); setFixture(fx);
      setSubmission(null); setValidation(null); setRun(null); setEvidence(null);
      setStep("session");
    } catch (e) { setError(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }

  async function doSubmit(sub: ParticipantSubmission) {
    if (!session) return;
    setBusy(true); setError(null);
    try {
      const s = await api.submit(session.sessionId, sub);
      setSession(s); setSubmission(sub); setValidation(null);
      setStep("review");
    } catch (e) { setError(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }

  async function doValidate(): Promise<ValidationResult | null> {
    if (!session) return null;
    setBusy(true); setError(null);
    try { const v = await api.validate(session.sessionId); setValidation(v); return v; }
    catch (e) { setError(String((e as Error).message ?? e)); return null; }
    finally { setBusy(false); }
  }

  async function doExecute(injectError?: string) {
    if (!session) return;
    setBusy(true); setError(null);
    try {
      const res: ExecuteResponse = injectError
        ? await api.injectError(session.sessionId, injectError)
        : await api.execute(session.sessionId);
      if (!res.valid) { setValidation(res.validation ?? null); setStep("review"); return; }
      setRun(res.run ?? null); setEvidence(res.evidence ?? null); setStep("twin");
    } catch (e) { setError(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }

  const order: Step[] = ["env", "session", "review", "twin", "evidence"];
  const showSteps = step !== "playground";
  const stepIndex = order.indexOf(step);

  return (
    <div className="app">
      <SimBadge />
      <header className="topbar">
        <h1>KioBridge Simulation Platform <span className="badge sim">v5</span></h1>
        <span className={`badge ${apiStatus === "connected" ? "pass" : apiStatus === "failed" ? "stop" : "pending"}`}
          role="status" aria-live="polite">
          <span className="dot" style={{ background: "currentColor" }} aria-hidden />
          {apiStatus === "connected" ? "API 연결됨" : apiStatus === "failed" ? "API 연결 실패" : "API 연결 대기"}
        </span>
        <div className="spacer" />
        <div className="a11y-controls" role="group" aria-label="접근성 설정">
          <button aria-pressed={a11y.largeText} onClick={() => setA11y((s) => ({ ...s, largeText: !s.largeText }))}>큰 글씨</button>
          <button aria-pressed={a11y.highContrast} onClick={() => setA11y((s) => ({ ...s, highContrast: !s.highContrast }))}>고대비</button>
          <button aria-pressed={a11y.easyRead} onClick={() => setA11y((s) => ({ ...s, easyRead: !s.easyRead }))}>쉬운 문장</button>
          <button onClick={() => setStep(step === "playground" ? "env" : "playground")}>Schema Playground</button>
        </div>
      </header>

      {showSteps && <nav className="steps" aria-label="진행 단계">
        {order.map((s, i) => <span key={s} className={`chip ${s === step ? "active" : i < stepIndex ? "done" : ""}`}>{STEP_LABELS[s as Exclude<Step, "playground">]}</span>)}
      </nav>}
      <div aria-live="polite" className="sr-only">{showSteps ? `현재 단계: ${STEP_LABELS[step as Exclude<Step, "playground">]}` : "Schema Playground"}</div>

      {step === "env" ? <StartGuide onPlayground={() => setStep("playground")} /> : (
        <div className="panel" style={{ padding: "0.6rem 0.9rem", borderColor: "var(--purple)" }}>
          <strong>이 화면은 공식 시뮬레이터입니다.</strong>{" "}
          <span className="verbose muted">추천을 생성하지 않습니다. 참가팀이 제출한 결과를 서버가 검증·재생하고, 여기서는 서버 실행결과를 표시합니다.</span>
        </div>
      )}

      {error && <div className="alert stop" role="alert">오류: {error}</div>}

      {step === "playground" && <Playground envs={envs} onBack={() => setStep("env")} />}
      {step === "env" && <EnvironmentSelect envs={envs} onChoose={chooseEnv} busy={busy} envState={envState} onRetry={loadEnvs} />}
      {step === "session" && session && <SessionWaiting session={session} onSubmit={doSubmit} busy={busy} onBack={() => setStep("env")} example={EXAMPLES[session.environmentId]} />}
      {step === "review" && session && fixture && submission && (
        <SubmissionReview session={session} fixture={fixture} submission={submission} validation={validation}
          onValidate={doValidate} onRun={() => doExecute()} onBack={() => setStep("session")} busy={busy} />
      )}
      {step === "twin" && session && fixture && submission && run && (
        <DigitalTwin session={session} fixture={fixture} submission={submission} run={run}
          onEvidence={() => setStep("evidence")} onInject={doExecute} />
      )}
      {step === "evidence" && evidence && <EvidencePanel evidence={evidence} onBack={() => setStep("twin")} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
/** 첫 화면 안내 — 참가팀이 무엇을 만들고 무엇이 제공되는지. */
function StartGuide({ onPlayground }: { onPlayground: () => void }) {
  return (
    <section className="panel start-guide">
      <h2>KioBridge 공식 시뮬레이션 플랫폼</h2>
      <p><strong>KioBridge 공식 시뮬레이터는 참가팀 대신 프로필, 추천 또는 실행계획을 만들지 않습니다.</strong></p>
      <p className="verbose">
        참가팀은 <strong>키오스크를 새로 만드는 것이 아닙니다.</strong> 기존 키오스크를
        사용자에게 맞게 개인화하는 서비스를 만듭니다.
      </p>
      <p className="verbose">
        참가팀은 웹, 앱, 음성, AI 대화 등 자유로운 방식으로 사용자 정보를 수집하고,
        이를 <strong>Canonical Input Contract</strong> 로 변환해야 합니다.
      </p>
      <p className="verbose">
        참가팀이 만든 추천, 사용자 결정과 의미 기반 실행계획을 공식 API 로 제출하면,
        KioBridge 가 이를 <strong>가상 키오스크에서 실행</strong>하고
        계약, 상태 전환과 안전경계를 검증합니다.
      </p>

      <h3>진행 순서</h3>
      <ol className="start-steps">
        <li>계약과 Vocabulary 확인</li>
        <li>참가팀 서비스 개발</li>
        <li>Sandbox 연결 연습</li>
        <li>공식 환경 Fixture 조회</li>
        <li>참가팀 결과 제출</li>
        <li>Simulation Validation</li>
        <li>Evidence 확인</li>
        <li>최종 심사 제출</li>
      </ol>

      <h3>바로가기</h3>
      <div className="quick-links">
        <button className="primary" onClick={onPlayground}>Schema Playground</button>
        <a className="qlink" href="/README_FIRST.md" target="_blank" rel="noreferrer">10분 시작 가이드</a>
        <a className="qlink" href="/docs/WHAT_YOU_BUILD.md" target="_blank" rel="noreferrer">참가팀이 만들어야 할 것</a>
        <a className="qlink" href="/docs/WHAT_WE_PROVIDE.md" target="_blank" rel="noreferrer">KioBridge가 제공하는 것</a>
        <a className="qlink" href="/docs/API_CONTRACT.md" target="_blank" rel="noreferrer">API 문서</a>
        <a className="qlink" href="/docs/SESSION_CONTEXT_DICTIONARY.md" target="_blank" rel="noreferrer">데이터 사전</a>
        <a className="qlink" href="/participant-deliverables/00_START_HERE/PASS_SCOPE.md" target="_blank" rel="noreferrer">PASS 범위</a>
        <a className="qlink" href="/docs/SUBMISSION_GUIDE.md" target="_blank" rel="noreferrer">제출 가이드</a>
        <a className="qlink" href="/api/v1/contracts" target="_blank" rel="noreferrer">지원 계약 버전</a>
      </div>
      <p className="muted verbose" style={{ marginTop: "0.6rem" }}>
        연결 흐름을 처음 연습한다면 아래에서 <strong>연습용 Sandbox</strong> 환경을 선택하세요 (평가에 사용되지 않습니다).
      </p>
    </section>
  );
}

function EnvironmentSelect({ envs, onChoose, busy, envState, onRetry }: {
  envs: EnvSummary[]; onChoose: (id: string) => void; busy: boolean; envState: "loading" | "ready" | "offline"; onRetry: () => void;
}) {
  if (envState === "offline") return (
    <section className="panel">
      <h2>Simulation API 에 연결할 수 없습니다</h2>
      <div className="alert stop" role="alert"><p><strong>환경 데이터를 불러오지 못했습니다.</strong> Simulation API(:4000) 실행을 확인하세요.</p><pre className="json">npm run dev</pre></div>
      <button className="primary" onClick={onRetry}>다시 시도</button>
    </section>
  );
  return (
    <section className="panel">
      <h2>환경을 선택하세요</h2>
      <div className="grid cards">
        {envState === "loading" && <p className="muted">환경을 불러오는 중…</p>}
        {envs.map((e) => (
          <div key={e.environmentId} className="card">
            <div className="rec-top"><h3>{e.name}</h3><DataBadge value={e.dataClassification} /></div>
            <p className="muted">{e.description}</p>
            <p className="muted verbose"><strong>주요 테스트:</strong> {e.testFocus}</p>
            <div className="spacer" />
            <button className="primary" disabled={busy} onClick={() => onChoose(e.environmentId)}>세션 생성 →</button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
function SessionWaiting({ session, onSubmit, busy, onBack, example }: {
  session: Session; onSubmit: (s: ParticipantSubmission) => void; busy: boolean; onBack: () => void; example?: ParticipantSubmission;
}) {
  const [pasted, setPasted] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  function parseAndSubmit(text: string) {
    try { const obj = JSON.parse(text); setParseError(null); onSubmit(obj as ParticipantSubmission); }
    catch (e) { setParseError(`JSON 파싱 실패: ${(e as Error).message}`); }
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) f.text().then(parseAndSubmit); }

  return (
    <section className="panel">
      <h2>세션 · 제출 대기 <span className="badge pending">자동 감지 중…</span></h2>
      <dl className="kv">
        <dt>세션 ID</dt><dd className="mono">{session.sessionId}</dd>
        <dt>환경</dt><dd>{session.environmentId}</dd>
        <dt>fixtureVersion</dt><dd className="mono">{session.fixtureVersion}</dd>
        <dt>initialState</dt><dd className="mono">{session.initialState}</dd>
        <dt>validationMode</dt><dd className="mono">{session.validationMode}</dd>
        <dt>현재 상태</dt><dd><span className="badge pending">{session.submissionStatus}</span></dd>
        <dt>제출 주소</dt><dd className="mono">{session.submissionEndpoint}</dd>
      </dl>
      <p className="verbose muted" style={{ marginTop: "0.8rem" }}>
        참가팀 서비스가 위 주소로 제출하면 이 화면이 <strong>자동으로 감지</strong>하여 다음 단계로 넘어갑니다
        (1초 간격 폴링). 운영/시연용으로 아래에서 직접 제출할 수도 있습니다.
      </p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="card">
          <h3>파일 업로드</h3>
          <label className="field"><span>Submission JSON 파일</span><input type="file" accept="application/json,.json" onChange={onFile} /></label>
          {example && <button onClick={() => onSubmit(example)} disabled={busy}>형식 예제 제출 불러오기</button>}
        </div>
        <div className="card">
          <h3>JSON 붙여넣기</h3>
          <label className="field"><span className="sr-only">Submission JSON</span>
            <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{ "submissionVersion": "1.0", ... }' style={{ width: "100%", fontFamily: "monospace" }} /></label>
          <button className="primary" disabled={busy || !pasted.trim()} onClick={() => parseAndSubmit(pasted)}>제출</button>
        </div>
      </div>
      {parseError && <div className="alert stop">{parseError}</div>}
      <div className="toolbar"><button className="ghost" onClick={onBack}>← 환경 다시 선택</button></div>
    </section>
  );
}

// ---------------------------------------------------------------------------
function SubmissionReview({ session, fixture, submission, validation, onValidate, onRun, onBack, busy }: {
  session: Session; fixture: PublicFixture; submission: ParticipantSubmission; validation: ValidationResult | null;
  onValidate: () => void; onRun: () => void; onBack: () => void; busy: boolean;
}) {
  const byId = useMemo(() => Object.fromEntries(fixture.candidates.map((c) => [c.candidateId, c])), [fixture]);
  const rec = submission.recommendation;
  const recName = rec.recommendedCandidateId ? byId[rec.recommendedCandidateId]?.name ?? rec.recommendedCandidateId : "없음";
  const exts = Object.keys(submission.extensions ?? {});

  return (
    <>
      <section className="panel">
        <h2>제출 검토 <SubmissionBadge /></h2>
        <p className="verbose muted">아래 값은 참가팀이 제출한 결과이며 공식 시뮬레이터에서 수정할 수 없습니다 (읽기 전용).</p>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div className="card"><h3>프로필</h3><dl className="kv">
            <dt>teamId</dt><dd className="mono">{submission.teamId}</dd>
            <dt>profileId</dt><dd className="mono">{submission.profile.profileId}</dd>
            <dt>구분</dt><dd><DataBadge value="SYNTHETIC_PROFILE" /></dd>
            <dt>확장</dt><dd className="mono">{exts.length ? exts.join(", ") : "—"}</dd>
          </dl></div>
          <div className="card"><h3>추천</h3><dl className="kv">
            <dt>1순위</dt><dd>{recName} <span className="mono">({rec.recommendedCandidateId ?? "null"})</span></dd>
            <dt>대체</dt><dd className="mono">{rec.alternativeCandidateIds.join(", ") || "—"}</dd>
            <dt>신뢰도</dt><dd>{Math.round((rec.confidence ?? 0) * 100)}%</dd>
          </dl>
            {rec.recommendationReasons.length > 0 && <ul className="reasons">{rec.recommendationReasons.map((r, i) => <li key={i}>✓ {r}</li>)}</ul>}
            {rec.excludedCandidates.length > 0 && <ul className="reasons excluded">{rec.excludedCandidates.map((x) => <li key={x.candidateId}>✕ {byId[x.candidateId]?.name ?? x.candidateId} — {x.explanation ?? x.reasonText ?? x.reasonCode} <span className="mono">({x.reasonCode})</span></li>)}</ul>}
          </div>
          <div className="card"><h3>사용자 결정</h3><dl className="kv"><dt>approved</dt><dd>{String(submission.userDecision.approved)}</dd><dt>decision</dt><dd className="mono">{submission.userDecision.decision}</dd></dl></div>
          <div className="card"><h3>실행계획</h3><dl className="kv"><dt>Action 수</dt><dd>{submission.executionPlan.actions.length}</dd><dt>actualDeviceCommandSent</dt><dd className="mono">{String(submission.executionPlan.actualDeviceCommandSent)}</dd><dt>validationMode</dt><dd className="mono">{submission.executionPlan.validationMode}</dd></dl></div>
        </div>
      </section>
      <section className="panel">
        <h2>규격 · 안전 사전검사 (서버 dry-run)</h2>
        <div className="toolbar">
          <button onClick={onValidate} disabled={busy}>검증 실행</button>
          <button className="primary" onClick={onRun} disabled={busy || !validation?.valid}
            title={validation?.valid ? "" : "먼저 검증을 통과해야 실행할 수 있습니다."}>디지털 트윈 재생 →</button>
          <button className="ghost" onClick={onBack}>← 제출 다시</button>
        </div>
        {!validation && (
          <div className="alert pending-note" role="status" style={{ marginTop: "0.6rem" }}>
            먼저 <strong>검증 실행</strong>을 눌러 제출물을 검사하세요. 검증을 통과해야 디지털 트윈을 실행할 수 있습니다.
          </div>
        )}
        {validation && (
          <div style={{ marginTop: "0.6rem" }}>
            {validation.valid ? <div className="alert ok">검증 통과 — 서버가 실행계획을 트윈에서 재생할 수 있습니다.</div>
              : <div className="alert stop" role="alert"><strong>검증 실패 ({validation.errors.length}건) — 실행할 수 없습니다</strong>
                <ul className="reasons">{validation.errors.map((e, i) => (
                  <li key={i}>
                    <span className="mono">{e.code}</span>{e.actionIndex != null ? ` [#${e.actionIndex}]` : ""}{" "}
                    <span className="mono">{e.path}</span>: {e.message}
                    {e.ruleId && <> <span className="muted">(규칙 {e.ruleId})</span></>}
                  </li>
                ))}</ul></div>}

            {/* Two stages answer different questions, so they are reported
                separately: a clean candidate with a wrong pressed option is a
                very different problem from an unsuitable candidate. */}
            {validation.compatibility && validation.compatibility.length > 0 && (
              <div className="compat-scopes" data-testid="compatibility-scopes">
                {(["CANDIDATE", "EXECUTION_CHOICE"] as const).map((scope) => {
                  const rules = validation.compatibility!.filter((r) => (r.evaluationScope ?? "CANDIDATE") === scope);
                  if (rules.length === 0) return null;
                  const fails = rules.filter((r) => r.result === "FAIL" || r.result === "RECONFIRM").length;
                  const warns = rules.filter((r) => r.result === "WARN").length;
                  const label = scope === "CANDIDATE" ? "후보 호환성" : "실행 선택 호환성";
                  const state = fails > 0 ? "stop" : warns > 0 ? "pending" : "pass";
                  return (
                    <div key={scope} className="compat-scope" data-testid={`compat-${scope}`}>
                      <span className={`badge ${state}`}>{fails > 0 ? `오류 ${fails}건` : warns > 0 ? `경고 ${warns}건` : "PASS"}</span>
                      <span className="compat-name">{label}</span>
                      <span className="muted"> · 규칙 {rules.length}개</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Warnings never block execution. They flag recommendation quality,
                which the public simulator does not score. */}
            {(validation.warnings?.length ?? 0) > 0 && (
              <div className="alert warn" role="status" data-testid="validation-warnings" style={{ marginTop: "0.5rem" }}>
                <div className="warn-title">경고 {validation.warnings!.length}건 — 실행은 가능합니다</div>
                <ul>{validation.warnings!.map((w, i) => (
                  <li key={i}>
                    <span className="mono">{w.code}</span> <span className="mono">{w.path}</span>: {w.message}
                    {w.ruleId && <> <span className="muted">(규칙 {w.ruleId})</span></>}
                    {w.actionIndex != null && <> <span className="muted">— Action #{w.actionIndex}</span></>}
                  </li>
                ))}</ul>
                <div className="warn-note">
                  추천 품질과 최종 점수는 공개 시뮬레이터에서 평가하지 않습니다. 심사에서 고려될 수 있습니다.
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
/**
 * Digital twin: replays the SERVER's execution events. The browser does not run
 * the state machine, does not evaluate safety and does not build Evidence — it
 * animates what the Simulation Driver already produced on the server.
 */
function DigitalTwin({ session, fixture, submission, run, onEvidence, onInject }: {
  session: Session; fixture: PublicFixture; submission: ParticipantSubmission; run: RunResultLike;
  onEvidence: () => void; onInject: (code: string) => void;
}) {
  const byId = useMemo(() => Object.fromEntries(fixture.candidates.map((c) => [c.candidateId, c])), [fixture]);
  const events = run.events ?? [];
  const [cursor, setCursor] = useState(0);           // events applied
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(450);
  const timer = useRef<number | null>(null);

  useEffect(() => { setCursor(0); setPlaying(false); }, [run]);
  useEffect(() => {
    if (!playing) return;
    if (cursor >= events.length) { setPlaying(false); return; }
    timer.current = window.setInterval(() => setCursor((c) => Math.min(events.length, c + 1)), speed);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, cursor, events.length, speed]);

  const initialUi: SimulationUiState = events[0]?.uiState
    ? { ...events[0].uiState, currentState: session.initialState, selectedCandidate: undefined, selectedOptions: {}, cartItems: [] }
    : run.finalUiState;
  const applied = events.slice(0, cursor);
  const ui = cursor === 0 ? initialUi : applied[applied.length - 1].uiState;
  const done = cursor >= events.length;
  const stopped = done && events.at(-1)?.type === "RUN_STOPPED";
  const currentEvent = applied.at(-1);
  const executedSoFar = new Set(applied.map((e) => e.actionIndex));

  return (
    <div className="twin">
      {/* LEFT: participant submission summary */}
      <section className="panel">
        <h2>제출 요약 <SubmissionBadge /></h2>
        <dl className="kv">
          <dt>세션</dt><dd className="mono">{session.sessionId}</dd>
          <dt>team</dt><dd className="mono">{submission.teamId}</dd>
          <dt>드라이버</dt><dd><span className="badge sim">{session.driverId}</span></dd>
          <dt>프로필</dt><dd className="mono">{submission.profile.profileId}</dd>
          <dt>추천</dt><dd>{submission.recommendation.recommendedCandidateId ? byId[submission.recommendation.recommendedCandidateId]?.name : "없음"}</dd>
          <dt>승인</dt><dd>{String(submission.userDecision.approved)}</dd>
        </dl>
        <h3>접근성 요구</h3>
        <ul className="reasons verbose">
          {Object.entries(submission.profile.accessibility).filter(([, v]) => v).map(([k]) => <li key={k}>{k}</li>)}
          {Object.values(submission.profile.accessibility).every((v) => !v) && <li className="muted">지정 없음</li>}
        </ul>
        <h3>추천 이유</h3>
        <ul className="reasons">{submission.recommendation.recommendationReasons.map((r, i) => <li key={i}>✓ {r}</li>)}</ul>
      </section>

      {/* CENTER: the virtual kiosk */}
      <section className="panel">
        <h2>가상 키오스크 <DataBadge value={fixture.manifest.dataClassification} /></h2>
        <Kiosk fixture={fixture} ui={ui} stopped={stopped} stopReason={run.stopReason} />
      </section>

      {/* RIGHT: plan, events, safety */}
      <section className="panel">
        <h2>실행계획 · 이벤트 · 안전검사 <span className="badge sim">서버 실행</span></h2>
        <dl className="kv">
          <dt>현재 화면</dt><dd className="mono">{ui.currentState}</dd>
          <dt>이벤트</dt><dd>{cursor}/{events.length}</dd>
          <dt>현재 이벤트</dt><dd className="mono">{currentEvent?.type ?? "—"}</dd>
          <dt>stopType</dt><dd className="mono">{done ? run.stopType : "—"}</dd>
        </dl>
        {done && (run.stopType === "NORMAL_BOUNDARY_STOP"
          ? <div className="alert ok">경계 도달 + verifier 실행 후 STOP. 결제/실제 처리 없음.</div>
          : <div className="alert stop" role="alert">SAFETY_STOP: {run.stopReason}</div>)}

        <div className="toolbar">
          <button className="primary" onClick={() => setCursor((c) => Math.min(events.length, c + 1))} disabled={done}>한 단계 실행</button>
          <button onClick={() => setPlaying((p) => !p)} disabled={done}>{playing ? "일시정지" : "전체 자동재생"}</button>
          <button onClick={() => { setCursor(0); setPlaying(false); }}>다시 시작</button>
          <button onClick={onEvidence}>Evidence →</button>
        </div>
        <div className="toolbar" style={{ marginTop: "0.4rem" }}>
          <label className="field" style={{ minWidth: 110 }}><span className="sr-only">속도</span>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={900}>느리게</option><option value={450}>보통</option><option value={180}>빠르게</option>
            </select></label>
          <label className="field"><span className="sr-only">오류 주입</span>
            <select defaultValue="" onChange={(e) => e.target.value && onInject(e.target.value)}>
              <option value="">오류 주입…</option>{INJECT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select></label>
        </div>

        <h3 style={{ marginTop: "0.8rem" }}>실행계획 (제출됨)</h3>
        <div className="log">
          {submission.executionPlan.actions.map((a) => (
            <div key={a.actionIndex} className={`row ${executedSoFar.has(a.actionIndex) ? "done-row" : ""}`}>
              <span className="mono">#{a.actionIndex}</span><span>{a.action}</span>
              <span className="mono">{a.target.kind}:{a.target.id}</span>
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: "0.8rem" }}>이벤트 로그 (서버)</h3>
        <div className="log" aria-live="polite">
          {applied.length === 0 && <p className="muted">재생을 시작하세요.</p>}
          {applied.slice(-14).map((e, i) => (
            <div key={i} className={`row ${e.type === "RUN_STOPPED" ? "err" : ""}`}>
              <span className="mono">{e.type}</span><span className="verbose">{e.message}</span>
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: "0.8rem" }}>안전검사 (서버)</h3>
        <div className="log">
          {run.safetyChecks.map((c, i) => (
            <div key={i} className={`row ${c.outcome === "PASS" ? "" : "err"}`}>
              <OutcomeBadge outcome={c.outcome} /><span className="mono">{c.ruleId}</span><span className="verbose">{c.message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}



function EvidencePanel({ evidence, onBack }: { evidence: Evidence; onBack: () => void }) {
  function download() {
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${evidence.runId}.evidence.json`; a.click();
    URL.revokeObjectURL(url);
  }
  const checks: [string, boolean][] = [
    ["submissionValid", evidence.submissionValid],
    ["boundaryReached", evidence.boundaryReached],
    ["requiredVerifierExecuted", evidence.requiredVerifierExecuted],
    ["stopType === NORMAL_BOUNDARY_STOP", evidence.stopType === "NORMAL_BOUNDARY_STOP"],
    ["plannedPaymentActionCount === 0", evidence.plannedPaymentActionCount === 0],
    ["executedPaymentActionCount === 0", evidence.executedPaymentActionCount === 0],
    ["actualDeviceCommandSent === false", evidence.actualDeviceCommandSent === false],
    ["officialRecommendationGenerated === false", evidence.officialRecommendationGenerated === false],
    ["terminalState === STOP", evidence.terminalState === "STOP"],
  ];
  return (
    <section className="panel">
      <h2>
        Evidence{" "}
        <span className={`badge ${evidence.result === "PASS" ? "pass" : "stop"}`}>
          <span className="dot" style={{ background: "currentColor" }} aria-hidden />
          SIMULATION {evidence.result}
        </span>{" "}
        <span className="badge sim">서버 생성</span>
      </h2>
      <p className="muted" style={{ marginTop: "-0.4rem" }}>계약 · 안전 · 상태 전환 검증 통과 여부</p>
      <div className="alert pending-note" role="note">
        <strong>이 결과는 데이터 계약, 안전규칙, 상태 전환과 검토 경계 도달을 통과했음을 의미합니다.</strong><br />
        추천 품질, 접근성 UX, 창의성과 최종 심사 점수를 의미하지 않습니다.
      </div>
      <h3>평가 범위</h3>
      <div className="log">
        <div className="row"><OutcomeBadge outcome={evidence.simulationValidation?.contractValid ? "PASS" : "FAIL"} /><span>Simulation Contract</span></div>
        <div className="row"><OutcomeBadge outcome={evidence.simulationValidation?.safetyValid ? "PASS" : "FAIL"} /><span>Safety Boundary</span></div>
        <div className="row"><span className="badge pending">비공개 심사</span><span>Recommendation Quality</span></div>
        <div className="row"><span className="badge pending">심사위원 평가</span><span>Accessibility UX</span></div>
        <div className="row"><span className="badge pending">심사위원 평가</span><span>Creativity</span></div>
      </div>
      <div className="toolbar"><button className="ghost" onClick={onBack}>← 트윈으로</button><button className="primary" onClick={download}>Evidence JSON 다운로드</button></div>
      <dl className="kv" style={{ marginTop: "0.6rem" }}>
        <dt>runId</dt><dd className="mono">{evidence.runId}</dd>
        <dt>resultScope</dt><dd className="mono" data-testid="result-scope">{evidence.resultScope}</dd>
        <dt>submissionHash</dt><dd className="mono">{evidence.submissionHash}</dd>
        <dt>stopType</dt><dd className="mono">{evidence.stopType}</dd>
        <dt>stopReason</dt><dd className="mono">{evidence.stopReason}</dd>
        <dt>결제(계획/실행/차단)</dt><dd className="mono">{evidence.plannedPaymentActionCount}/{evidence.executedPaymentActionCount}/{evidence.blockedPaymentActionCount}</dd>
      </dl>
      <h3>자동 검증</h3>
      <div className="log">{checks.map(([label, ok]) => <div key={label} className={`row ${ok ? "" : "err"}`}><OutcomeBadge outcome={ok ? "PASS" : "FAIL"} /> <span>{label}</span></div>)}</div>
      <h3>원본 JSON (서버 Evidence)</h3>
      <pre className="json">{JSON.stringify(evidence, null, 2)}</pre>
    </section>
  );
}
