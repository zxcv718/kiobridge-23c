# 환경별 참가팀 가이드

`[필수]` 개발 전에 여러분이 고른 환경의 문서를 읽으세요.

| 환경 | 문서 | 성격 |
| --- | --- | --- |
| 연습용 Sandbox | [SANDBOX_PARTICIPANT_GUIDE.md](SANDBOX_PARTICIPANT_GUIDE.md) | 평가 대상 아님. 완성 예제 제공 |
| 닭강정 가게 | [CHICKEN_STORE_PARTICIPANT_GUIDE.md](CHICKEN_STORE_PARTICIPANT_GUIDE.md) | 공식 평가 |
| 병원 접수 | [HOSPITAL_PARTICIPANT_GUIDE.md](HOSPITAL_PARTICIPANT_GUIDE.md) | 공식 평가 |
| 관공서 민원 | [PUBLIC_OFFICE_PARTICIPANT_GUIDE.md](PUBLIC_OFFICE_PARTICIPANT_GUIDE.md) | 공식 평가 |

## 공식 평가 환경의 공통 원칙

**추천과 실행계획은 제공되지 않습니다.** 각 문서는 "무엇을 수집해야 하는가" 와
"무엇을 하면 안 되는가" 를 알려줄 뿐, 어떤 후보를 고르라고 말하지 않습니다.

## 환경 데이터를 직접 조회하는 법

```bash
curl localhost:4000/api/v1/environments/<환경>/fixture
curl localhost:4000/api/v1/environments/<환경>/compatibility-rules
curl localhost:4000/api/v1/environments/<환경>/review-mapping
curl localhost:4000/api/v1/vocabularies/<환경>
```

- **fixture** — 후보·옵션·화면·상태전환
- **compatibility-rules** — 플랫폼이 추천을 어떻게 판정하는지 (제출 전 자기검증용)
- **review-mapping** — 검토화면이 어떤 값을 어디서 가져오는지
- **vocabularies** — 이 환경에서 쓸 수 있는 공식 값

## Compatibility Rules 읽는 법

```json
{
  "ruleId": "...",
  "evaluationScope": "CANDIDATE" | "EXECUTION_CHOICE",
  "source": { "section": "facts", "path": "visitType" },
  "target": { "source": "candidateSupportedOptions", "key": "VISIT_TYPE" },
  "operator": "IN",
  "severity": "BLOCK" | "WARN",
  "unknownPolicy": "RECONFIRM",
  "errorCode": "VISIT_TYPE_MISMATCH"
}
```

| 필드 | 뜻 |
| --- | --- |
| `evaluationScope` | `CANDIDATE` = 후보가 지원 가능한가 · `EXECUTION_CHOICE` = 실제로 무엇을 눌렀나 |
| `source` | 사용자 쪽 값의 위치 |
| `target` | 비교 대상 (후보 선언 또는 실행 선택) |
| `severity` | `BLOCK` 이면 실행 불가, `WARN` 이면 실행 가능하지만 기록됨 |
| `unknownPolicy` | 값이 UNKNOWN 일 때 어떻게 할지 |

## Review Mapping 읽는 법

각 `fields[]` 는 검토화면 한 줄입니다. `sources[]` 는 **위에서부터** 시도합니다.
`required: true` 인데 아무 소스도 값을 못 주면 `REVIEW_FIELD_UNRESOLVED` 로 실패합니다.
