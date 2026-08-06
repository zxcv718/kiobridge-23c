# 오류코드 카탈로그

`[필수]` 검증이 실패하면 여기서 코드를 찾으세요.

읽는 순서: **code** → **뜻** → **고칠 파일**. 정답이나 자동수정 코드는 제공하지 않습니다.

> 고칠 파일은 거의 항상 `workspace/<팀ID>/src/participant.ts` 입니다.
> `path` 가 어느 STEP 의 결과인지 알려줍니다.

| path 접두사 | 담당 STEP |
| --- | --- |
| `/profile/…` | STEP 2 `mapToCanonicalInput` |
| `/sessionContext/…` | STEP 3 `createSessionContext` |
| `/recommendation/…` | STEP 4·5 `filterCandidates` · `recommend` |
| `/userDecision/…` | STEP 8 `collectUserDecision` |
| `/executionPlan/…` | STEP 9 `buildExecutionPlan` |

---

## 1. 계약 · 형식

| code | 발생 단계 | 뜻 | 확인할 파일 | 해결 방향 |
| --- | --- | --- | --- | --- |
| `SCHEMA_INVALID` | 계약 검증 | JSON 구조가 스키마와 다릅니다 | `schemas/core/participant-submission.schema.json` | 빠진 필드·잘못된 타입을 맞추세요 |
| `INVALID_UTC_TIMESTAMP` | 계약 검증 | 시각이 UTC ISO 8601 이 아닙니다 | STEP 2·3·8 | `2026-08-03T00:11:00Z` 형식. SDK `nowIso8601Utc()` 사용. `+09:00`·날짜만·로컬시각 불가 |
| `ENUM_VALUE_INVALID` | 계약 검증 | 공식 enum 이 아닌 값 | `docs/ENUM_REFERENCE.md` | 자유 문자열 대신 공식 값 사용 |
| `UNKNOWN_FIELD` | 계약 검증 | 계약에 없는 필드 | STEP 2·3 | 확장은 `extensions` 아래 팀 namespace 로 |
| `REQUIRED_FIELD_MISSING` | 계약 검증 | 필수 필드 없음 | STEP 2·3 | 데이터 사전에서 필수 여부 확인 |
| `TYPE_MISMATCH` | 계약 검증 | 자료형 불일치 | STEP 2·3 | 숫자/문자열/불리언 확인 |
| `PERSONAL_DATA_NOT_ALLOWED` | PII 검사 | 주민번호·전화번호 등 실제 개인정보 | STEP 1·2 | 합성 데이터만 사용 |
| `DOMAIN_CONTEXT_MISMATCH` | 계약 검증 | 값을 잘못된 섹션에 넣음 | STEP 3 | facts/preferences/hardConstraints/capabilities 구분 |
| `ENVIRONMENT_MISMATCH` | 의미 검증 | `environmentId` 가 세션과 다름 | STEP 조립 | 세션을 만든 환경과 같게 |

## 2. 후보 (Stage A — 이 후보가 사용자를 지원할 수 있나)

| code | 뜻 | 확인할 파일 | 해결 방향 |
| --- | --- | --- | --- |
| `CANDIDATE_NOT_FOUND` | 존재하지 않는 후보 추천 | STEP 5 | `fixture.candidates` 의 실제 ID 사용 |
| `CANDIDATE_UNAVAILABLE` | 품절·이용불가 후보 추천 | STEP 4 | `available === false` 는 후보에서 제외 |
| `ALLERGEN_CONFLICT` | 알레르기와 겹치는 후보 | STEP 4 | 하드 제약이므로 점수가 아니라 제외 |
| `PRICE_LIMIT_EXCEEDED` | 가격 상한 초과 | STEP 4 | `hardConstraints.maxPriceKrw` 확인 |
| `VISIT_TYPE_MISMATCH` | 방문유형을 지원하지 않는 후보 | STEP 5 | `supportedOptions.VISIT_TYPE` 확인 |
| `APPOINTMENT_MISMATCH` | 예약상태가 맞지 않는 후보 | STEP 5 | 예약 없는 사용자에게 예약필수 후보 금지 |
| `DEPARTMENT_MISMATCH` | 진료과가 맞지 않는 후보 | STEP 5 | 증상으로 진료과를 추론하지 마세요 |
| `AUTH_METHOD_UNAVAILABLE` | 인증수단 교집합 0 | STEP 4 | `capabilities.availableAuthMethods` 와 후보 요구수단 |
| `REQUESTED_SERVICE_MISMATCH` | 요청 서비스와 다른 후보 | STEP 5 | `intent.requestedServiceId` 확인 |
| `SERVICE_TYPE_MISMATCH` | 선호 이용방식 불일치 (경고) | STEP 5 | 실행은 가능. 이유에 설명 |
| `SPICY_LEVEL_MISMATCH` | 선호 맵기 불일치 (경고) | STEP 5 | 실행은 가능 |
| `LOW_CONFIDENCE_RECONFIRMATION_REQUIRED` | 값이 UNKNOWN 이거나 확인되지 않음 | STEP 3·5 | 추론하지 말고 재확인하거나 직원 도움 경로 |

## 3. 실행 선택 (Stage B — 계획이 실제로 무엇을 눌렀나)

후보가 여러 값을 지원해도, **실제로 고른 값**이 사용자와 맞아야 합니다.

| code | 뜻 | 확인할 파일 | 해결 방향 |
| --- | --- | --- | --- |
| `SELECTED_VISIT_TYPE_MISMATCH` | 선택한 방문유형이 사실과 다름 | STEP 9 | 재진 사용자에게 초진을 누르지 마세요 |
| `SELECTED_APPOINTMENT_MISMATCH` | 선택한 예약상태가 사실과 다름 | STEP 9 | |
| `SELECTED_DEPARTMENT_MISMATCH` | 선택한 진료과가 사실과 다름 | STEP 9 | |
| `SELECTED_AUTH_METHOD_UNAVAILABLE` | 사용자가 쓸 수 없는 인증수단 선택 | STEP 9 | `availableAuthMethods` 에 포함된 것만 |
| `SELECTED_SERVICE_MISMATCH` | 최종 선택 서비스가 요청과 다름 | STEP 9 | |
| `SELECTED_SERVICE_TYPE_MISMATCH` | 선호와 다른 이용방식 선택 (경고) | STEP 9 | 실행 가능, 이유에 설명 |
| `SELECTED_SPICY_LEVEL_MISMATCH` | 선호와 다른 맵기 (경고) | STEP 9 | |
| `SELECTED_BONE_TYPE_MISMATCH` | 선호와 다른 뼈 유형 (경고) | STEP 9 | |
| `SELECTED_CUP_OPTION_MISMATCH` | 선호와 다른 컵 (경고) | STEP 9 | |
| `SELECTED_SIZE_MISMATCH` | 선호와 다른 크기 (경고) | STEP 9 | |
| `SELECTED_QUANTITY_MISMATCH` | 요청 수량과 다름 | STEP 9 | 수량은 차단 대상입니다 |

## 4. 실행계획 구조

| code | 뜻 | 확인할 파일 | 해결 방향 |
| --- | --- | --- | --- |
| `ACTIONS_WITHOUT_APPROVAL` | 승인 없이 Action 이 있음 | STEP 8·9 | 거절이면 `actions: []` |
| `USER_NOT_APPROVED` | 사용자 미승인 | STEP 8 | 최종 확인 화면을 넣으세요 |
| `RECOMMENDED_CANDIDATE_NOT_SELECTED` | 추천 후보를 계획이 고르지 않음 | STEP 9 | 추천과 실행 대상 일치 |
| `RECOMMENDATION_TARGET_MISMATCH` | 추천과 다른 후보를 선택 | STEP 9 | |
| `DUPLICATE_CANDIDATE_SELECTION` | 후보를 두 번 선택 | STEP 9 | 한 번만 |
| `EXECUTION_OPTION_DUPLICATE` | 같은 옵션 그룹을 다른 값으로 두 번 | STEP 9 | 단일선택 그룹은 한 번만 |
| `EXECUTION_REQUIRED_OPTION_MISSING` | 필수 옵션 그룹 미선택 | STEP 9 | `optionGroups` 의 `required` 확인 |
| `EXECUTION_OPTION_GROUP_UNKNOWN` | 존재하지 않는 옵션 그룹 | STEP 9 | `fixture.optionGroups` 확인 |
| `EXECUTION_OPTION_VALUE_UNKNOWN` | 존재하지 않는 옵션 값 | STEP 9 | |
| `REQUIRED_OPTION_MISSING` | 필수 옵션 누락 | STEP 9 | |
| `OPTION_NOT_SUPPORTED_BY_CANDIDATE` | 후보가 지원하지 않는 옵션 | STEP 9 | `candidate.supportedOptions` 확인 |
| `TARGET_KIND_NOT_ALLOWED` | 이 화면에서 쓸 수 없는 대상 종류 | STEP 9 | `screens[].targetKinds` 확인 |

## 5. 상태 · 안전 경계

| code | 뜻 | 확인할 파일 | 해결 방향 |
| --- | --- | --- | --- |
| `STATE_MISMATCH` | 화면 상태가 어긋남 | STEP 9 | `transitions` 를 따라 before/after 를 채우세요 |
| `UNKNOWN_STATE` | 존재하지 않는 상태 | STEP 9 | `manifest.states` 확인 |
| `INVALID_TRANSITION` | 불가능한 전환 | STEP 9 | |
| `ACTION_INDEX_NOT_ZERO_BASED` | actionIndex 가 0 부터 시작하지 않음 | STEP 9 | |
| `ACTION_INDEX_NON_CONTIGUOUS` | actionIndex 가 연속적이지 않음 | STEP 9 | |
| `BOUNDARY_NOT_REACHED` | 검토 경계까지 못 감 | STEP 9 | `manifest.reviewBoundaryState` 까지 진행 |
| `MISSING_VERIFIER` | 필수 verifier 미실행 | STEP 9 | 마지막에 verifier action |
| `ACTION_AFTER_VERIFIER` | verifier 뒤에 Action 이 있음 | STEP 9 | verifier 가 마지막 |
| `FORBIDDEN_ACTION` | 결제·본인확인 완료·행정확정 Action | STEP 9 | **계획에 넣기만 해도 FAIL** |
| `ACTUAL_DEVICE_COMMAND` | `actualDeviceCommandSent` 가 false 가 아님 | STEP 9 | 항상 `false` |
| `INVALID_FIXED_PRINCIPLE` | validationMode·executionEnvironment 위반 | STEP 9 | `SIMULATION_ONLY` / `DIGITAL_TWIN` |
| `REVIEW_FIELD_UNRESOLVED` | 검토화면 필수 항목을 못 채움 | STEP 3·9 | 필요한 값을 SessionContext 나 선택에 넣으세요 |

## 6. 플랫폼 내부 (참가팀이 만날 일이 거의 없음)

`ENVIRONMENT_CANDIDATE_DATA_CONFLICT` · `ENVIRONMENT_VOCABULARY_CONFLICT` ·
`VOCABULARY_VALUE_UNKNOWN` · `REVIEW_VALUE_LABEL_UNKNOWN`

환경팩 로딩 시점 오류입니다. 이 오류가 보이면 플랫폼 파일을 수정했을 가능성이 있습니다.
`npm run participant:doctor` 로 무결성을 확인하세요.

---

관련 문서: [TROUBLESHOOTING_DECISION_TREE.md](TROUBLESHOOTING_DECISION_TREE.md) · [UNKNOWN_POLICY.md](UNKNOWN_POLICY.md) · [PASS_SCOPE.md](PASS_SCOPE.md)
