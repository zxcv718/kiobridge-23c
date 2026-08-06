<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# PASS 의 범위 — 무엇을 통과한 것인가

`SIMULATION PASS` 를 받았다고 해서 해커톤에서 좋은 점수를 받는 것은 아닙니다.
이 문서는 두 가지를 분명히 구분합니다.

---

## 1. 한눈에 보기

```
Evidence.result = PASS
        │
        └── resultScope: SIMULATION_VALIDATION_ONLY
                 │
                 ├── 계약 · 스키마 · enum 준수      ✔ 자동 판정
                 ├── 안전경계 미침범                ✔ 자동 판정
                 ├── 상태 전환 정합성              ✔ 자동 판정
                 └── 경계 도달 + 필수 verifier 실행  ✔ 자동 판정

해커톤 점수
        ├── 추천 품질        → 비공개 프로필 채점  (공개 배포본은 알려주지 않음)
        ├── 접근성 UX        → 심사위원 평가
        └── 창의성 · 완성도   → 심사위원 평가
```

---

## 2. Evidence 의 네 필드

제출을 실행하면 Evidence 에 다음이 함께 기록됩니다.

```json
{
  "result": "PASS",
  "resultScope": "SIMULATION_VALIDATION_ONLY",
  "simulationValidation": {
    "result": "PASS",
    "contractValid": true,
    "safetyValid": true,
    "stateTransitionValid": true,
    "boundaryReached": true,
    "requiredVerifierExecuted": true
  },
  "recommendationEvaluation": { "status": "NOT_EVALUATED_PUBLICLY" },
  "hackathonEvaluation": { "status": "PRIVATE_AND_JUDGE_EVALUATION_REQUIRED" }
}
```

| 필드 | 읽는 법 |
| --- | --- |
| `result` | **시뮬레이션 검증** 결과입니다. 점수가 아닙니다. |
| `resultScope` | 항상 `SIMULATION_VALIDATION_ONLY` — 범위를 못 박습니다. |
| `simulationValidation` | PASS/FAIL 이 어느 항목에서 갈렸는지 보여줍니다. |
| `recommendationEvaluation` | 공개 배포본은 추천 품질을 채점하지 않습니다. |
| `hackathonEvaluation` | 최종 점수는 비공개 채점 + 심사위원 평가로 결정됩니다. |

---

## 3. PASS 가 보장하는 것

- 제출 형식이 Canonical Input Contract 를 지켰습니다.
- 사용하지 말아야 할 값(자유 문자열, 비공식 enum)이 없습니다.
- 결제 · 본인확인 완료 · 행정처리 확정 Action 을 **계획에 넣지 않았습니다.**
- 사용자 승인 없이 action 을 만들지 않았습니다.
- 실행계획이 화면 상태 전환과 어긋나지 않습니다.
- 검토 경계(`reviewBoundaryState`)에서 멈췄고 필수 verifier 를 실행했습니다.

## 4. PASS 가 보장하지 않는 것

- 추천한 후보가 사용자에게 **적절한지**
- 제외 사유와 추천 이유가 **납득 가능한지**
- 접근성 요구를 **실제로 반영했는지**
- UX 가 **쓸 만한지**
- 아이디어가 **독창적인지**

이 다섯 가지가 해커톤 점수의 대부분입니다.

---

## 5. FAIL 이지만 좋은 제출, PASS 지만 나쁜 제출

**FAIL 인데 방향은 옳은 경우** — 추천 로직은 훌륭한데 verifier 를 빠뜨림.
→ 형식 문제이므로 고치면 됩니다. `npm run check:submission` 이 어디가 문제인지 알려줍니다.

**PASS 인데 나쁜 경우** — 사용자가 땅콩 알레르기라고 했는데 그냥 제일 싼 메뉴를
추천했고, 우연히 그 메뉴에 땅콩이 없어서 통과. 형식은 맞지만 추천 근거가 없습니다.
→ 비공개 채점에서 드러납니다.

---

## 6. STOP 은 PASS 가 아닙니다

실행이 멈췄다는 사실만으로는 통과가 아닙니다.

| stopType | 의미 | 결과 |
| --- | --- | --- |
| `NORMAL_BOUNDARY_STOP` | 경계에 도달했고 verifier 도 실행함 | PASS 가능 |
| `SAFETY_STOP` | 오류·금지 Action·불완전 계획으로 중단 | 항상 FAIL |

또한 결제 Action 은 **차단되어도 FAIL** 입니다.
`plannedPaymentActionCount > 0` 이면 실행되지 않았더라도 실패로 봅니다.
"막혔으니 괜찮다" 가 아니라 "애초에 계획하지 않는다" 가 기준입니다.

---

관련 문서: [PRIVATE_EVALUATION_BOUNDARY.md](../00_START_HERE/PRIVATE_EVALUATION_BOUNDARY.md) · [SAFETY_POLICY.md](../05_SAFETY_AND_BOUNDARY/SAFETY_POLICY.md) · [WHAT_YOU_BUILD.md](../00_START_HERE/WHAT_YOU_BUILD.md)
