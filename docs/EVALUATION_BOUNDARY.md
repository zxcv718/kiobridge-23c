# EVALUATION BOUNDARY (공개 · 비공개 데이터 경계)

## 공개 저장소에 포함하는 것

환경 설명, 테스트 목적, 공개 후보(candidates), 금지조건, 제출 스키마, 안전규칙, 공개 Fixture,
PASS 의 일반 조건, 형식 예제(submission-format-example), 오류 예제(invalid-submissions).

## 공개 저장소에 포함하지 않는 것 (비공개 평가로 분리)

- 숨겨진 평가 프로필(hidden profiles)
- 숨겨진 조건 조합(hidden scenarios)
- 정확한 허용 정답 집합 / expectedRecommendation
- 심사용 비공개 실행계획
- 비공개 테스트(private-tests) / expected-results
- 실제 심사 가중치 내부값

이 데이터는 별도 저장소에 둡니다:

```
kiobridge-private-evaluation/
├── hidden-profiles/
├── hidden-scenarios/
├── expected-results/
├── private-tests/
└── evaluation-runner/
```

`.gitignore` 가 `kiobridge-private-evaluation/`, `hidden-profiles/`, `hidden-scenarios/`,
`expected-results/`, `private-tests/` 를 차단합니다. 회귀 테스트가 공개 트리에
`expectedRecommendation` 문자열과 `environments/*/scenarios` 가 **없음**을 강제합니다.

## 정적 예제의 위치

`examples/submission-format-example` 는 **형식 데모**이며 추천 모범답안이 아닙니다. 실제 평가는
위 비공개 데이터로만 이뤄집니다. 공개 테스트는 특정 추천 ID 를 정답으로 고정하지 않고
계약·안전 준수만 검사합니다.
