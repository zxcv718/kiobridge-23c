# 닭강정 가게 — 참가팀 가이드

`[필수]` 환경 ID: `chicken-store` · 공식 평가 환경

> 이 문서는 **무엇을 수집해야 하는지**와 **무엇을 하면 안 되는지**를 알려줍니다.
> 어떤 후보를 고르라거나 어떻게 점수를 매기라고 말하지 않습니다. 그것이 여러분의 몫이자 심사 대상입니다.

## 1. 이 환경이 해결하려는 문제

메뉴가 많고 옵션이 겹쳐 고르기 어렵습니다. 알레르기가 있는 사람은
매번 성분을 확인해야 하고, 글씨가 작아 읽기 힘든 경우도 많습니다.

## 2. 참가팀이 수집할 수 있는 정보

- 매장에서 먹을지 포장할지
- 알레르기 (있다면 어떤 것)
- 예산 상한
- 맵기 선호
- 뼈 유무 선호
- 컵 선택
- 수량
- 접근성 요구 (큰 글씨, 쉬운 단계 등)

수집 방법은 자유입니다 — 웹폼·음성·QR·챗봇·보호자 대리입력 무엇이든 됩니다.

## 3. Profile 에 들어가는 값 (오래 유지)

오래 유지되는 값만 넣습니다.

- `accessibility.largeText`, `simpleSteps`, `highContrast` …
- `interaction.preferredInput`, `language: "ko-KR"`
- `consent.personalization`, `retentionPolicy`

**오늘 뭘 먹을지는 profile 이 아닙니다.**

## 4. SessionContext 에 들어가는 값 (이번 이용만)

| 섹션 | 이 환경에서 |
| --- | --- |
| `intent.task` | `ORDER_FOOD` |
| `preferences` | `serviceType` · `spicyLevel` · `boneType` · `cupOption` · `quantity` |
| `hardConstraints` | `allergenIds` · `maxPriceKrw` |
| `capabilities` | (이 환경에서는 거의 쓰지 않음) |
| `facts` | (이 환경에서는 거의 쓰지 않음) |

**알레르기는 preferences 가 아니라 hardConstraints 입니다.** 양보할 수 없기 때문입니다.

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
curl localhost:4000/api/v1/environments/chicken-store/fixture
```

- `candidates[].attributes.allergenIds` — 이 메뉴에 든 알레르겐
- `candidates[].price` — 가격 상한 비교용
- `candidates[].available` — 품절 여부
- `candidates[].supportedOptions` — 이 메뉴가 지원하는 옵션
- `optionGroups` — `SERVICE_TYPE` · `SPICY_LEVEL` · `BONE_TYPE` · `CUP` · `QUANTITY`

## 7. 금지되는 추론

- 알레르기가 UNKNOWN 인데 "괜찮겠지" 하고 진행
- 품절 메뉴 추천
- 예산을 넘는 메뉴를 "조금 비싸지만" 으로 추천
- 결제 Action 을 계획에 넣기 (**계획에만 있어도 FAIL**)

## 8. 대표적인 오류코드

`ALLERGEN_CONFLICT` · `PRICE_LIMIT_EXCEEDED` · `CANDIDATE_UNAVAILABLE`
`SELECTED_SERVICE_TYPE_MISMATCH` (경고) · `SELECTED_SPICY_LEVEL_MISMATCH` (경고)
`SELECTED_BONE_TYPE_MISMATCH` (경고) · `SELECTED_QUANTITY_MISMATCH` (차단)
`EXECUTION_REQUIRED_OPTION_MISSING` · `FORBIDDEN_ACTION`

전체 목록: [../ERROR_CATALOG.md](../ERROR_CATALOG.md)

## Compatibility Rules 읽기

```bash
curl localhost:4000/api/v1/environments/chicken-store/compatibility-rules
```

이 환경의 규칙은 두 단계로 나뉩니다.

| scope | 질문 |
| --- | --- |
| `CANDIDATE` | 이 후보가 사용자를 지원할 수 있나 (Stage A) |
| `EXECUTION_CHOICE` | 실행계획이 **실제로 고른 값**이 맞나 (Stage B) |

후보가 여러 값을 지원해도 실제로 잘못된 값을 누르면 Stage B 에서 걸립니다.

## Review Mapping 읽기

```bash
curl localhost:4000/api/v1/environments/chicken-store/review-mapping
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
