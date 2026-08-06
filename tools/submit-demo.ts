/**
 * 운영/시연용 제출 도구 (operator tool — NOT a recommendation answer).
 *
 * sandbox fixture 의 transition 그래프를 기계적으로 걸어 "형식상 유효한" 의미
 * 기반 실행계획을 만들어 세션에 제출합니다. 추천 품질/정답과는 무관하며, 참가팀
 * 서비스 없이 플랫폼(자동 감지 → 검증 → 가상 키오스크 재생)을 시연할 때 씁니다.
 *
 *   npx tsx tools/submit-demo.ts sandbox [sessionId]
 *
 * sandbox 전용입니다. 공식 평가 환경(chicken-store / hospital / public-office)의
 * 실행계획은 참가팀이 직접 만들어야 하므로 이 도구가 생성하지 않습니다.
 */
import { buildSandboxSubmission } from "../tests/public/sandbox/sandbox-plan-builder";
import { loadEnvironmentPack } from "../apps/simulation-api/src/loader";

const BASE = process.env.SIM_API_URL ?? "http://localhost:4000";
const envId = process.argv[2] ?? "sandbox";
let sessionId = process.argv[3];

const pack = loadEnvironmentPack(envId);
const submission = buildSandboxSubmission(pack, "TEAM-DEMO");

if (!sessionId) {
  const r = await fetch(`${BASE}/api/v1/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ environmentId: envId }),
  });
  sessionId = ((await r.json()) as { sessionId: string }).sessionId;
  console.log("created session:", sessionId);
}

const res = await fetch(`${BASE}/api/v1/sessions/${sessionId}/submission`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(submission),
});
console.log(`submitted to ${sessionId}: HTTP ${res.status} (${submission.executionPlan.actions.length} actions)`);
