# SCHEMA VERSIONING POLICY

Semantic Versioning (`MAJOR.MINOR.PATCH`) 을 사용합니다.

| 구분 | 의미 | 예 |
| --- | --- | --- |
| **MAJOR** | 호환되지 않는 변경 | 필수 필드 삭제, 필드 의미 변경, enum 값 의미 변경, 구조 변경 |
| **MINOR** | 기존 클라이언트와 호환되는 추가 | 선택 필드 추가, **새 enum 값 추가**, 새 capability 추가 |
| **PATCH** | 문서·설명·검증 버그 수정 | description 수정, 오류메시지 개선, 오타 |

## 계약 층별 정책

| 층 | 해커톤 기간 | 비고 |
| --- | --- | --- |
| **Core Contract** | MAJOR 변경 **금지** | 최상위 구조·profile·userDecision·executionPlan·안전 의미 |
| **Domain Contract** | MAJOR 변경 **금지**, MINOR 는 운영진 공지 후 | 환경별 facts/preferences/capabilities |
| **Extensions** | 자유 | 팀 namespace 내부는 언제든 변경 가능 |

- 참가팀이 제출한 `inputContractVersion` 은 대회 중 유지됩니다.
- **평가 시작 후 계약은 동결(freeze)** 됩니다.
- 지원하지 않는 버전을 제출하면 `UNSUPPORTED_INPUT_CONTRACT_VERSION` 을 반환합니다.

## 현재 버전

```
coreContractVersion            1.0.0
supportedInputContractVersions ["1.0.0"]
defaultInputContractVersion    1.0.0
supportedSubmissionVersions    ["1.0.0"]
```

조회: `GET /api/v1/contracts` · 레지스트리: `schemas/registry/contract-registry.json`

## enum 추가 시 호환

- 서버: 공식 enum 을 엄격히 검증하고, 새 값은 **버전 상승과 함께** 도입합니다.
- SDK: enum 상수와 계약버전 확인 기능을 제공하고 `UNKNOWN` fallback 을 허용합니다.
- 참가팀: 공식 enum 에 없는 값은 `UNKNOWN` 또는 `extensions` 로 처리하고,
  임의 문자열을 핵심 필드에 넣지 않습니다.

변경 절차는 [SCHEMA_CHANGE_PROCESS](SCHEMA_CHANGE_PROCESS.md) 를 따릅니다.
