# ENVIRONMENT PACK GUIDE (새 환경팩 추가)

새 키오스크 환경을 **코어 코드 수정 없이 데이터로** 추가할 수 있습니다. 플랫폼은
`/environments/*` 를 읽어 manifest 가 유효한 팩을 환경 선택화면에 자동 노출합니다.

## 최소 구성

```
environments/<environmentId>/
├── manifest.json      # environment-pack.schema.json 을 만족해야 함
├── screens.json       # 상태별 title/controls/progress (최종화면 isFinalReview:true)
├── controls.json      # controlId/label/action (+ readOnly)
├── candidates.json    # 또는 catalog.json / flows.json / services.json
├── transitions.json   # {from, action, to, guards?}  (verifier 는 guards:["readOnly"])
├── safety-rules.json
├── profiles/          # (선택) 합성 프로필
└── assets/            # (선택)
```

## manifest 필수 필드

```json
{
  "environmentId": "new-domain",
  "displayName": "새로운 환경",
  "fixtureVersion": "1.0.0",
  "initialState": "WELCOME",
  "reviewBoundaryState": "REVIEW",
  "requiredVerifierAction": "verify_result",
  "terminalState": "STOP",
  "states": ["WELCOME", "REVIEW", "STOP"],
  "allowedActions": ["start", "verify_result"],
  "forbiddenActions": ["submit_payment"],
  "dataClassification": "SYNTHETIC_MOCK"
}
```

스키마: [`schemas/environment-pack.schema.json`](../schemas/core/environment-pack.schema.json).
`requiredVerifierAction` 은 `verify_` 로 시작하는 읽기전용 Action, `terminalState` 는 `STOP`.

## 코드 연결

1. `apps/simulation-api/src/loader.ts` 의 `ENV_IDS` 에 새 id 추가 (새 후보 파일명이면
   `CANDIDATE_FILES` 에도 추가).
2. `packages/contracts` 의 `EnvironmentId` 유니온에 추가.
3. `examples/submission-format-example/<id>.json` 형식 예제 추가.
4. `tests/public` 정합성 테스트 추가.

## 참가팀 환경팩

참가팀도 선택 과제로 새 환경팩을 만들 수 있습니다. 단 **별도 검증을 거쳐야 하며 공식 환경팩을
덮어쓸 수 없습니다** (동일 `environmentId` 금지).

> 참고: 환경팩을 코드 없이 검증/로딩하는 전용 `packages/environment-sdk` 는 v0.1 에서
> 스키마(`environment-pack.schema.json`)와 로더로 대체되어 있으며, 독립 패키지화는
> [PENDING_REAL_DEVICE](PENDING_REAL_DEVICE.md) 의 TODO 입니다.
