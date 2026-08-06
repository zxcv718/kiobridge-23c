# WHAT YOU BUILD (참가팀이 만드는 것)

참가팀은 키오스크 자체를 다시 만드는 팀이 아닙니다. 키오스크 앞에서 겪는 정보 입력·탐색·이해·선택의 어려움을 줄이는 **사용자 접점**을 만듭니다.

> **참가팀은 좌표나 실제 키오스크 컨트롤을 다루지 않습니다.
> 사용자에게 필요한 메뉴 또는 업무와 그 진행순서를
> 의미 기반 실행계획으로 작성합니다.**
>
> **공식 시뮬레이터는 이 계획을 가상 키오스크 화면에 적용합니다.**

---

## 여러분이 개발하는 것

| 항목 | 설명 |
| --- | --- |
| **프로필 UI** | 사용자 입력 방식(터치·음성·다국어 등)은 자유롭게 설계 |
| **추천 기능** | 후보 필터링, 순위 계산, 대체안 — 알고리즘 제한 없음 |
| **추천 이유** | 왜 이 후보인지, 무엇이 제외됐는지 설명 |
| **사용자 승인** | 승인·거절·조건수정 UX |
| **의미 기반 실행계획** | 어떤 후보/옵션을 어떤 순서로 선택할지 |
| **공식 API 연결** | 세션 생성 → 제출 → 검증 → 실행 → Evidence |

기술 스택은 자유입니다(React/Vue/Svelte/Next/Spring/FastAPI/Flask…). HTTP 요청만 가능하면 됩니다.

---

## 의미 기반 Action 이란

컨트롤 ID나 좌표 대신 **무엇을 선택할지**를 씁니다.

```json
{ "actionIndex": 0, "action": "select_service",
  "target": { "kind": "service_type", "id": "TAKE_OUT" },
  "expectedBeforeState": "SERVICE_TYPE", "expectedAfterState": "MENU_SELECTION" }

{ "actionIndex": 1, "action": "select_menu",
  "target": { "kind": "candidate", "id": "<후보ID>" },
  "expectedBeforeState": "MENU_SELECTION", "expectedAfterState": "OPTION_SELECTION" }

{ "actionIndex": 2, "action": "select_option",
  "target": { "kind": "option", "groupId": "SPICY_LEVEL", "id": "HOT" },
  "expectedBeforeState": "OPTION_SELECTION", "expectedAfterState": "OPTION_SELECTION" }
```

`target.kind` 는 `candidate` · `option` · 그리고 환경이 정의한 열거형(`service_type`,
`visit_type`, `appointment`, `department`, `support`, `category`, `auth_method`, `review`, `staff`)
입니다. **`automationId`, `coordinate`, `btn…` 같은 값은 스키마가 거부합니다.**

값의 목록은 Fixture 에서 확인하세요:

```bash
curl http://localhost:4000/api/v1/environments/chicken-store/fixture
```

- `candidates[]` — 선택 가능한 후보(+`supportedOptions`: 이 후보가 지원하는 옵션)
- `optionGroups[]` — 옵션 그룹과 값 id
- `screens[].targetKinds` — **그 화면에서 선택할 수 있는 대상 종류**
- `transitions[]` — 어떤 상태에서 어떤 action 이 어디로 가는지
- `manifest.reviewBoundaryState / requiredVerifierAction` — 어디까지 가고 무엇으로 마무리할지

## 계획이 통과하려면

- 추천 후보가 존재하고 `available=true`
- **실행계획에 추천 후보 선택 Action 이 정확히 한 번** 존재하고 추천과 일치
- 옵션 그룹·값이 존재하고, **후보가 그 옵션을 지원**하며, 필수 옵션을 모두 충족
- 각 Action 이 현재 상태에서 허용되고 `expectedBeforeState` / `expectedAfterState` 가 일치
- 검토 경계 상태에 도달하고 **필수 verifier(읽기 전용)** 를 실행
- verifier 이후 추가 Action 없음, 결제/실제처리 Action 없음

검증은 `POST /api/v1/sessions/:id/validate` 가 Action 단위로 알려줍니다.

## 연습은 sandbox 에서

평가 환경을 건드리지 않고 전체 연결 흐름을 연습할 수 있습니다.

```bash
curl -X POST localhost:4000/api/v1/sessions -H 'content-type: application/json' -d '{"environmentId":"sandbox"}'
```

형식 예제: [`examples/submission-format-example/sandbox.json`](../examples/submission-format-example/sandbox.json)
(추천 정답이 아니라 **형식** 예제입니다.)

## 창의적 확장

핵심 객체는 엄격하지만 `extensions` 아래는 자유입니다 —
[EXTENSION_GUIDE](EXTENSION_GUIDE.md) 참고.

---

자세한 API 는 [API_CONTRACT](API_CONTRACT.md), 단계별 안내는
[PARTICIPANT_GUIDE](PARTICIPANT_GUIDE.md) 를 보세요.

## 로그인·저장·개인정보 정책

| 구분 | 내용 |
| --- | --- |
| Example UI | 로그인 없이 동작하는 **Sandbox 참고 예제**입니다. 공식 정답이 아닙니다. |
| 참가팀 자유 | 로그인, 기기 내 프로필 저장, QR, 음성, 카메라, OCR, 보호자 입력 등을 **선택적으로 자유롭게** 구현할 수 있습니다. |
| 반드시 지킬 것 | 로그인 기능은 금지되지 않지만, **로그인하지 않아도 서비스의 핵심 기능을 사용할 수 있어야 합니다.** |
| 심사 데이터 | 해커톤·심사·시뮬레이션에서는 실제 개인정보가 아닌 **가상·합성 데이터**를 사용해야 합니다. |
| 실제 서비스 확장 | 실제 서비스에서 개인정보를 처리하려면 별도의 동의, 최소수집, 저장기간, 삭제, 보안 정책이 필요합니다. |

자세한 내용: [../docs/LOGINLESS_QR_PROFILE_GUIDE.md](../docs/LOGINLESS_QR_PROFILE_GUIDE.md)
