import React, { useEffect, useMemo, useState } from "react";
import { api, type EnvSummary } from "./api";
import type { ContractError } from "./types";

/**
 * Schema Playground — 제출 전에 Canonical Input 을 검증해 보는 도구.
 * 추천이나 실행계획을 생성하지 않습니다. 공식 스키마를 이해하고 검증하는 화면입니다.
 */

const TEMPLATE: Record<string, unknown> = {
  inputContractVersion: "1.0.0",
  environmentId: "chicken-store",
  teamId: "TEAM-001",
  profile: {
    profileId: "TEAM-001-PROFILE-001",
    displayName: "합성 사용자 1",
    dataClassification: "SYNTHETIC_PROFILE",
    source: { collectionChannel: "VOICE", providerId: "TEAM-001", collectedAt: "2026-08-01T05:30:00.000Z" },
    accessibility: { largeText: true, simpleSteps: true, visualGuidance: false, hearingSupport: false, mobilitySupport: false, highContrast: false, staffAssistancePreferred: false },
    interaction: { preferredInput: "VOICE", language: "ko-KR", confirmationRequired: true },
    consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
  },
  sessionContext: {
    intent: { task: "ORDER_FOOD" },
    facts: {},
    preferences: { serviceType: "TAKE_OUT", spicyLevel: "HOT", boneType: "BONELESS", quantity: 1 },
    hardConstraints: { allergenIds: [], maxPriceKrw: 10000 },
    capabilities: {},
    fieldMetadata: { "/preferences/spicyLevel": { source: "VOICE", confidence: 0.91, confirmedByUser: true } },
  },
};

interface Result { valid: boolean; contractVersion?: string; errors: ContractError[] }

export function Playground({ envs, onBack }: { envs: EnvSummary[]; onBack: () => void }) {
  const [environmentId, setEnvironmentId] = useState("chicken-store");
  const [version, setVersion] = useState("1.0.0");
  const [versions, setVersions] = useState<string[]>(["1.0.0"]);
  const [text, setText] = useState(JSON.stringify(TEMPLATE, null, 2));
  const [result, setResult] = useState<Result | null>(null);
  const [vocab, setVocab] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    api.contracts().then((c) => { setVersions(c.supportedInputContractVersions); setVersion(c.defaultInputContractVersion); }).catch(() => {});
  }, []);
  useEffect(() => { api.vocabulary(environmentId).then(setVocab).catch(() => setVocab(null)); }, [environmentId]);

  const parsed = useMemo(() => {
    try { return { ok: true as const, value: JSON.parse(text) }; }
    catch (e) { return { ok: false as const, message: (e as Error).message }; }
  }, [text]);

  async function validate() {
    if (!parsed.ok) { setParseError(parsed.message); setResult(null); return; }
    setParseError(null); setBusy(true);
    try {
      const body = { ...(parsed.value as object), environmentId, inputContractVersion: version };
      setResult(await api.validateContractInput(body));
    } catch (e) { setParseError(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }

  function loadTemplate() {
    setText(JSON.stringify({ ...TEMPLATE, environmentId }, null, 2));
    setResult(null);
  }

  function download() {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `canonical-input-${environmentId}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  const piiErrors = result?.errors.filter((e) => e.code === "PERSONAL_DATA_NOT_ALLOWED") ?? [];

  return (
    <section className="panel">
      <h2>Schema Playground <span className="badge sim">검증 전용</span></h2>
      <p className="verbose muted">
        제출 전에 Canonical Input(프로필 + SessionContext)을 검증합니다.
        이 화면은 <strong>추천이나 실행계획을 생성하지 않습니다.</strong>
      </p>

      <div className="toolbar">
        <label className="field"><span>환경</span>
          <select value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}>
            {envs.map((e) => <option key={e.environmentId} value={e.environmentId}>{e.name}</option>)}
          </select>
        </label>
        <label className="field"><span>계약 버전</span>
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <button onClick={loadTemplate}>표준 예제 불러오기</button>
        <button className="primary" onClick={validate} disabled={busy}>검증</button>
        <button onClick={download}>JSON 다운로드</button>
        <button className="ghost" onClick={onBack}>← 돌아가기</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.8rem" }}>
        <div>
          <h3>입력 JSON</h3>
          <label><span className="sr-only">Canonical Input JSON</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={26}
              spellCheck={false} style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: "0.78rem" }} />
          </label>
          {!parsed.ok && <div className="alert stop">JSON 구문 오류: {parsed.message}</div>}
          {parseError && <div className="alert stop">{parseError}</div>}
        </div>

        <div>
          <h3>검증 결과</h3>
          {!result && <p className="muted">‘검증’을 눌러 확인하세요.</p>}
          {result && result.valid && (
            <div className="alert ok">
              유효합니다 (contractVersion {result.contractVersion}). 이 프로필·컨텍스트는 제출 가능합니다.
            </div>
          )}
          {result && !result.valid && (
            <div className="alert stop">
              <strong>오류 {result.errors.length}건</strong>
              <ul className="reasons">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <span className="mono">{e.code}</span> <span className="mono">{e.path}</span>
                    <div>{e.message}</div>
                    {e.allowedValues && <div className="muted">허용값: <span className="mono">{e.allowedValues.join(", ")}</span></div>}
                    {e.receivedValue !== undefined && <div className="muted">받은 값: <span className="mono">{JSON.stringify(e.receivedValue)}</span></div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h3>개인정보 탐지</h3>
          {piiErrors.length === 0
            ? <p className="muted">{result ? "개인정보 패턴이 발견되지 않았습니다." : "검증 후 표시됩니다."}</p>
            : <div className="alert stop">{piiErrors.map((e, i) => <div key={i}>{e.message}</div>)}</div>}

          <h3>허용 enum (이 환경)</h3>
          <pre className="json" style={{ maxHeight: 260 }}>{vocab ? JSON.stringify(vocab, null, 2) : "불러오는 중…"}</pre>
        </div>
      </div>
    </section>
  );
}
