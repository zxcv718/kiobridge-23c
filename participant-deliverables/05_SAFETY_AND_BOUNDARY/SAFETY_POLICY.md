<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# SAFETY POLICY

## 고정 실행 원칙 (변경 불가)

```json
{
  "validationMode": "SIMULATION_ONLY",
  "executionEnvironment": "DIGITAL_TWIN",
  "actualDeviceCommandSent": false,
  "participantSubmissionUsed": true,
  "officialRecommendationGenerated": false
}
```

`packages/contracts` 의 `FIXED_PRINCIPLES` 로 강제되며 어댑터/환경팩이 덮어쓸 수 없습니다.

## 절대 구현하지 않는 것

실제 VoiceBridge/Agent/Windows 조작, 실제 마우스·키보드 입력, 실제 키오스크 원격제어,
실제 결제(카드·현금·승인), 실제 환자정보 조회, 실제 정부 인증, 실제 민원 신청,
실제 병원 접수 완료, 실제 주민등록번호 사용 — 어느 것도 포함하지 않습니다.
외부 네트워크가 없어도 전체 시뮬레이터가 로컬에서 동작합니다.

## 안전규칙 엔진 (`packages/safety-engine`)

각 규칙은 `PASS | BLOCK | STOP` 을 반환하며, 하나라도 `BLOCK`/`STOP` 이면 후속 Action 을
실행하지 않습니다.

| 규칙 | 설명 | 심각도 |
| --- | --- | --- |
| `REQUIRE_USER_CONFIRMATION` | 승인 전 실행계획 실행 금지 | STOP |
| `BLOCK_PAYMENT_ACTION` | 결제/금지 Action 차단 | BLOCK |
| `BLOCK_ACTUAL_DEVICE_COMMAND` | 실제 기기 명령 전송 차단 | BLOCK |
| `UNKNOWN_STATE_STOP` | 정의되지 않은 상태 참조 시 STOP | STOP |
| `STATE_MISMATCH_STOP` | expectedBeforeState/After 불일치 시 STOP | STOP |
| `UNAVAILABLE_CANDIDATE_BLOCK` | `available=false` 후보 차단 | BLOCK |
| `ALLERGEN_CONFLICT_BLOCK` | 프로필 알레르기 충돌 후보 차단 | BLOCK |
| `FINAL_BOUNDARY_STOP` | 최종 확인 화면 이후 비읽기 Action 차단 | STOP |
| `VERIFY_CART_READ_ONLY` | `verify_*` 는 상태 변경 없는 읽기 전용 | STOP |

## 상태 머신 검증 (`packages/state-engine`)

Action 실행 전 다음을 검증하고, 하나라도 어긋나면 실행하지 않고 STOP 합니다.

- 현재 상태가 정의된 상태인가 (`UNKNOWN_STATE`)
- Action 이 현재 상태에서 허용되는가 (`NO_TRANSITION`)
- Action 이 금지 목록에 없는가 (`FORBIDDEN_ACTION`)
- `expectedBeforeState === currentState` (`STATE_MISMATCH`)
- `targetId` 가 Fixture 에 존재하는가 (`UNKNOWN_TARGET`)
- `expectedAfterState === transition.to` (`STATE_MISMATCH`)

## 오류 주입 (디지털 트윈)

시연/검증용으로 6종 오류를 주입할 수 있으며, 모두 즉시 STOP 되어야 합니다:
`UNKNOWN_STATE`, `FORBIDDEN_ACTION`, `USER_NOT_APPROVED`, `CANDIDATE_UNAVAILABLE`,
`PAYMENT_ACTION_ATTEMPT`, `STATE_MISMATCH`.

## 제출 검증 (schema + semantics)

`execute` 는 검증을 통과한 계획만 재생합니다. 실패 시 `{path, code, message}` 배열을 반환합니다.
코드: `SCHEMA_INVALID, ENVIRONMENT_MISMATCH, CANDIDATE_NOT_FOUND, CANDIDATE_UNAVAILABLE,
ALLERGEN_CONFLICT, EXCLUDED_CANDIDATE_NOT_FOUND, ACTIONS_WITHOUT_APPROVAL, FORBIDDEN_ACTION,
RECOMMENDATION_TARGET_MISMATCH, ACTUAL_DEVICE_COMMAND, INVALID_FIXED_PRINCIPLE`.

## STOP 은 성공이 아니다 — 두 종류 구분

- **NORMAL_BOUNDARY_STOP** — 경계 상태 도달 + 필수 verifier 실행. PASS 후보.
- **SAFETY_STOP** — 오류/위반/불완전. FAIL. (빈 계획·경계 미도달·verifier 누락·상태 오류·금지 Action)

`evaluator` 는 `stateHistory` 에 `STOP` 을 강제로 붙이지 않습니다. `terminalState` 는 별도 필드입니다.

## Evidence PASS 조건 (모두 충족)

`submissionValid=true` · `userDecision.approved=true` · `executionPlan.length>0` · 상태 전환 오류 0 ·
금지 Action 0 · `boundaryReached=true` · `requiredVerifierExecuted=true` ·
`actualDeviceCommandSent=false` · **`plannedPaymentActionCount=0` 및 `executedPaymentActionCount=0`** ·
`terminalState="STOP"` · `stopType="NORMAL_BOUNDARY_STOP"`. 하나라도 어긋나면 `result="FAIL"`.

## 결제/실제처리 Action 3분 계정 (section 17)

- `plannedPaymentActionCount` — 실행계획에 포함된 결제 Action 수
- `executedPaymentActionCount` — 실제 실행된 수 (항상 0, 안전엔진이 dispatch 전 차단)
- `blockedPaymentActionCount` — 차단된 수

**계획에 결제가 들어갔다가 차단되어도(`executed=0`) `planned>0` 이면 FAIL** 입니다. 동일 원칙을
실제 접수 완료(`complete_checkin`)·실제 민원 신청(`submit_application`/`issue_document`) 등
`forbiddenActions` 전체에 적용합니다.

## 오류 주입 (디지털 트윈, 시연/검증용)

`UNKNOWN_STATE, FORBIDDEN_ACTION, USER_NOT_APPROVED, CANDIDATE_UNAVAILABLE,
PAYMENT_ACTION_ATTEMPT, STATE_MISMATCH` — 제출된 계획을 변형해 STOP/차단을 시연합니다.
결제/금지 Action 은 **실행 전에 차단**되어 `paymentActionCount=0` 이며 위반은 `safetyChecks`
및 검증 오류로 기록됩니다.
