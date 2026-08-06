<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# UNKNOWN 과 누락값 정책

네 가지는 **서로 다른 의미**입니다. 같게 처리하지 마세요.

| 상태 | 표현 | 의미 | 서버 처리 |
| --- | --- | --- | --- |
| **누락** | 필드 자체를 보내지 않음 | 수집하지 않았거나 이번 흐름에 불필요 | 선택 필드면 통과 |
| **UNKNOWN** | `"UNKNOWN"` | 물어봤지만 알 수 없거나 수집 결과를 신뢰할 수 없음 | 값으로는 유효. **hardConstraint 면 정책 위반** |
| **NO_PREFERENCE** | `"NO_PREFERENCE"` | 사용자가 해당 항목에 선호가 없음 | 통과. 추천 시 자유롭게 선택 가능 |
| **NOT_APPLICABLE** | `"NOT_APPLICABLE"` | 현재 환경·흐름에서 해당하지 않음 | 통과 |

## Hard Constraint 가 UNKNOWN 이면

임의 추론을 **금지**합니다. 다음 중 하나를 하세요.

1. 사용자에게 재확인 요청
2. 안전한 대체 경로 사용 (예: 직원 도움)
3. 적합한 경로가 없으면 **STOP**

서버는 `HARD_CONSTRAINT_UNKNOWN` 오류를 반환합니다.

```json
{ "path": "/sessionContext/hardConstraints/allergenIds",
  "code": "HARD_CONSTRAINT_UNKNOWN",
  "message": "allergenIds 가 UNKNOWN 입니다. 임의로 추론하지 말고 재확인하거나 안전한 대체경로를 사용하세요." }
```

## 낮은 신뢰도

음성·AI 입력은 확신도가 낮을 수 있습니다. `fieldMetadata.confidence < 0.6` 이면서
`confirmedByUser=false` 이면 서버가 재확인을 요구합니다.

```json
{ "code": "LOW_CONFIDENCE_RECONFIRMATION_REQUIRED",
  "message": "confidence 0.3 가 낮고 사용자 확인이 없습니다. 재확인 후 제출하세요 (또는 UNKNOWN 으로 정규화)." }
```

권장 흐름: 인식 → 확신도 낮음 → **사용자에게 되묻기** → 확인되면 `confirmedByUser: true`,
확인 못 하면 값을 `UNKNOWN` 으로 정규화하고 `requiresReconfirmation: true`.
