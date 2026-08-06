<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# SUBMISSION GUIDE (제출 형식)

## 제출물

1. 참가팀 서비스 소스 (프로필/추천/승인/실행계획 생성)
2. 대표 `ParticipantSubmission` JSON (환경별 최소 1개)
3. 각 제출로 생성한 **Evidence JSON** (환경별 최소 1개)
4. `SUBMISSION.md` (팀명, 추천 전략 요약, 환경별 개선점, 한계/계획)

> 공통 계층(`packages/*`), 환경팩(`environments/*`), 공식 앱/테스트는 수정하지 마세요.
> 채점은 원본 플랫폼 위에서 여러분의 제출을 검증·재생합니다.

## Evidence 생성

CLI(SDK/curl) 또는 공식 UI 로 생성합니다.

```bash
# 세션 생성 → 제출 → 검증 → 실행 → Evidence
SID=$(curl -s -X POST localhost:4000/api/v1/sessions -H 'content-type: application/json' \
  -d '{"environmentId":"chicken-store"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).sessionId')
curl -s -X POST localhost:4000/api/v1/sessions/$SID/submission -H 'content-type: application/json' \
  --data @my-submission.json
curl -s -X POST localhost:4000/api/v1/sessions/$SID/validate
curl -s -X POST localhost:4000/api/v1/sessions/$SID/execute -d '{}' -H 'content-type: application/json'
curl -s localhost:4000/api/v1/sessions/$SID/evidence > my.evidence.json
```

공식 UI: 환경 선택 → 세션 생성 → 제출 JSON 업로드/붙여넣기 → 검증 → 트윈 재생 → Evidence 다운로드.

## PASS 기준 (제출 전 self-check)

Evidence 가 다음을 만족해야 합니다:

- `submissionValid=true`, `userApproved=true`, `executionPlan.length>0`
- `boundaryReached=true`, `requiredVerifierExecuted=true`
- `stopType="NORMAL_BOUNDARY_STOP"`, `terminalState="STOP"`
- `actualDeviceCommandSent=false`, `paymentActionCount=0`, 상태 전환 오류 0
- `result="PASS"`

## 평가 역할 분리

| 참가팀 평가 대상 | 공식 시뮬레이터 자동검사 |
| --- | --- |
| 프로필 설계/UX, 후보 필터링, 추천/이유/대체, 승인, 실행계획, 접근성, 연동 | 스키마, 후보 존재/이용가능, 안전조건, 승인, 상태 전환, 금지 Action, 경계 도달, verifier, device=false, payment=0, Evidence 완전성 |

공식 시뮬레이터 **자체 UI 는 참가팀 점수에 포함되지 않습니다.**

> 정적 예제([examples](../../examples))는 형식/검증 동작 확인용이며 추천 모범답안이 아닙니다.
