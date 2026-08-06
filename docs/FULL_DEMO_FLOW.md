# 전체 데모 흐름

참가팀 서비스와 KioBridge 공식 플랫폼이 어떻게 맞물리는지, 처음부터 끝까지.

---

## 전체 그림

```
[참가팀이 만드는 것]                    [KioBridge 공식 플랫폼]

  사용자
    │ 정보 제공 (방식 자유)
    ▼
  ① 수집 인터페이스
    │
    ▼
  ② Canonical 변환                      환경 Fixture 제공
    │  profile + sessionContext    ◀──── GET /api/v1/environments/:id/fixture
    ▼
  ③ 후보 필터링 + 추천
    │  recommendation
    ▼
  ④ 사용자에게 설명 → 승인
    │  userDecision
    ▼
  ⑤ 의미 기반 실행계획
    │  executionPlan
    │
    └──── POST /sessions/:id/submission ────▶  ⑥ 계약 검증
                                                   │
                                                   ▼
                                               ⑦ 안전 검증
                                                   │
                                                   ▼
                                               ⑧ 가상 키오스크 재생
                                                   │
                                                   ▼
                                               ⑨ 검토 경계에서 정지
                                                   │
                                                   ▼
                                               ⑩ Evidence 생성
                                                   │
    ◀──────────────────────────────────────────────┘
  결과 확인 (SIMULATION PASS / FAIL)
```

참가팀은 ①~⑤ 를, KioBridge 는 ⑥~⑩ 을 담당합니다. 이 경계는 넘나들지 않습니다.

---

## 단계별 상세

### ① 정보 수집 — 형식 자유

웹폼, 모바일 앱, 음성 대화, AI 챗봇, 보호자 대리입력 — 무엇이든 됩니다.
이 단계는 계약의 제약을 받지 않습니다.

### ② Canonical 변환 — 여기부터 계약

수집한 값을 두 덩어리로 나눕니다.

| | Profile | SessionContext |
| --- | --- | --- |
| 성격 | 오래 유지 | 이번 세션만 |
| 예 | 큰 글씨 필요, 선호 입력수단, 언어 | 오늘은 포장, 예약 있음, 필요한 민원 |

SessionContext 안에서도 섹션이 다릅니다. 섞으면 `DOMAIN_CONTEXT_MISMATCH` 입니다.

| 섹션 | 뜻 | 예 |
| --- | --- | --- |
| `intent` | 무엇을 하러 왔는가 | `ORDER_FOOD` |
| `facts` | 확인된 사실 | `visitType: REVISIT` |
| `preferences` | 선호 (양보 가능) | `spicyLevel: HOT` |
| `hardConstraints` | 절대 조건 (양보 불가) | `allergenIds: ["PEANUT"]` |
| `capabilities` | 가능한 수단 | `availableAuthMethods` |
| `fieldMetadata` | 각 값의 출처·신뢰도 | `confidence: 0.72` |

모르는 값은 추측하지 마세요. `UNKNOWN`, 누락, `NO_PREFERENCE`,
`NOT_APPLICABLE` 은 서로 다른 뜻입니다 ([UNKNOWN_POLICY.md](UNKNOWN_POLICY.md)).

### ③ 필터링과 추천

```
전체 후보
  → hardConstraints 위반 제거   (점수를 깎는 게 아니라 후보에서 뺍니다)
  → 품절(available=false) 제거
  → 남은 것 중 순위 결정         (가중치 설계는 참가팀의 몫이자 심사 대상)
  → 1순위 + 대안 + 제외 사유
```

### ④ 설명과 승인

사용자가 이해할 수 있는 말로 "왜 이것인지" 와 "무엇을 만족하지 못했는지" 를
보여주고 승인을 받습니다.

승인 없이 만든 실행계획은 `ACTIONS_WITHOUT_APPROVAL` 로 거부됩니다.
사용자가 거절하면 `actions` 는 빈 배열이어야 합니다.

### ⑤ 의미 기반 실행계획

좌표나 키오스크 컨트롤 ID 를 쓰지 않습니다. **의미**를 제출합니다.

```json
{ "actionIndex": 1, "action": "select_menu",
  "target": { "kind": "candidate", "id": "<후보ID>" },
  "expectedBeforeState": "MENU_SELECTION",
  "expectedAfterState": "OPTION_SELECTION" }
```

`fixture.screens` 의 transitions 를 따라가며 상태를 채우고,
`manifest.reviewBoundaryState` 에서 멈춘 뒤 필수 verifier 를 실행합니다.

### ⑥ 계약 검증 (서버)

스키마, enum, 버전, PII, 섹션 배치를 검사합니다. 실패하면 여기서 끝입니다.

### ⑦ 안전 검증 (서버)

- 결제 Action 이 계획에 있는가 → 있으면 **차단되어도 FAIL**
- 본인확인 완료 / 행정처리 확정 Action 이 있는가
- 사용자 승인 없이 action 이 있는가
- 알레르기 등 hardConstraint 를 위반하는 후보인가

### ⑧ 가상 키오스크 재생

Simulation Driver 가 실제로 화면을 넘기며 이벤트를 냅니다.

```
TARGET_PRESSED → SCREEN_TRANSITION_COMPLETED → ... → VERIFIER_EXECUTED → RUN_STOPPED
```

브라우저에서 이 과정을 눈으로 볼 수 있습니다. 브라우저는 **재생만** 하고
상태머신이나 Evidence 를 다시 계산하지 않습니다 — 판정은 서버가 합니다.

### ⑨ 검토 경계 정지

결제 직전, 본인확인 완료 직전, 행정처리 확정 직전에서 멈춥니다.
`actualDeviceCommandSent` 는 언제나 `false` 입니다 — 실제 키오스크에는
아무것도 전달되지 않습니다.

### ⑩ Evidence

```json
{
  "result": "PASS",
  "resultScope": "SIMULATION_VALIDATION_ONLY",
  "stopType": "NORMAL_BOUNDARY_STOP",
  "boundaryReached": true,
  "requiredVerifierExecuted": true,
  "plannedPaymentActionCount": 0,
  "actualDeviceCommandSent": false,
  "driverId": "SIMULATION"
}
```

이 결과가 뜻하는 범위는 [PASS_SCOPE.md](PASS_SCOPE.md) 를 보세요.

---

## Driver 교체 — 오늘과 나중

같은 실행계획이 드라이버만 바꿔 그대로 돕니다.

| Driver | 상태 | 하는 일 |
| --- | --- | --- |
| `SIMULATION` | `READY` | 디지털 트윈 재생 (지금) |
| `UPRLITE` | `PENDING_REAL_DEVICE` | 실제 키오스크 (계약만 존재) |

참가팀 코드는 어느 쪽이든 바꿀 필요가 없습니다. 의미 기반 계약 덕분입니다.

> 이 키트는 **시뮬레이션 전용**입니다. 실제 Windows 키오스크, VoiceBridge,
> UPRLite, 결제 시스템, 병원 접수 시스템, 행정 시스템에 연결하지 않습니다.

---

## 직접 돌려보기

```bash
npm run dev                                    # 플랫폼 실행
npm run demo:client                            # sandbox 왕복 (완성 예제)
npm run dev:client                             # 내 구현으로 실행
npm run check:submission -- --file ./sub.json  # 제출물 검증
```

---

관련 문서: [ARCHITECTURE.md](ARCHITECTURE.md) · [API_CONTRACT.md](API_CONTRACT.md) · [SAFETY_POLICY.md](SAFETY_POLICY.md)
