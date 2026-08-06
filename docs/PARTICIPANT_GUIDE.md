# PARTICIPANT GUIDE (참가팀 개발 가이드)

공식 시뮬레이터는 추천을 만들어주지 않습니다. **여러분이 프로필·추천·승인·실행계획을
직접 설계·구현**하고, 그 결과를 Simulation API 로 제출하면 플랫폼이 검증·재생합니다.

## 1. 플랫폼 실행 & Fixture 조회

```bash
npm install && npm run dev          # web:3000, simulation-api:4000
curl http://localhost:4000/api/v1/environments
curl http://localhost:4000/api/v1/environments/chicken-store/fixture
```

Fixture 로 후보목록·화면·컨트롤·허용 Action·전환·안전규칙을 확인하세요.
(비공개 평가 정답은 포함되지 않습니다.)

## 2. 여러분이 만드는 것 (참가팀 서비스)

1. **profile** — 접근성/선호/제약을 구조화한 합성 프로필
2. **recommendation** — 후보 필터링 + 순위 + 이유 + 제외 사유(+대체후보)
3. **userDecision** — 사용자 승인/거절/수정 UI 의 결과
4. **executionPlan** — Fixture 의 transitions/controls 에 맞는 가상 실행계획
   (승인 전이면 `actions: []`)

이 4가지를 `ParticipantSubmission` 으로 묶어 제출합니다.
스키마: [`schemas/participant-submission.schema.json`](../schemas/core/participant-submission.schema.json).

## 3. 제출 & 검증 (SDK)

```ts
import { KioBridgeSimulationClient } from "@kiobridge/participant-sdk";
const client = new KioBridgeSimulationClient({ baseUrl: "http://localhost:4000" });

const session = await client.createSession("chicken-store");
await client.submit(session.sessionId, submission);       // 여러분의 결과
const validation = await client.validate(session.sessionId);
if (!validation.valid) console.error(validation.errors);  // {path, code, message}
const { evidence } = await client.execute(session.sessionId);
console.log(evidence.result, evidence.stopType, evidence.stopReason);
```

참고 예제: [`examples/minimal-participant-client`](../examples/minimal-participant-client) —
API 연동 방법만 보여주며 추천 정답을 포함하지 않습니다. `buildSubmission()` 이 여러분의 TODO 입니다.

## 4. 실행계획이 PASS 되려면

`execute` 결과 Evidence 가 PASS 이려면 다음을 **모두** 만족해야 합니다:

- 제출 스키마/시맨틱 유효, 사용자 승인 완료, 실행계획 비어있지 않음
- 상태 전환 오류 없음, 금지 Action 없음
- 환경별 **검토 경계 상태 도달** + **필수 verifier 실행**
- `actualDeviceCommandSent=false`, `paymentActionCount=0`, `terminalState=STOP`

> STOP 했다는 사실만으로 PASS 가 아닙니다. 경계 미도달/verifier 누락/빈 계획은 `SAFETY_STOP` + FAIL.

| 환경 | 경계 상태 | 필수 verifier |
| --- | --- | --- |
| chicken-store | CART_REVIEW | verify_cart |
| hospital | CHECKIN_REVIEW | verify_checkin |
| public-office | APPLICATION_REVIEW | verify_application |

## 5. 자주 겪는 검증 실패

| code | 원인 |
| --- | --- |
| `SCHEMA_INVALID` | 필수 필드 누락, actualDeviceCommandSent≠false 등 |
| `CANDIDATE_NOT_FOUND` / `CANDIDATE_UNAVAILABLE` | 없는/품절 후보 추천 |
| `ALLERGEN_CONFLICT` | 프로필 알레르기와 충돌 후보 추천 |
| `ACTIONS_WITHOUT_APPROVAL` | 미승인인데 actions 존재 |
| `FORBIDDEN_ACTION` | 결제/실제처리 Action 포함 |
| `RECOMMENDATION_TARGET_MISMATCH` | 실행계획이 추천 후보와 다른 후보를 대상으로 함 |

## 6. 접근성

프로필의 `accessibility`(큰 글씨/청각 지원/쉬운 단계 등)를 추천에 반영하면 품질이 올라갑니다.
공식 UI 자체는 참가팀 점수에 포함되지 않습니다 ([SUBMISSION_GUIDE](SUBMISSION_GUIDE.md) 참고).

## 로그인·저장·개인정보 정책

| 구분 | 내용 |
| --- | --- |
| Example UI | 로그인 없이 동작하는 **Sandbox 참고 예제**입니다. 공식 정답이 아닙니다. |
| 참가팀 자유 | 로그인, 기기 내 프로필 저장, QR, 음성, 카메라, OCR, 보호자 입력 등을 **선택적으로 자유롭게** 구현할 수 있습니다. |
| 반드시 지킬 것 | 로그인 기능은 금지되지 않지만, **로그인하지 않아도 서비스의 핵심 기능을 사용할 수 있어야 합니다.** |
| 심사 데이터 | 해커톤·심사·시뮬레이션에서는 실제 개인정보가 아닌 **가상·합성 데이터**를 사용해야 합니다. |
| 실제 서비스 확장 | 실제 서비스에서 개인정보를 처리하려면 별도의 동의, 최소수집, 저장기간, 삭제, 보안 정책이 필요합니다. |

자세한 내용: [../docs/LOGINLESS_QR_PROFILE_GUIDE.md](../docs/LOGINLESS_QR_PROFILE_GUIDE.md)

## 받은 패키지가 공식 패키지인지 확인

```bash
npm run participant:doctor
```

`공식 파일 무결성` 이 PASS 면 받은 파일이 운영진이 만든 그대로입니다.
직접 확인하고 싶다면 압축 해제본에서 다음을 실행하세요.

```bash
npm run verify:public-package
```

압축 해제본에는 운영진용 `release/` 폴더가 없는 것이 정상이며,
그 항목은 `NOT_APPLICABLE` 로 표시됩니다.
