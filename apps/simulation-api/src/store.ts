/**
 * In-memory session store. A session starts in WAITING and only advances when a
 * participant submits a result. The platform never fabricates a submission.
 * The authoritative RunResult is kept server-side (not on the Session type).
 */
import type { EnvironmentPack, Session } from "@kiobridge/contracts";
import { FIXED_PRINCIPLES } from "@kiobridge/contracts";
import type { RunResult } from "@kiobridge/evaluator";

const sessions = new Map<string, Session>();
const runs = new Map<string, RunResult>();
let seq = 0;

function makeSessionId(): string {
  seq += 1;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `SIM-${day}-${String(seq).padStart(3, "0")}`;
}

export function createSession(pack: EnvironmentPack): Session {
  const sessionId = makeSessionId();
  const session: Session = {
    sessionId,
    environmentId: pack.manifest.environmentId,
    fixtureVersion: pack.manifest.fixtureVersion,
    initialState: pack.manifest.initialState,
    driverId: "SIMULATION",
    submissionStatus: "WAITING",
    validationStatus: "NOT_STARTED",
    executionStatus: "NOT_STARTED",
    validationMode: FIXED_PRINCIPLES.validationMode,
    executionEnvironment: FIXED_PRINCIPLES.executionEnvironment,
    createdAt: new Date().toISOString(),
    submissionSeq: 0,
    submissionEndpoint: `/api/v1/sessions/${sessionId}/submission`,
  };
  sessions.set(sessionId, session);
  return session;
}

export const getSession = (id: string) => sessions.get(id);
export const updateSession = (s: Session) => sessions.set(s.sessionId, s);
export const listSessions = () => [...sessions.values()];
export const setRun = (id: string, run: RunResult) => runs.set(id, run);
export const getRun = (id: string) => runs.get(id);
/** A new submission invalidates any previous run. */
export const clearRun = (id: string) => { runs.delete(id); };
