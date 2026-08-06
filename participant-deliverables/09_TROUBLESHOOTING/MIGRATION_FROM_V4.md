<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# MIGRATION FROM V4

## 무엇이 바뀌었나

v4 의 프로필은 두 개의 **자유 객체**를 갖고 있었습니다.

```ts
domainPreferences: Record<string, unknown>
constraints:       Record<string, unknown>
```

같은 의미를 팀마다 다르게 보낼 수 있어(`take_out` / `포장` / `takeout` / `TAKEOUT`)
검증도, 향후 실기기 연동도 불안정했습니다.

**v5**: 두 필드를 제거하고 `profile`(지속 정보) 과 `sessionContext`(이번 이용 정보) 로 분리하고,
모든 값에 공식 enum 을 강제합니다.

## 매핑 표

| v4 | v5 |
| --- | --- |
| `profile.domainPreferences.serviceType: "take_out"` | `sessionContext.preferences.serviceType: "TAKE_OUT"` |
| `profile.domainPreferences.spicyLevel: "high"` | `sessionContext.preferences.spicyLevel: "HOT"` |
| `profile.domainPreferences.boneType: "boneless"` | `sessionContext.preferences.boneType: "BONELESS"` |
| `profile.constraints.allergens: ["peanut"]` | `sessionContext.hardConstraints.allergenIds: ["PEANUT"]` |
| `profile.domainPreferences.hasAppointment: true` | `sessionContext.facts.appointmentStatus: "HAS_APPOINTMENT"` |
| `profile.domainPreferences.visitType: "revisit"` | `sessionContext.facts.visitType: "REVISIT"` |
| `profile.domainPreferences.availableAuthMethods: ["mobile_auth"]` | `sessionContext.capabilities.availableAuthMethods: ["MOBILE_AUTH"]` |
| `profile.interaction.preferredInput: "touch"` | `profile.interaction.preferredInput: "TOUCH"` |
| `profile.interaction.language: "ko"` | `profile.interaction.language: "ko-KR"` |
| (없음) | `profile.source.{collectionChannel,providerId,collectedAt}` **필수** |
| (없음) | `profile.accessibility.staffAssistancePreferred` **필수** |
| (없음) | `profile.consent.retentionPolicy` **필수** |
| (없음) | `inputContractVersion` **필수** |
| `executionPlan.userApproved` | 제거 — `userDecision.approved` 사용 |
| `mockAdapterUsed` | 제거 — `participantSubmissionUsed` / `officialRecommendationGenerated` |

## 자동 변환기

개발 편의용 Legacy Adapter 를 제공합니다. **공식 평가에는 사용하지 않습니다.**

```ts
import { convertLegacyV4 } from "@kiobridge/profile-contract";
const { profile, sessionContext, warnings } = convertLegacyV4(oldProfile, "chicken-store");
```

또는:

```bash
curl -X POST localhost:4000/api/v1/contracts/legacy/convert \
  -H 'content-type: application/json' \
  -d '{"environmentId":"chicken-store","profile":{"domainPreferences":{"serviceType":"take_out"},"constraints":{"allergens":["peanut"]}}}'
```

항상 경고를 반환합니다:

```json
{ "code": "LEGACY_PROFILE_FORMAT",
  "message": "v4 자유형 profile 형식은 폐기 예정입니다. inputContractVersion 1.0.0 형식으로 변환되었습니다." }
```

**모호한 값은 추정하지 않습니다.** `take_out` 처럼 명확한 값만 매핑하고, 임의 문장이나
불명확한 값은 `UNKNOWN` 으로 변환한 뒤 추가 경고를 남깁니다. 변환 결과는 반드시
직접 확인하세요.
