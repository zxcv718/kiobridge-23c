# 관공서 민원 — 참가팀 가이드

`[필수]` 환경 ID: `public-office` · 공식 평가 환경

> 이 문서는 **무엇을 수집해야 하는지**와 **무엇을 하면 안 되는지**를 알려줍니다.
> 어떤 후보를 고르라거나 어떻게 점수를 매기라고 말하지 않습니다. 그것이 여러분의 몫이자 심사 대상입니다.

## 1. 이 환경이 해결하려는 문제

필요한 서류와 인증수단을 모른 채 키오스크 앞에 서게 됩니다.
가진 인증수단으로 처리할 수 없는 업무를 고르면 처음부터 다시 해야 합니다.

## 2. 참가팀이 수집할 수 있는 정보

- 어떤 업무를 보러 왔는지
- 민원 카테고리
- **쓸 수 있는 인증수단** (신분증·모바일 인증 등)
- 필요한 접근성 지원
- 단계별 안내가 필요한지

수집 방법은 자유입니다 — 웹폼·음성·QR·챗봇·보호자 대리입력 무엇이든 됩니다.

## 3. Profile 에 들어가는 값 (오래 유지)

- `accessibility.largeText`, `simpleSteps`, `staffAssistancePreferred` …
- `interaction.preferredInput`, `language: "ko-KR"`

## 4. SessionContext 에 들어가는 값 (이번 이용만)

| 섹션 | 이 환경에서 |
| --- | --- |
| `intent.task` | `PUBLIC_SERVICE_GUIDANCE` |
| `intent.requestedServiceId` | 사용자가 특정 업무를 지목했다면 |
| `facts` | `serviceCategory` |
| `preferences` | `stepByStep` · `simpleLanguage` |
| `hardConstraints` | `legalEligibilityInferenceAllowed: false` |
| `capabilities` | **`availableAuthMethods`** |

**인증수단은 capabilities 입니다.** 선호가 아니라 "쓸 수 있는 수단" 이기 때문입니다.

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
curl localhost:4000/api/v1/environments/public-office/fixture
```

- `candidates[].requirements.authenticationMethods` — 이 업무에 필요한 인증수단
- `candidates[].supportedOptions.CATEGORY` — 민원 분야
- `optionGroups` — `CATEGORY` · `AUTH_METHOD`

사용자의 `availableAuthMethods` 와 후보의 `authenticationMethods` 의 **교집합**이
1개 이상이어야 합니다.

## 7. 금지되는 추론

- **법적 자격·지원금 수급 가능성 판단**
- `availableAuthMethods` 가 비었거나 UNKNOWN 인데 임의로 인증수단 선택
- 사용자가 지목한 서비스를 임의로 "비슷한 것" 으로 바꾸기
- 실제 민원 신청·실제 본인확인

모르면 재확인하거나 `STAFF_ASSIST` 경로를 쓰세요.

## 8. 대표적인 오류코드

`AUTH_METHOD_UNAVAILABLE` · `SELECTED_AUTH_METHOD_UNAVAILABLE`
`REQUESTED_SERVICE_MISMATCH` · `SELECTED_SERVICE_MISMATCH`
`LOW_CONFIDENCE_RECONFIRMATION_REQUIRED` · `REVIEW_FIELD_UNRESOLVED`

전체 목록: [../ERROR_CATALOG.md](../ERROR_CATALOG.md)

## Compatibility Rules 읽기

```bash
curl localhost:4000/api/v1/environments/public-office/compatibility-rules
```

이 환경의 규칙은 두 단계로 나뉩니다.

| scope | 질문 |
| --- | --- |
| `CANDIDATE` | 이 후보가 사용자를 지원할 수 있나 (Stage A) |
| `EXECUTION_CHOICE` | 실행계획이 **실제로 고른 값**이 맞나 (Stage B) |

후보가 여러 값을 지원해도 실제로 잘못된 값을 누르면 Stage B 에서 걸립니다.

## Review Mapping 읽기

```bash
curl localhost:4000/api/v1/environments/public-office/review-mapping
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
