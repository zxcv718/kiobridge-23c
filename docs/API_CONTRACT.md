# API CONTRACT (Simulation API :4000)

모든 응답은 `SIMULATION_ONLY` 이며 `actualDeviceCommandSent` 는 항상 `false`.
공식 API 는 추천/프로필/승인/실행계획을 **생성하지 않고 검증만** 합니다.

## 환경 · Fixture

### `GET /api/v1/environments`
환경 요약 배열. 환경은 `/environments` 디렉터리에서 자동 발견됩니다(연습용 `sandbox` 포함).

### `GET /api/v1/environments/:id/fixture`
공개 Fixture: `manifest, candidates(+supportedOptions), optionGroups, screens(+targetKinds),
transitions, safetyRules, simulationBinding`(레이아웃 템플릿).
평가용 프로필과 **UPRLite(실기기) 바인딩은 반환하지 않습니다.**

## 세션

### `POST /api/v1/sessions`
입력 `{ "environmentId": "chicken-store" }` →
```json
{ "sessionId": "SIM-20260801-001", "environmentId": "chicken-store",
  "fixtureVersion": "chicken-store@0.2.0", "initialState": "SERVICE_TYPE",
  "submissionStatus": "WAITING", "validationMode": "SIMULATION_ONLY",
  "executionEnvironment": "DIGITAL_TWIN", "driverId": "SIMULATION",
  "submissionEndpoint": "/api/v1/sessions/SIM-20260801-001/submission" }
```

### `GET /api/v1/sessions/:sessionId`
세션 상태(폴링 대상). `submissionStatus`: `WAITING | SUBMITTED | VALIDATING | VALIDATED |
VALIDATION_FAILED | READY_TO_RUN | RUNNING | PASSED | FAILED | STOPPED`. 별도 `validationStatus`
(`NOT_STARTED|VALIDATING|VALIDATED|VALIDATION_FAILED`)와 `executionStatus`
(`NOT_STARTED|RUNNING|PASSED|FAILED|STOPPED`) 포함. 공식 웹은 이 엔드포인트를 1초 폴링하여
`WAITING→SUBMITTED` 전환을 자동 감지합니다.

### `GET /api/v1/sessions/:sessionId/run`
서버 실행 이력(권위): `driverId, executedActions, **events**, stateHistory, lastBusinessState,
safetyChecks, stopType, stopReason, boundaryReached, requiredVerifierExecuted,
reviewSnapshot, finalUiState`. 웹은 이 값으로만 가상 키오스크를 그립니다(브라우저는 상태
머신/Evidence 를 재계산하지 않음).

`events[]` 는 `TARGET_RESOLVED → TARGET_HIGHLIGHTED → TARGET_PRESSED → VALUE_APPLIED →
SCREEN_TRANSITION_STARTED → SCREEN_TRANSITION_COMPLETED → REVIEW_UPDATED → VERIFIER_EXECUTED
→ RUN_STOPPED` 순서이며, 각 이벤트에 그 시점의 `uiState` 스냅샷이 포함됩니다.

### `POST /api/v1/sessions/:sessionId/error-injection`
`{ "code": "PAYMENT_ACTION_ATTEMPT" }` — 제출을 변형해 재실행하고 결과를 반환합니다.
코드: `UNKNOWN_STATE | STATE_MISMATCH | FORBIDDEN_ACTION | CANDIDATE_UNAVAILABLE |
USER_NOT_APPROVED | PAYMENT_ACTION_ATTEMPT | MISSING_VERIFIER`.

## 제출 · 검증 · 실행

### `POST /api/v1/sessions/:sessionId/submission`
### `POST /api/v1/sessions/:sessionId/submission-file`
`ParticipantSubmission` 전체를 받습니다. 저장만 하고 상태를 `SUBMITTED` 로 바꿉니다.
(submission-file 은 UI 업로드용 별칭 — 추천을 생성하지 않고 그대로 검증 대상이 됩니다.)

### `POST /api/v1/sessions/:sessionId/validate`
JSON Schema(ajv) + 시맨틱 + **전체 상태 머신 dry-run**. 응답:
```json
{ "valid": false, "errors": [ { "path": "/executionPlan/actions/0/action",
  "code": "FORBIDDEN_ACTION", "message": "금지된 Action: select_payment" } ] }
```
검사 항목: 스키마, environmentId 일치, candidateId 존재/available, 알레르기 충돌, 제외 후보
존재, 승인↔Action 일치, 금지 Action, actualDeviceCommandSent=false, validationMode,
executionEnvironment, 추천 후보↔실행 대상 일치.

### `POST /api/v1/sessions/:sessionId/execute`
검증을 통과한 계획만 **Simulation Driver** 로 재생. 검증 실패면 `{ valid:false, validation }`.
성공 시 `{ valid:true, run, evidence }`. 선택 입력 `{ "injectError": "PAYMENT_ACTION_ATTEMPT" }`.

### `GET /api/v1/sessions/:sessionId/evidence`
최종 Evidence(JSON).

---

## ParticipantSubmission (입력 계약)

최상위 필수: `submissionVersion, teamId, environmentId, profile, recommendation, userDecision, executionPlan`.

**Action 은 의미 기반입니다.** 좌표·UIA·컨트롤 ID 는 스키마가 거부합니다:

```json
{ "actionIndex": 2, "action": "select_option",
  "target": { "kind": "option", "groupId": "SPICY_LEVEL", "id": "HOT" },
  "expectedBeforeState": "OPTION_SELECTION", "expectedAfterState": "OPTION_SELECTION" }
```

의미 검증 항목: 후보 존재/이용가능, 추천 후보 선택 Action 존재·일치·1회, 옵션 그룹/값 존재,
후보의 옵션 지원(`supportedOptions`), 필수 옵션 충족, 화면별 `targetKinds` 허용,
상태 전환 일치, verifier 실행, 경계 이후 Action 없음.
규칙: `userDecision.approved=false` 이면 `executionPlan.actions=[]`,
`actualDeviceCommandSent` 반드시 `false`, `validationMode="SIMULATION_ONLY"`,
`executionEnvironment="DIGITAL_TWIN"`, 실제 개인정보 금지, 환경에 없는 candidateId 금지.

스키마: [`schemas/participant-submission.schema.json`](../schemas/core/participant-submission.schema.json).

## Evidence (출력 계약) — v1.2, 서버 생성

`evidenceVersion:"1.2"`, `runId, sessionId, teamId, submissionHash, createdAt`,
**`driverId`(SIMULATION|UPRLITE) · `driverStatus` · `reviewSnapshot`**,
`participantSubmissionUsed:true, officialRecommendationGenerated:false`(‼ `mockAdapterUsed` 제거),
`profileSummary, recommendation, userDecision, executionPlan, executedActions, stateHistory,
safetyChecks, validationErrors`, **결제 triad** `plannedPaymentActionCount / executedPaymentActionCount
/ blockedPaymentActionCount`, `lastBusinessState, terminalState, stopType, stopReason,
boundaryReached, requiredVerifierExecuted, submissionValid, extensions, result`.
스키마: [`schemas/evidence.schema.json`](../schemas/core/evidence.schema.json).

> Evidence 는 **서버(simulation-api)에서 한 번만** 생성·저장합니다. 웹은 재계산하지 않습니다.
> 결제 Action 은 계획에 있으면 차단되어도(`executed=0`) `planned>0` 이므로 **FAIL** 입니다.

## SDK

```ts
import { KioBridgeSimulationClient } from "@kiobridge/participant-sdk";
const client = new KioBridgeSimulationClient({ baseUrl: "http://localhost:4000" });
const session = await client.createSession("chicken-store");
await client.submit(session.sessionId, submission);   // 참가팀이 만든 submission
const validation = await client.validate(session.sessionId);
const result = await client.execute(session.sessionId);
const evidence = await client.getEvidence(session.sessionId);
```
SDK 는 전송·타입만 제공하며 추천/프로필/순위/실행계획을 생성하지 않습니다.
