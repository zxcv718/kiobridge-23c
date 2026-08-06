<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# WHAT WE PROVIDE (공식 플랫폼이 제공하는 것)

> **참가팀은 좌표나 실제 키오스크 컨트롤을 다루지 않습니다.
> 사용자에게 필요한 메뉴 또는 업무와 그 진행순서를
> 의미 기반 실행계획으로 작성합니다.**
>
> **공식 시뮬레이터는 이 계획을 가상 키오스크 화면에 적용합니다.**

---

| 제공 항목 | 내용 |
| --- | --- |
| **환경 Fixture** | 닭강정·병원·관공서 + 연습용 sandbox. 상태·후보·옵션그룹·전환·안전규칙 |
| **가상 키오스크** | 세로형 키오스크 화면. 선택/강조/전환/검토가 실제로 반영됨 |
| **공통 상태 머신** | `packages/state-engine` — 의미와 상태 전환만 검증 |
| **안전규칙** | `packages/safety-engine` — 참가팀이 우회할 수 없음 |
| **Simulation Driver** | `packages/simulation-driver` — 의미 기반 Action → 가상 화면 제어 |
| **실행 재생** | 서버가 만든 실행 이벤트를 웹이 순서대로 애니메이션 |
| **Evidence** | 서버에서 한 번만 생성. 사용한 Driver 가 기록됨 |
| **SDK** | `packages/participant-sdk` — 전송·타입만 (추천 로직 없음) |
| **공개 테스트** | 계약·안전 준수 검사 (추천 정답 ID 비공개) |

---

## Driver 추상화 — 오늘과 내일이 같은 계약

```
참가팀 의미 기반 실행계획
        │  (동일)
        ▼
공식 Execution Engine  ── 상태·안전 검증 (driver-agnostic)
        │
        ├─▶ SimulationDriver   ← 지금: 가상 키오스크 (READY)
        └─▶ UPRLiteDriver      ← 향후: UIA/OCR/좌표 (PENDING_REAL_DEVICE, 계약만)
```

**Driver 와 무관하게 동일한 것:** Environment Manifest · Screen State · Candidate ·
Option Group · Semantic Action · Transition · Safety Rule · Execution Plan ·
Verification Result · Evidence.

**Driver 마다 다른 것:**
- Simulation — 화면 레이아웃, 가상 버튼/메뉴 카드/선택효과, 가상 장바구니·접수검토·민원검토
- UPRLite — UIA 식별정보, OCR 결과, 좌표, 화면 캡처, Windows Agent 명령

실기기 데이터가 준비되면 **`environments/<id>/bindings/uprlite.binding.json` 만 채우면 됩니다.**
공통 상태·Action·후보·옵션·안전규칙과 참가팀 실행계획은 그대로입니다
([ENVIRONMENT_PACK_GUIDE](../01_ENVIRONMENT_AND_FIXTURE/ENVIRONMENT_PACK_GUIDE.md) 참고).

> 현재 UPRLite Driver 는 **인터페이스와 데이터 형식만** 정의되어 있고 실제 Windows 입력은
> 구현되어 있지 않습니다(호출 시 예외). `actualDeviceCommandSent` 는 항상 `false` 입니다.

## 실행 이벤트

각 Action 은 다음 순서의 이벤트로 표현되어 화면에서 관찰됩니다:

`TARGET_RESOLVED → TARGET_HIGHLIGHTED → TARGET_PRESSED → VALUE_APPLIED →
SCREEN_TRANSITION_STARTED → SCREEN_TRANSITION_COMPLETED → REVIEW_UPDATED →
VERIFIER_EXECUTED → RUN_STOPPED`

버튼 강조 → 눌림 → 값 적용 → 화면 전환을 사용자가 눈으로 확인할 수 있습니다.

## 서버가 유일한 권위

검증·실행·Evidence 는 모두 `apps/simulation-api` 에서 수행합니다. 브라우저는 서버가 만든
UI 상태와 이벤트를 **그리기만** 하며, 상태 머신이나 Evidence 를 다시 계산하지 않습니다.

## 화면 템플릿

`bindings/simulation.binding.json` 이 좌표 대신 레이아웃 템플릿을 지정합니다:
`LANDING` · `TWO_COLUMN_SELECTION` · `FOUR_CARD_GRID` · `OPTION_GROUP_LIST` ·
`ORDER_REVIEW` · `HOSPITAL_REVIEW` · `PUBLIC_SERVICE_REVIEW` · `BASIC_SANDBOX_REVIEW`.

> 세로형 키오스크 흐름을 참고해 구성했으며, 실제 화면의 1:1 복제가 아닙니다.
