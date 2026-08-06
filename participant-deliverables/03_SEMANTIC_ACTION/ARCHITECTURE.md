<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# ARCHITECTURE

## 핵심 원칙

1. 공식 시뮬레이터는 **추천을 만들지 않습니다.** 참가팀 결과를 받아 검증 → 재생 → Evidence.
2. 시뮬레이션과 향후 실기기 연동이 **동일한 데이터 계약과 실행구조**를 사용합니다.
3. 실기기 단계에서는 **Driver 만 교체**합니다.

```
참가팀 서비스 (별도)                       공식 KioBridge 플랫폼
─────────────────                        ──────────────────────────────────
프로필 생성                                GET  /api/v1/environments
후보 필터링 / 추천 / 이유                   GET  /api/v1/environments/:id/fixture
사용자 승인                     ── 제출 ──▶ POST /api/v1/sessions
의미 기반 실행계획                          POST /api/v1/sessions/:id/submission
                                          POST /api/v1/sessions/:id/validate  (schema+semantics+dry-run)
                                          POST /api/v1/sessions/:id/execute   (engine + Driver)
                                          GET  /api/v1/sessions/:id/run       (events, uiState)
                                          GET  /api/v1/sessions/:id/evidence
```

## Driver 추상화 (이번 단계의 핵심)

```
                       참가팀 의미 기반 실행계획 (동일)
                                   │
                    ┌──────────────▼───────────────┐
                    │  Execution Engine (evaluator)│  상태·안전 검증 = driver-agnostic
                    │  state-engine + safety-engine│
                    └──────────────┬───────────────┘
                                   │  KioskDriver 인터페이스
                    ┌──────────────┴───────────────┐
                    ▼                              ▼
        SimulationDriver (READY)        UPRLiteDriver (PENDING_REAL_DEVICE)
        가상 화면/버튼/카드/장바구니        UIA·OCR·좌표·Agent 명령 (계약만)
```

| Driver 무관 (공통) | Driver 별로 다름 |
| --- | --- |
| Environment Manifest, Screen State, Candidate, Option Group, Semantic Action, Transition, Safety Rule, Execution Plan, Verification Result, Evidence | Simulation: 레이아웃·가상 버튼·선택효과·가상 장바구니/접수검토/민원검토 · UPRLite: UIA·OCR·좌표·화면 캡처·Agent 명령 |

`KioskDriver` 인터페이스: `initialize` · `resolveTarget` · `execute` · `verify` · `stop`
([packages/kiosk-driver-contract](../../packages/kiosk-driver-contract/src/index.ts)).

## 의미 기반 Action

참가팀은 좌표/컨트롤 ID 대신 **의미**를 제출합니다.

```json
{ "actionIndex": 1, "action": "select_menu",
  "target": { "kind": "candidate", "id": "<후보ID>" },
  "expectedBeforeState": "MENU_SELECTION", "expectedAfterState": "OPTION_SELECTION" }
```

`kind` 해석 규칙: `candidate` → candidates.json, `option` → `groupId` 의 option-groups,
그 외 열거형 kind → 대문자 groupId(`service_type` → `SERVICE_TYPE`), `review`/`staff` → 화면 자체.

## 환경팩 구조 (공통 / 바인딩 분리)

```
environments/<id>/
├── manifest.json        # 상태·경계·verifier·허용/금지 Action   ┐
├── screens.json         # 상태별 title/targetKinds/progress      │ driver-agnostic
├── candidates.json      # 후보(+supportedOptions)                │ (좌표·UIA 없음)
├── option-groups.json   # 옵션 그룹/값                           │
├── transitions.json     # 상태 전환                              │
├── safety-rules.json    # 안전규칙                               ┘
└── bindings/
    ├── simulation.binding.json   # 레이아웃 템플릿 (좌표 아님)
    └── uprlite.binding.json      # 실기기 데이터 자리 (현재 PENDING_REAL_DEVICE)
```

환경은 파일시스템에서 **자동 발견**됩니다 — 새 팩을 넣으면 목록에 나타납니다.

## 실행 이벤트 & 서버 권위

Driver 는 Action 마다 이벤트를 만들고, 서버가 이를 저장합니다. 웹은 그 이벤트를 순서대로
재생만 합니다(상태 머신·Evidence 재계산 없음).

`TARGET_RESOLVED → TARGET_HIGHLIGHTED → TARGET_PRESSED → VALUE_APPLIED →
SCREEN_TRANSITION_STARTED → SCREEN_TRANSITION_COMPLETED → REVIEW_UPDATED →
VERIFIER_EXECUTED → RUN_STOPPED`

각 이벤트는 그 시점의 `uiState` 스냅샷(before/after)을 포함하므로 화면 복원이 가능합니다.

## STOP 은 두 종류

- **NORMAL_BOUNDARY_STOP** — 검토 경계 도달 + 필수 verifier 실행. PASS 후보.
- **SAFETY_STOP** — 오류/위반/불완전. FAIL.

`stateHistory` 에 `STOP` 을 강제로 덧붙이지 않으며, `terminalState` 는 별도 필드입니다.

## 실기기 전환 시 바뀌는 것

`bindings/uprlite.binding.json` 을 채우고 Driver 를 교체하면 끝입니다. 공통 상태·Action·후보·
옵션·안전규칙과 **참가팀 실행계획은 수정하지 않습니다.** Evidence 에는 `driverId` 와
`driverStatus` 가 기록되어 어떤 드라이버로 실행됐는지 감사할 수 있습니다.
