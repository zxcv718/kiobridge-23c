import type {
  Evidence,
  ParticipantSubmission,
  PublicFixture,
  RunResultLike,
  Session,
  ValidationResult,
} from "./types";

export interface ExecuteResponse {
  valid: boolean;
  run?: RunResultLike;
  evidence?: Evidence;
  validation?: ValidationResult;
  injected?: string;
}

export const BASE = (import.meta.env.VITE_CORE_API_URL ?? "").replace(/\/$/, "");
export const CORE_API_TARGET = BASE || "http://localhost:4000 (Vite 프록시 경유)";

export class CoreApiUnreachableError extends Error {
  constructor() {
    super(
      `Simulation API 에 연결할 수 없습니다 (${CORE_API_TARGET}).\n` +
        `터미널에서 'npm run dev' 가 실행 중인지, 4000 포트가 열려 있는지 확인하세요.`,
    );
    this.name = "CoreApiUnreachableError";
  }
}

async function request<T>(pathName: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${BASE}${pathName}`, {
      ...init,
      headers: init?.body ? { "content-type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
    });
  } catch {
    throw new CoreApiUnreachableError();
  }
  if (!r.ok) {
    const detail = (await r.json().catch(() => ({} as { error?: string }))).error;
    throw new Error(detail ?? `HTTP ${r.status} (${pathName})`);
  }
  const text = await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const post = <T>(p: string, body?: unknown) => request<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) });
const get = <T>(p: string) => request<T>(p);

export interface EnvSummary {
  environmentId: string;
  name: string;
  description: string;
  summary: string;
  testFocus: string;
  dataClassification: string;
  fixtureVersion: string;
}

export interface ContractCapabilities {
  supportedInputContractVersions: string[];
  defaultInputContractVersion: string;
  supportedSubmissionVersions: string[];
}

export const api = {
  /** Liveness probe for the header status badge. */
  health: async (): Promise<boolean> => {
    try { await get("/health"); return true; } catch { return false; }
  },
  environments: () => get<EnvSummary[]>("/api/v1/environments"),
  contracts: () => get<ContractCapabilities>("/api/v1/contracts"),
  vocabulary: (id: string) => get<Record<string, unknown>>(`/api/v1/vocabularies/${id}`),
  validateContractInput: (body: unknown) =>
    post<{ valid: boolean; contractVersion?: string; errors: import("./types").ContractError[] }>("/api/v1/contracts/input/validate", body),
  fixture: (id: string) => get<PublicFixture>(`/api/v1/environments/${id}/fixture`),
  createSession: (environmentId: string) => post<Session>("/api/v1/sessions", { environmentId }),
  getSession: (sessionId: string) => get<Session>(`/api/v1/sessions/${sessionId}`),
  submit: (sessionId: string, submission: ParticipantSubmission) =>
    post<Session>(`/api/v1/sessions/${sessionId}/submission`, submission),
  validate: (sessionId: string) => post<ValidationResult>(`/api/v1/sessions/${sessionId}/validate`),
  execute: (sessionId: string, injectError?: string | null) =>
    post<ExecuteResponse>(`/api/v1/sessions/${sessionId}/execute`, { injectError: injectError ?? undefined }),
  injectError: (sessionId: string, code: string) =>
    post<ExecuteResponse>(`/api/v1/sessions/${sessionId}/error-injection`, { code }),
};

export async function checkCoreApi(): Promise<boolean> {
  try {
    await get("/api/health");
    return true;
  } catch {
    return false;
  }
}
