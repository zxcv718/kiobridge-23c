<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# SESSION CONTEXT DICTIONARY

`sessionContext` = **이번 키오스크 이용에만** 적용되는 정보.

## 여섯 섹션의 의미 (혼동 금지)

| 섹션 | 의미 | 위반 시 |
| --- | --- | --- |
| `intent` | 지금 하려는 목표 | 환경별 task 불일치 → 오류 |
| `facts` | 확인된 **객관적 사실** (예: 예약 여부) | 잘못된 섹션 → `DOMAIN_CONTEXT_MISMATCH` |
| `preferences` | 선호. **지키면 좋지만 필수는 아님** | 불일치해도 BLOCK 아님 → 추천 점수/이유에 반영 |
| `hardConstraints` | **위반 시 후보를 반드시 제외** (예: 알레르기) | 불일치 → **BLOCK** |
| `capabilities` | 지금 **사용 가능한 수단** (예: 인증수단) | 잘못된 섹션 → `DOMAIN_CONTEXT_MISMATCH` |
| `fieldMetadata` | 각 값의 출처·신뢰도·확인 여부 | confidence 범위 위반 → 오류 |

> 병원 예약 여부는 preference 가 아니라 **fact** 입니다.
> 관공서 인증수단은 preference 가 아니라 **capability** 입니다.
> 알레르기는 preference 가 아니라 **hardConstraint** 입니다.

## 공통 — fieldMetadata

| JSON Path | 의미 | 형식 | 필수 | 허용값 | 분류 |
| --- | --- | --- | --- | --- | --- |
| `…/source` | 값의 출처 | enum | ✅ | `WEB_FORM` `MOBILE_APP` `VOICE` `CHATBOT` `ASSISTED_INPUT` `IMPORTED` `INFERRED` `DEFAULTED` `OTHER` | Core |
| `…/confidence` | 정규화 신뢰도 | number | ✅ | 0 ≤ x ≤ 1 | Core |
| `…/confirmedByUser` | 사용자 확인 여부 | boolean | ✅ | true/false | Safety |
| `…/capturedAt` | 수집 시각 | string | ⬜ | ISO 8601 | Core |
| `…/normalizerId` | 정규화기 식별자 | string | ⬜ | 자유 | Core |
| `…/originalValueHash` | 원본 값 해시 | string | ⬜ | 해시만(원문 금지) | Safety |

키는 JSON Pointer 입니다: `"/preferences/spicyLevel"`.

## 닭강정 (chicken-store) — task `ORDER_FOOD`

| JSON Path | 한글 | 형식 | 허용값 | Hard/Soft | 변경 가능성 |
| --- | --- | --- | --- | --- | --- |
| `/sessionContext/preferences/serviceType` | 이용방식 | enum | `DINE_IN` `TAKE_OUT` `NO_PREFERENCE` `UNKNOWN` | Soft | 중간 |
| `/sessionContext/preferences/spicyLevel` | 맵기 | enum | `MILD` `MEDIUM` `HOT` `NO_PREFERENCE` `UNKNOWN` | Soft | 중간 |
| `/sessionContext/preferences/boneType` | 형태 | enum | `BONE` `BONELESS` `NO_PREFERENCE` `UNKNOWN` | Soft | 중간 |
| `/sessionContext/preferences/cupOption` | 컵 | enum | `PAPER` `REGULAR` `NONE` `NO_PREFERENCE` `UNKNOWN` | Soft | 중간 |
| `/sessionContext/preferences/quantity` | 수량 | integer ≥ 1 | 환경팩이 상한 정의 | Soft | 중간 |
| `/sessionContext/hardConstraints/allergenIds` | 피해야 할 알레르기 | array\<enum\> | `PEANUT` `SOY` `MILK` `EGG` `WHEAT` `SHRIMP` `UNKNOWN` | **Hard** | 매우 낮음 |
| `/sessionContext/hardConstraints/maxPriceKrw` | 가격 상한(원) | number ≥ 0 | — | **Hard** | 낮음 |

> `allergenIds` 에 `UNKNOWN` 이 있으면 `HARD_CONSTRAINT_UNKNOWN` — 임의 추론 금지, 재확인하거나
> 안전한 대체경로를 쓰세요.

## 병원 (hospital) — task `CHECK_IN`

| JSON Path | 한글 | 형식 | 허용값 | 구분 |
| --- | --- | --- | --- | --- |
| `/sessionContext/facts/visitType` | 방문 유형 | enum | `FIRST_VISIT` `REVISIT` `HEALTH_SCREENING` `EXAM` `UNKNOWN` | Fact |
| `/sessionContext/facts/appointmentStatus` | 예약 여부 | enum | `HAS_APPOINTMENT` `NO_APPOINTMENT` `UNKNOWN` | Fact |
| `/sessionContext/facts/departmentId` | 진료과 | enum | `INTERNAL_MEDICINE` `ORTHOPEDICS` `ENT` `RADIOLOGY` `HEALTH_SCREENING` `UNSPECIFIED` | Fact |
| `/sessionContext/facts/guardianPresent` | 보호자 동행 | boolean | true/false | Fact |
| `/sessionContext/preferences/supportModes` | 접근성 지원 | array\<enum\> | `LARGE_TEXT` `HEARING_SUPPORT` `VISUAL_GUIDANCE` `SIMPLE_STEPS` `STAFF_HELP` `GUARDIAN_MODE` | Soft |
| `/sessionContext/hardConstraints/medicalInferenceAllowed` | 의료추론 허용 | const | `false` 고정 | **Safety** |
| `/sessionContext/capabilities/canUseSelfCheckIn` | 셀프 접수 가능 | boolean | true/false | Capability |

금지: 증상으로 질병 추론 · 치료 추천 · 응급도 판단 · 실제 환자번호/예약번호 · 실제 접수 완료.
진료과가 확인되지 않으면 `UNSPECIFIED` 또는 직원 도움 경로를 쓰세요.

## 관공서 (public-office) — task `PUBLIC_SERVICE_GUIDANCE`

| JSON Path | 한글 | 형식 | 허용값 | 구분 |
| --- | --- | --- | --- | --- |
| `/sessionContext/intent/requestedServiceId` | 요청 민원 ID | string | Fixture 의 서비스 ID | Intent |
| `/sessionContext/facts/serviceCategory` | 민원 분야 | enum | `RESIDENT` `FAMILY` `INSURANCE` `TAX` `STAFF` `UNKNOWN` | Fact |
| `/sessionContext/preferences/stepByStep` | 단계별 안내 | boolean | true/false | Soft |
| `/sessionContext/preferences/simpleLanguage` | 쉬운 문장 | boolean | true/false | Soft |
| `/sessionContext/hardConstraints/legalEligibilityInferenceAllowed` | 자격 추론 허용 | const | `false` 고정 | **Safety** |
| `/sessionContext/capabilities/availableAuthMethods` | 사용 가능 인증수단 | array\<enum\> | `MOBILE_AUTH` `ID_CARD` `BIOMETRIC` `STAFF_ASSIST` `NONE` `UNKNOWN` | Capability |

실제 주민등록번호·실제 인증데이터는 받지 않습니다.

## Sandbox — task `PRACTICE`

| JSON Path | 한글 | 허용값 |
| --- | --- | --- |
| `/sessionContext/preferences/size` | 크기 | `SMALL` `LARGE` `NO_PREFERENCE` `UNKNOWN` |
