# TypeScript SDK 예제

`[참고]` 이 저장소 안에서 바로 쓸 수 있습니다. 타입 검사를 받는 것이 장점입니다.

## SDK 가 하는 일 / 하지 않는 일

| 제공 | 제공하지 않음 |
| --- | --- |
| 계약·Vocabulary 조회 | 추천 생성 |
| 호환규칙·검토매핑 조회 | 실행계획 생성 |
| 제출 형식 검증 | 누락 옵션 자동 삽입 |
| 선택값 추출 보조 | 잘못된 값 자동 교정 |
| 오류 메시지 | 정답 |

## import

```ts
import {
  KioBridgeSimulationClient,
  // 계약 검증
  validateCanonicalInput,
  // 타임스탬프
  nowIso8601Utc, isIso8601UtcTimestamp,
  // 자기검증 보조
  extractExecutionChoices, evaluateTwoStageCompatibility,
  // 공식 enum
  SERVICE_TYPE, SPICY_LEVEL, VISIT_TYPE, AUTH_METHOD, INTENT_TASK,
  type ParticipantSubmission, type PublicFixture, type Evidence,
} from "@kiobridge/participant-sdk";
```

## 1–4. 조회

```ts
const client = new KioBridgeSimulationClient({ baseUrl: "http://localhost:4000" });

const environments = await client.environments();
const fixture: PublicFixture = await client.getPublicFixture("sandbox");

// 제출 전에 스스로 확인할 때 씁니다.
const rules = await client.getCompatibilityRules("sandbox");
const reviewMapping = await client.getReviewMapping("sandbox");

console.log(`후보 ${fixture.candidates.length}개 · 규칙 ${rules.rules.length}개`);
```

`fixture` 에는 `compatibilityRules` 와 `reviewMapping` 이 함께 들어 있어
한 번의 호출로도 됩니다.

## 5–9. 전체 흐름

```ts
async function run(submission: ParticipantSubmission) {
  const session = await client.createSession(submission.environmentId);
  await client.submit(session.sessionId, submission);

  const validation = await client.validate(session.sessionId);
  if (!validation.valid) {
    for (const e of validation.errors) {
      console.error(`${e.code} @ ${e.path}: ${e.message}`);
    }
    return null;
  }
  for (const w of validation.warnings ?? []) {
    console.warn(`경고 ${w.code}: ${w.message}`);
  }

  await client.execute(session.sessionId);
  const evidence: Evidence = await client.getEvidence(session.sessionId);
  return evidence;
}
```

## 제출 전 자기검증

서버에 보내기 전에 로컬에서 미리 확인할 수 있습니다.

```ts
// 계약 형식
const contract = validateCanonicalInput({
  inputContractVersion: submission.inputContractVersion,
  environmentId: submission.environmentId,
  teamId: submission.teamId,
  profile: submission.profile,
  sessionContext: submission.sessionContext,
});
if (!contract.valid) console.error(contract.errors);

// 실행계획이 실제로 무엇을 골랐는지
const { choices, errors } = extractExecutionChoices(submission.executionPlan, pack);
console.log(choices.selectedOptions);   // { SIZE: "SMALL", ... }
console.log(choices.quantity);
```

`extractExecutionChoices` 는 `EnvironmentPack` 이 필요하므로 서버 환경에서만 씁니다.
브라우저에서는 `client.validate()` 를 쓰세요.

## 타임스탬프

```ts
const collectedAt = nowIso8601Utc();          // "2026-08-03T00:11:00.123Z"

isIso8601UtcTimestamp("2026-08-03T00:11:00Z");        // true
isIso8601UtcTimestamp("2026-08-03");                  // false — 날짜만
isIso8601UtcTimestamp("2026-08-03T09:11:00+09:00");   // false — UTC 아님
isIso8601UtcTimestamp("2026-02-30T00:00:00Z");        // false — 없는 날짜
```

직접 문자열을 조합하지 말고 `nowIso8601Utc()` 또는 `new Date().toISOString()` 을 쓰세요.

## 공식 enum

```ts
sessionContext.preferences.serviceType = SERVICE_TYPE.TAKE_OUT;   // "TAKE_OUT"
sessionContext.facts.visitType = VISIT_TYPE.REVISIT;              // "REVISIT"
sessionContext.intent.task = INTENT_TASK.ORDER_FOOD;
```

문자열을 직접 쓰면 오타가 `ENUM_VALUE_INVALID` 로 돌아옵니다.

## 오류 처리

```ts
import { KioBridgeApiError } from "@kiobridge/participant-sdk";

try {
  await run(submission);
} catch (err) {
  if (err instanceof KioBridgeApiError) {
    console.error(`HTTP ${err.status}: ${err.message}`);
  } else {
    console.error("연결 실패 — npm run dev 로 서버를 켜세요:", (err as Error).message);
  }
}
```

## 실행

```bash
npx tsx my-script.ts
```

또는 이 저장소의 Starter 를 그대로 씁니다:

```bash
npm run dev:client
```

---

관련: [README.md](README.md) · [PARTICIPANT_GUIDE.md](../PARTICIPANT_GUIDE.md)
