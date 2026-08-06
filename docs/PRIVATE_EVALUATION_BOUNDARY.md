# 공개 / 비공개 평가 경계

이 문서는 **공개 배포본(Starter ZIP)에 무엇이 들어있고 무엇이 들어있지 않은지**,
그리고 그 이유를 설명합니다. 참가팀과 운영진 모두 이 경계를 기준으로 판단합니다.

---

## 1. 한 문장 요약

> 공개 배포본은 **형식과 안전 규칙을 검증하는 도구**입니다.
> **정답과 점수는 비공개 평가에서 결정됩니다.**

공개 배포본으로 `PASS` 를 받았다는 것은 "제출 형식이 계약을 지켰고, 안전경계를
넘지 않았다" 는 뜻일 뿐, "추천이 좋았다" 는 뜻이 아닙니다.

---

## 2. 공개되는 것 (Starter ZIP 에 포함)

| 항목 | 위치 | 설명 |
| --- | --- | --- |
| Canonical Input Contract | `schemas/core/`, `packages/profile-contract` | Profile / SessionContext 형식과 공식 enum |
| 환경 Fixture | `environments/<env>/` | 화면, 상태 전환, 후보 목록, 의미 대상 |
| Canonical Input 예제 | `examples/public-canonical-input/` | Profile + SessionContext 형식 예제 (추천·실행계획 없음) |
| Sandbox 완성 예제 | `examples/submission-format-example/sandbox.json` | 연결 흐름 연습용 — 평가 대상 아님 |
| 오류 제출 예제 | `examples/invalid-submissions/` | 어떤 제출이 왜 거부되는지 학습용 |
| 제출 검증기 | `npm run check:submission` | 참가팀이 만든 제출을 검증만 함 |
| Simulation Driver | `packages/simulation-driver` | 가상 키오스크 재생 엔진 |
| Participant Starter | `examples/minimal-participant-client` | 연결 코드는 동작, 추천 로직은 TODO |
| 공개 테스트 | `tests/public/` | 계약 / 제출 검증 / sandbox |

### 공개 Canonical Input 예제에 대하여

`examples/public-canonical-input/<env>/` 의 파일은 **공식 평가 환경 3곳에 대해
`profile` 과 `sessionContext` 만** 담고 있습니다. `recommendation` 과
`executionPlan` 은 참가팀이 직접 만들어야 하므로 **의도적으로 제외**했습니다.

일부 예제는 `_expectedValidation: "REQUIRES_RECONFIRMATION"` 으로 표시되어 있습니다.
그대로 제출하면 거부되는 것이 정상이며, `UNKNOWN` 을 추론으로 메우지 않는 규칙을
가르치기 위한 예제입니다 (`docs/UNKNOWN_POLICY.md`).

---

## 3. 공개되지 않는 것 (비공개 평가 자산)

아래 항목은 **공개 저장소와 ZIP 어디에도 존재하지 않습니다.** `.gitignore` 와
패키징 allow-list 양쪽에서 차단되며, `npm run verify:public` 이 유출을 검사합니다.

| 항목 | 왜 비공개인가 |
| --- | --- |
| `hidden-profiles/` | 채점에 쓰이는 미공개 사용자 프로필 |
| `expected-results/` | 각 프로필의 기대 추천 결과 |
| `expectedRecommendation` 필드 | 후보별 정답 표시 |
| 공식 3환경의 완성 실행계획 | 참가팀이 만들어야 할 결과물 그 자체 |
| 채점 가중치 / 루브릭 상세 | 역설계 방지 |
| `kiobridge-private-evaluation/` | 위 자산을 담는 운영진 전용 저장소 |

### 왜 공식 환경의 실행계획 생성기를 제거했는가

이전 버전에는 fixture 의 transition 그래프를 걸어 유효한 실행계획을 자동으로
만들어 주는 헬퍼가 공개 테스트에 있었습니다. 이는 참가팀이 만들어야 할 결과물을
플랫폼이 대신 만들어 주는 것이므로 제거했습니다.

현재 남아 있는 생성기는 `tests/public/sandbox/sandbox-plan-builder.ts` 뿐이며,
`sandbox` 환경에서만 동작합니다. 공식 평가 환경을 넘기면 예외를 던집니다:

```
[sandbox-plan-builder] "chicken-store" 환경의 실행계획은 생성할 수 없습니다.
공식 평가 환경의 실행계획은 참가팀이 직접 개발해야 합니다.
```

---

## 4. `SIMULATION_PASS` 의 범위

Evidence 의 `result` 는 `resultScope: "SIMULATION_VALIDATION_ONLY"` 와 함께
읽어야 합니다.

| 평가 항목 | 어디서 결정되나 | 공개 배포본이 알려주는가 |
| --- | --- | --- |
| 계약 · 스키마 · enum 준수 | 공개 검증기 | 예 (PASS / FAIL) |
| 안전경계 (결제·본인확인·행정확정 미수행) | 공개 검증기 | 예 (PASS / FAIL) |
| 상태 전환 정합성 | 공개 검증기 | 예 (PASS / FAIL) |
| 추천 품질 | 비공개 프로필 채점 | 아니오 |
| 접근성 UX | 심사위원 | 아니오 |
| 창의성 · 완성도 | 심사위원 | 아니오 |

`SIMULATION PASS` 는 **제출 자격 요건**이지 순위가 아닙니다.

---

## 5. 참가팀을 위한 체크리스트

- [ ] `npm run check:submission -- --file <내 제출>` 이 통과하는가
- [ ] 공식 3환경 각각에 대해 내가 만든 `recommendation` 과 `executionPlan` 이 있는가
- [ ] `UNKNOWN` 을 임의로 메우지 않았는가
- [ ] 결제 · 본인확인 완료 · 행정처리 확정 Action 이 계획에 없는가
- [ ] 사용자 승인 없이 action 을 넣지 않았는가
- [ ] 추천 이유와 제외 사유를 사람이 읽을 수 있게 적었는가

---

## 6. 운영진을 위한 메모

비공개 평가 자산은 별도 저장소(`kiobridge-private-evaluation`)에 두고, 공개
저장소에는 **참조조차 남기지 않습니다.** 공개 ZIP 을 만들기 전 반드시 실행하세요:

```bash
npm run verify:public
```

이 검사는 비공개 키워드 유출, 공식 환경 실행계획 생성기, 절대경로, `node_modules`
와 `dist` 포함 여부를 함께 확인합니다.

관련 문서: [WHAT_YOU_BUILD.md](WHAT_YOU_BUILD.md) · [WHAT_WE_PROVIDE.md](WHAT_WE_PROVIDE.md) · [UNKNOWN_POLICY.md](UNKNOWN_POLICY.md)
