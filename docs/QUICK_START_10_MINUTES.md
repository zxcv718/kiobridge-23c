# 10분 시작 가이드

압축을 풀고 여기까지 왔다면, 10분 안에 전체 흐름을 한 번 돌려볼 수 있습니다.

---

## 0분 — 준비물 확인

Node.js 20 이상이 필요합니다.

```bash
node -v
```

없다면 [nodejs.org](https://nodejs.org) 에서 LTS 를 설치하세요.

---

## 1분 — 실행

압축을 푼 폴더에서 운영체제에 맞는 파일을 **더블클릭**하세요.

| OS | 파일 |
| --- | --- |
| macOS | `start-macos.command` |
| Windows | `start-windows.bat` |
| Linux | `start-linux.sh` |

터미널을 쓴다면:

```bash
npm install && npm run dev
```

브라우저가 열리지 않으면 <http://localhost:3000> 을 직접 여세요. (API 는 4000 번)
경로에 한글이나 공백이 있어도 괜찮습니다 — 시작 스크립트가 알아서 처리합니다.

---

## 3분 — 화면 둘러보기

첫 화면에 네 개의 환경이 보입니다.

| 환경 | 무엇을 하나 |
| --- | --- |
| 닭강정 가게 | 메뉴 · 맛 · 뼈 유무 · 포장 선택 |
| 병원 접수 | 초진/재진 · 진료과 · 예약 확인 |
| 관공서 민원 | 민원 종류 · 인증수단 확인 |
| **sandbox** | **연습용** — 여기서 먼저 시작하세요 |

각 환경 카드의 "시작하기" 를 누르면 세션이 생기고
`submissionStatus: WAITING` 상태로 여러분의 제출을 기다립니다.

> 공식 시뮬레이터는 여러분 대신 프로필·추천·실행계획을 만들지 않습니다.
> 기다리는 것이 정상입니다.

---

## 5분 — sandbox 로 왕복 한 번

sandbox 에는 **연습용 완성 예제**가 하나 들어 있습니다.
이걸로 "제출 → 검증 → 가상 키오스크 실행 → Evidence" 전체가 도는 걸 확인하세요.

```bash
npm run demo:client
```

콘솔에 이런 흐름이 보이면 성공입니다.

```
[starter] fixture: 연습용 키오스크 (후보 N개)
[starter] session: SES-... status=WAITING
[starter] validation: valid=true []
[starter] SIMULATION PASS (stopType=NORMAL_BOUNDARY_STOP ...)
```

브라우저를 보면 가상 키오스크가 실제로 화면을 넘어가며 재생됩니다.

> sandbox 만 완성 예제가 있습니다. 공식 3환경의 정답은 제공되지 않습니다.

---

## 7분 — 계약 확인

여러분이 만들 제출물의 형식을 봅니다.

```bash
curl localhost:4000/api/v1/contracts
curl localhost:4000/api/v1/environments/chicken-store/input-contract
curl localhost:4000/api/v1/vocabularies/chicken-store
```

브라우저 우측 상단 **Schema Playground** 에서 직접 값을 넣어보며
어떤 값이 왜 거부되는지 즉시 확인할 수 있습니다.

형식 예제는 `examples/public-canonical-input/<환경>/` 에 있습니다.
공식 3환경 예제에는 `profile` 과 `sessionContext` 만 있습니다 —
`recommendation` 과 `executionPlan` 은 여러분이 만들 부분이라 비워둔 것입니다.

---

## 9분 — 여러분의 코드 자리 찾기

```
examples/minimal-participant-client/src/
├── index.ts          ← 연결 코드. 이미 동작합니다. 건드릴 필요 없습니다.
└── participant.ts    ← 여기가 여러분의 자리. 9개 함수 전부 TODO 입니다.
```

`participant.ts` 의 9개 함수:

| # | 함수 | 하는 일 |
| --- | --- | --- |
| 1 | `collectProfile` | 사용자 정보 수집 (방식 자유) |
| 2 | `mapToCanonicalInput` | → Canonical Profile 변환 |
| 3 | `createSessionContext` | 이번 세션 맥락 구성 |
| 4 | `filterCandidates` | 제약 위반 후보 제외 |
| 5 | `recommend` | 순위 결정 |
| 6 | `explainRecommendation` | 이유 설명 |
| 7 | `buildAlternatives` | 대안 제시 |
| 8 | `collectUserDecision` | 사용자 승인 받기 |
| 9 | `buildExecutionPlan` | 의미 기반 실행계획 |

하나씩 채워가며 `npm run dev:client` 로 확인하세요.

---

## 10분 — 제출물 검사

만든 제출물이 계약을 지키는지 확인합니다.

```bash
npm run check:submission -- --file ./my-submission.json --execute
```

이 도구는 **검증만** 합니다. 빠진 Action 을 채워주거나 후보를 골라주지 않습니다.
오류가 나오면 `code` 와 `path` 를 보고 직접 고치세요.

---

---

## 참고 — E2E 테스트 (선택)

플랫폼 전체 흐름을 자동으로 확인하고 싶다면:

```bash
npx playwright install chromium
npm run test:e2e
```

Sandbox 기준 5개 시나리오가 실제 브라우저에서 돌아갑니다.
시뮬레이터를 쓰기 위해 반드시 필요한 단계는 아닙니다.

---

## 다음으로

- [WHAT_YOU_BUILD.md](WHAT_YOU_BUILD.md) — 무엇을 만들어야 하는가
- [FULL_DEMO_FLOW.md](FULL_DEMO_FLOW.md) — 전체 흐름 상세
- [PASS_SCOPE.md](PASS_SCOPE.md) — PASS 가 뜻하는 것과 뜻하지 않는 것
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — 안 될 때

---

## 자주 막히는 곳

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `Failed to fetch` | 백엔드가 꺼져 있음 | `npm run dev` 로 다시 시작 |
| 포트 사용 중 | 이전 프로세스가 남음 | `stop-*` 스크립트 실행 후 재시작 |
| `language` 거부됨 | `"ko"` 는 지역 코드가 없음 | `"ko-KR"` 로 |
| `DOMAIN_CONTEXT_MISMATCH` | 값을 잘못된 섹션에 넣음 | 데이터 사전에서 섹션 확인 |
| `BOUNDARY_NOT_REACHED` | 경계 화면까지 못 감 | transitions 를 따라 계획 보완 |
