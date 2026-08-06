<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# ENUM REFERENCE (공식 값)

**표기 규칙**

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| JSON 필드명 | camelCase | `serviceType`, `allergenIds` |
| 공식 ID·enum 값 | UPPER_SNAKE_CASE | `TAKE_OUT`, `HAS_APPOINTMENT` |
| 날짜·시간 | ISO 8601 UTC | `2026-08-01T05:30:00.000Z` |
| 언어 | BCP 47 | `ko-KR`, `en-US`, `ja-JP` |
| 금액 | 통화 단위를 변수명에 | `maxPriceKrw` |
| 수량 | 정수 | `quantity: 1` |
| 배열 | 복수형 | `allergenIds`, `supportModes` |
| 자유 확장 | `extensions` 아래에만 | `extensions["TEAM-001"]` |

## 허용되지 않는 값 (예)

`포장` · `takeout` · `take_out` · `매운맛` · `hot` · `순살` · `boneless` · `ko`

→ 공식값으로 변환: `TAKE_OUT` · `HOT` · `BONELESS` · `ko-KR`

## 공통 sentinel

`UNKNOWN` · `NOT_APPLICABLE` · `NO_PREFERENCE` — 의미가 다릅니다([UNKNOWN_POLICY](./UNKNOWN_POLICY.md)).

## Core

| enum | 값 |
| --- | --- |
| collectionChannel | `WEB_FORM` `MOBILE_APP` `VOICE` `CHATBOT` `ASSISTED_INPUT` `IMPORTED` `OTHER` |
| preferredInput | `TOUCH` `VOICE` `KEYBOARD` `SWITCH` `ASSISTED` `MULTIMODAL` |
| retentionPolicy | `SESSION_ONLY` `UNTIL_USER_DELETES` `NOT_STORED` |
| fieldMetadata.source | `WEB_FORM` `MOBILE_APP` `VOICE` `CHATBOT` `ASSISTED_INPUT` `IMPORTED` `INFERRED` `DEFAULTED` `OTHER` |
| intent.task | `ORDER_FOOD` `CHECK_IN` `PUBLIC_SERVICE_GUIDANCE` `PRACTICE` |

## Domain

| enum | 값 |
| --- | --- |
| serviceType | `DINE_IN` `TAKE_OUT` `NO_PREFERENCE` `UNKNOWN` |
| spicyLevel | `MILD` `MEDIUM` `HOT` `NO_PREFERENCE` `UNKNOWN` |
| boneType | `BONE` `BONELESS` `NO_PREFERENCE` `UNKNOWN` |
| cupOption | `PAPER` `REGULAR` `NONE` `NO_PREFERENCE` `UNKNOWN` |
| allergenIds | `PEANUT` `SOY` `MILK` `EGG` `WHEAT` `SHRIMP` `UNKNOWN` |
| visitType | `FIRST_VISIT` `REVISIT` `HEALTH_SCREENING` `EXAM` `UNKNOWN` |
| appointmentStatus | `HAS_APPOINTMENT` `NO_APPOINTMENT` `UNKNOWN` |
| departmentId | `INTERNAL_MEDICINE` `ORTHOPEDICS` `ENT` `RADIOLOGY` `HEALTH_SCREENING` `UNSPECIFIED` |
| supportModes | `LARGE_TEXT` `HEARING_SUPPORT` `VISUAL_GUIDANCE` `SIMPLE_STEPS` `STAFF_HELP` `GUARDIAN_MODE` |
| serviceCategory | `RESIDENT` `FAMILY` `INSURANCE` `TAX` `STAFF` `UNKNOWN` |
| availableAuthMethods | `MOBILE_AUTH` `ID_CARD` `BIOMETRIC` `STAFF_ASSIST` `NONE` `UNKNOWN` |

## 값의 출처

이 표는 `packages/profile-contract/src/enums.ts` 에서 생성됩니다.
`schemas/vocabularies/*` 와 `schemas/domains/*` 도 같은 소스에서 생성되며,
테스트가 세 곳의 일치를 강제합니다.

런타임 조회: `GET /api/v1/vocabularies/:environmentId`

## enum 추가 정책

- 서버는 공식 enum 을 **엄격히** 검증하고 알 수 없는 값은 오류입니다.
- 새 값 추가는 **MINOR** 버전 상승과 함께 이뤄집니다([SCHEMA_VERSIONING_POLICY](./SCHEMA_VERSIONING_POLICY.md)).
- 참가팀은 공식 enum 에 없는 값을 핵심 필드에 넣지 말고 `UNKNOWN` 또는 `extensions` 를 쓰세요.
