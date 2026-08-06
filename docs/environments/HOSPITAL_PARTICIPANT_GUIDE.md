# 병원 접수 — 참가팀 가이드

`[필수]` 환경 ID: `hospital` · 공식 평가 환경

> 이 문서는 **무엇을 수집해야 하는지**와 **무엇을 하면 안 되는지**를 알려줍니다.
> 어떤 후보를 고르라거나 어떻게 점수를 매기라고 말하지 않습니다. 그것이 여러분의 몫이자 심사 대상입니다.

## 1. 이 환경이 해결하려는 문제

초진·재진, 예약 여부, 진료과를 스스로 판단해 누르기 어렵습니다.
잘못 누르면 접수 자체가 되지 않거나 다시 줄을 서야 합니다.

## 2. 참가팀이 수집할 수 있는 정보

- 처음 왔는지 다시 왔는지
- 예약을 했는지
- 어느 진료과인지 (**사용자가 말한 것만**)
- 보호자가 함께 왔는지
- 필요한 접근성 지원
- 무인 접수를 쓸 수 있는지

수집 방법은 자유입니다 — 웹폼·음성·QR·챗봇·보호자 대리입력 무엇이든 됩니다.

## 3. Profile 에 들어가는 값 (오래 유지)

- `accessibility.largeText`, `hearingSupport`, `staffAssistancePreferred` …
- `interaction.preferredInput`, `language: "ko-KR"`

**오늘 어느 과에 가는지는 profile 이 아닙니다.**

## 4. SessionContext 에 들어가는 값 (이번 이용만)

| 섹션 | 이 환경에서 |
| --- | --- |
| `intent.task` | `CHECK_IN` |
| `facts` | `visitType` · `appointmentStatus` · `departmentId` · `guardianPresent` |
| `preferences` | `supportModes` |
| `hardConstraints` | `medicalInferenceAllowed: false` |
| `capabilities` | `canUseSelfCheckIn` |

**방문유형·예약·진료과는 선호가 아니라 사실(facts)입니다.**

## 5. 섹션 구분이 왜 중요한가

섹션을 섞으면 `DOMAIN_CONTEXT_MISMATCH` 로 거부됩니다.

| 섹션 | 뜻 | 양보 가능? |
| --- | --- | --- |
| `facts` | 확인된 사실 | — |
| `preferences` | 선호 | 예 (불일치는 경고) |
| `hardConstraints` | 절대 조건 | 아니오 (불일치는 차단) |
| `capabilities` | 쓸 수 있는 수단 | 아니오 |

## 6. Fixture 에서 확인할 항목

```bash
curl localhost:4000/api/v1/environments/hospital/fixture
```

- `candidates[].supportedOptions.VISIT_TYPE` — 이 접수경로가 받는 방문유형
- `.APPOINTMENT` — 예약 필수인지
- `.DEPARTMENT` — 어느 과인지 (`UNSPECIFIED` 는 일반 안내)
- `optionGroups` — `VISIT_TYPE` · `APPOINTMENT` · `DEPARTMENT` · `SUPPORT`

## 7. 금지되는 추론

- **증상으로 진료과를 추론하기** — 의료 판단입니다
- 진단·치료 추천·응급도 판단
- `departmentId` 가 UNKNOWN 인데 특정 과를 자동 선택
- 예약이 없는 사용자에게 예약필수 경로 추천
- 실제 접수 완료·실제 환자번호·실제 예약정보 생성

모르면 `UNSPECIFIED` 인 일반 안내나 직원 도움 경로를 쓰고 사용자에게 재확인하세요.

## 8. 대표적인 오류코드

`VISIT_TYPE_MISMATCH` · `APPOINTMENT_MISMATCH` · `DEPARTMENT_MISMATCH`
`SELECTED_VISIT_TYPE_MISMATCH` · `SELECTED_APPOINTMENT_MISMATCH` · `SELECTED_DEPARTMENT_MISMATCH`
`LOW_CONFIDENCE_RECONFIRMATION_REQUIRED` · `REVIEW_FIELD_UNRESOLVED`

전체 목록: [../ERROR_CATALOG.md](../ERROR_CATALOG.md)

## Compatibility Rules 읽기

```bash
curl localhost:4000/api/v1/environments/hospital/compatibility-rules
```

이 환경의 규칙은 두 단계로 나뉩니다.

| scope | 질문 |
| --- | --- |
| `CANDIDATE` | 이 후보가 사용자를 지원할 수 있나 (Stage A) |
| `EXECUTION_CHOICE` | 실행계획이 **실제로 고른 값**이 맞나 (Stage B) |

후보가 여러 값을 지원해도 실제로 잘못된 값을 누르면 Stage B 에서 걸립니다.

## Review Mapping 읽기

```bash
curl localhost:4000/api/v1/environments/hospital/review-mapping
```

`required: true` 필드는 반드시 값이 나와야 합니다. 못 채우면 실행이 `SAFETY_STOP` 됩니다.

## 개발 완료 체크리스트

- [ ] `npm run participant:progress` 가 9/9
- [ ] `npm run participant:validate -- --file <출력> --execute` 가 PASS
- [ ] 경고가 있다면 왜 생겼는지 설명할 수 있다
- [ ] 추천 이유가 최소 1개 있고 사람이 읽을 수 있다
- [ ] 대안·거절·직원 도움 경로가 화면에 있다
- [ ] 로그인 없이 기본 기능이 동작한다
- [ ] 실제 개인정보를 저장하지 않는다
