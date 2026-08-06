# PROFILE DATA DICTIONARY

`profile` = 사용자에게 **비교적 지속되는** 정보. 이번 이용에만 해당하는 값은
[SESSION_CONTEXT_DICTIONARY](SESSION_CONTEXT_DICTIONARY.md) 로 보내세요.

분류: **Core**(고정) · **Domain**(버전 관리하 변경 가능) · **Safety**(안전 의미) · **Extension**(자유)

| JSON Path | 한글 이름 | 의미 | 형식 | 필수 | 허용값 | UNKNOWN | 분류 | 변경 가능성 | 도입 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/profile/profileId` | 프로필 ID | 가명 식별자 (실제 ID 금지) | string | ✅ | 자유 문자열 | ✖ | Core | 매우 낮음 | 1.0.0 |
| `/profile/displayName` | 표시 이름 | 화면 표시용 별칭 | string | ⬜ 선택 | 자유 | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/dataClassification` | 데이터 구분 | 합성 데이터임을 명시 | enum | ✅ | `SYNTHETIC_PROFILE` | ✖ | Safety | 매우 낮음 | 1.0.0 |
| `/profile/source/collectionChannel` | 수집 경로 | 어떤 방식으로 수집했는지 | enum | ✅ | `WEB_FORM` `MOBILE_APP` `VOICE` `CHATBOT` `ASSISTED_INPUT` `IMPORTED` `OTHER` | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/source/providerId` | 제공자 | 수집한 팀/시스템 | string | ✅ | 자유 | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/source/collectedAt` | 수집 시각 | ISO 8601 UTC | string | ✅ | ISO 8601 | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/accessibility/largeText` | 큰 글씨 필요 | 큰 글씨 표시 | boolean | ✅ | true/false | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/accessibility/simpleSteps` | 쉬운 단계 | 단순한 진행 선호 | boolean | ✅ | true/false | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/accessibility/visualGuidance` | 시각 안내 | 시각적 가이드 필요 | boolean | ✅ | true/false | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/accessibility/hearingSupport` | 청각 지원 | 청각 보조 필요 | boolean | ✅ | true/false | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/accessibility/mobilitySupport` | 이동 지원 | 이동 보조 필요 | boolean | ✅ | true/false | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/accessibility/highContrast` | 고대비 | 고대비 화면 | boolean | ✅ | true/false | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/accessibility/staffAssistancePreferred` | 직원 도움 선호 | 직원 도움을 선호 | boolean | ✅ | true/false | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/interaction/preferredInput` | 선호 입력 | 주 입력 방식 | enum | ✅ | `TOUCH` `VOICE` `KEYBOARD` `SWITCH` `ASSISTED` `MULTIMODAL` | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/interaction/language` | 언어 | BCP 47 | string | ✅ | `ko-KR` `en-US` `ja-JP` … | ✖ | Core | 낮음 | 1.0.0 |
| `/profile/interaction/confirmationRequired` | 확인 필요 | 실행 전 확인 요구 | boolean | ✅ | true/false | ✖ | Safety | 매우 낮음 | 1.0.0 |
| `/profile/consent/personalization` | 개인화 동의 | 개인화 사용 동의 | boolean | ✅ | true/false | ✖ | Safety | 매우 낮음 | 1.0.0 |
| `/profile/consent/retentionPolicy` | 보관 정책 | 데이터 보관 범위 | enum | ✅ | `SESSION_ONLY` `UNTIL_USER_DELETES` `NOT_STORED` | ✖ | Safety | 낮음 | 1.0.0 |
| `/extensions/<teamId>` | 팀 확장 | 팀 자유 데이터 | object | ⬜ | 자유(개인정보 금지) | — | Extension | 높음 | 1.0.0 |

## 규칙

- `profile` 은 `additionalProperties: false` — 정의되지 않은 필드는 `UNKNOWN_FIELD` 오류입니다.
- 실제 개인정보(주민번호·전화·이메일·카드번호·생년월일·상세주소)는 탐지되면
  `PERSONAL_DATA_NOT_ALLOWED` 로 거부됩니다.
- 원본 음성 파일이나 대화 전문은 제출하지 마세요. 필요하면 `originalValueHash` 만 쓰세요.
- v4 의 `domainPreferences` / `constraints` 는 **제거**되었습니다
  ([MIGRATION_FROM_V4](MIGRATION_FROM_V4.md)).
