# 팀 23C — 주문 도우미 (KioBridge 해커톤)

키오스크 앞에서 작은 글씨·깊은 옵션 때문에 주문을 포기하는 사용자가,
로그인 없이 큰 버튼 질문에 답하면 **알레르기·예산을 지킨 추천과 그 이유**를 받고,
확인 후 가상 키오스크에서 장바구니까지 안전하게 완주하는 서비스.

| | |
| --- | --- |
| 배포 | https://kiobridge-23c-demo.vercel.app |
| 환경 | `chicken-store` |
| 상태 | SIMULATION **PASS** · `NORMAL_BOUNDARY_STOP` · 결제 계획 0 / 실행 0 |
| 같이 만들려면 | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## 이 저장소에 두 가지가 들어 있습니다

**우리가 만든 것은 `workspace/23C/` 안에 전부 있습니다.** 나머지 — `apps/` `packages/`
`environments/` `schemas/` `tools/` `docs/` 와 `Dockerfile`·`start-*` 실행 스크립트 — 는
주최 측이 준 **KioBridge 시뮬레이션 키트**이고 우리는 손대지 않습니다.

키트를 함께 두는 이유는 정리를 안 해서가 아니라 **우리 것이 진짜와 갈라지지 않게 하려고**입니다:

- 우리 코드는 `@kiobridge/participant-sdk`·`@kiobridge/profile-contract` 를 **25곳**에서
  가져다 씁니다. 복사본을 쓰면 주최 측이 Input Contract 를 고쳐도 우리 빌드가 조용히
  낡은 계약으로 통과해 버립니다 — 제출물 자체가 무효가 되는 종류의 실패입니다.
- 후보·가격·안전규칙·화면전이 **9개 JSON** 도 `environments/chicken-store/` 에서 직접
  읽습니다. 공식 재실행은 이 진짜 데이터로 돌아가므로, 복사본으로 추천을 계산하면
  우리 화면과 심사 결과가 다른 메뉴를 가리킬 수 있습니다.

공식 판정은 이 저장소가 아니라 **운영진의 깨끗한 v5.1.4** 에서 제출 JSON 을 재실행한
결과입니다. 그래서 키트를 고쳐 봐야 심사에 반영되지 않습니다.

## 로컬 실행

```bash
npm ci
npm run start:api                                        # :4000 공식 Simulation API
npx vite --config workspace/23C/ui/vite.config.ts        # :5173 우리 서비스
npx vite --config workspace/23C/tools/simulator-web.vite.config.ts   # :3000 공식 시뮬레이터
```

> `npm run dev` 는 쓰지 않는다 — API가 node_modules 감시로 수 초마다 재시작된다(제보함).
> `:3000` 은 우리 설정으로 띄운다 — 원본 설정은 첫 화면 문서 링크와 헬스체크 배지가 깨진다(제보함).

## 검증

```bash
npx vitest run --config workspace/23C/vitest.config.ts                  # 58
npx playwright test --config workspace/23C/tests/e2e/playwright.config.ts  # 접근성 실측 6
npx tsx tools/participant-cli.mjs validate --file workspace/23C/output/participant-submission.json --execute
npx tsx tools/participant-cli.mjs doctor                                # 플랫폼 무결성 182
```

## 구조

```
workspace/23C/
  src/participant.ts      공식 측정 표면 — 9단계 함수
  src/core/               판단 로직 (CLI·UI 공유, 순수 모듈)
    normalize.ts            동의어 → 공식 enum
    canonical.ts            Profile · SessionContext
    engine.ts               필터 · 랭킹 · 설명 · 대안
    plan.ts                 의미 기반 실행계획 (전이표 파생)
    context.ts              상황신호 (기기 시계만, 정렬 순서만 조정)
    submission-meta.ts      선택 채널 3종
  ui/                     사용자 접점 (React + Vite)
  tests/                  단위 135 + 화면 e2e 102 (접근성·시안 좌표 실측 포함)
  tools/                  로컬 실행 보조 설정
submission-output/23C/    제출 패키지 8종
```

**플랫폼 파일(`apps/` `packages/` `environments/` `schemas/` `tools/verify-*` `tests/`)은 수정하지 않는다.**
공식 판정은 운영진의 깨끗한 v5.1.4에서 제출 JSON을 재실행한 결과다.

## 자동 배포

`main` 에 push 하면 Vercel이 `vercel.json` 설정으로 빌드·배포한다.

---
---

# KioBridge Simulation Kit v5.1.4

> ## KioBridge Simulation Platform 은 추천 서비스를 제공하지 않습니다.
>
> **참가팀은 별도의 서비스에서 다음을 개발합니다.**
> 1. 사용자 프로필
> 2. 개인화 추천
> 3. 추천 이유
> 4. 사용자 승인 UI
> 5. 실행계획
>
> **공식 시뮬레이터는 이 결과를 받아 가상 키오스크 화면에서 실행하고,
> 상태 전환과 안전경계를 검증합니다.**
>
> **참가팀은 좌표나 실제 키오스크 컨트롤을 다루지 않습니다.
> 의미 기반 실행계획(어떤 후보·옵션을 어떤 순서로)만 작성합니다.**

> 🚫 **운영진용 안내 — 이 소스 폴더를 그대로 압축해서 배포하지 마세요.**
> `node_modules` 와 이전 `release/` 가 함께 들어갑니다.
> 배포본은 `npm run package:public` 으로만 만드세요.
> 자세한 내용은 소스 폴더의 `DO_NOT_SHARE_THIS_FOLDER.md` 를 보세요
> (이 파일은 배포 ZIP 에 포함되지 않습니다).

> ⚠️ **SIMULATION_ONLY / DIGITAL_TWIN.** 실제 Windows 키오스크·VoiceBridge·Agent·UPRLite·
> 결제·병원 접수·정부 민원 시스템과 연결하지 않습니다. `actualDeviceCommandSent` 는 항상 `false`.

플랫폼의 공식 정의:

> “KioBridge는 참가팀의 개인화 서비스를 대신 구현하지 않습니다. 참가팀이 만든 사용자 프로필,
> 추천 결과, 사용자 승인과 실행계획을 공통 환경에서 안전하게 검증할 수 있는 시뮬레이션
> 플랫폼을 제공합니다.”

---

## 🚀 빠른 실행 (플랫폼)

```bash
npm install
npm run dev
```

Docker:

```bash
docker compose up --build
```

| 서비스 | 주소 |
| --- | --- |
| Simulator Web (공식 UI) | http://localhost:3000 |
| Simulation API | http://localhost:4000 |

세 환경 + 연습용 `sandbox` 가 자동으로 나타납니다. 실행은 **Simulation Driver**(가상 키오스크)가
담당하며, 향후 실기기 단계에서는 **UPRLite Driver 로 교체**하면 같은 실행계획이 그대로 동작합니다.

> 참가팀 추천 서버는 이제 플랫폼 런타임에 포함되지 않습니다. 참가팀은 자신의 서비스에서
> 결과를 만들어 Simulation API 로 **제출**합니다.

---

## 🧭 참가팀 빠른 시작

1. 공식 시뮬레이터 실행 (`npm run dev`)
2. 환경 Fixture 조회 — `GET /api/v1/environments/:id/fixture`
3. 참가팀 서비스 개발 — 프로필·추천·승인·실행계획 생성 (여러분의 코드)
4. 세션 생성 — `POST /api/v1/sessions`
5. 결과 제출 — `POST /api/v1/sessions/:id/submission`
6. 검증 실행 — `POST /api/v1/sessions/:id/validate`
7. Evidence 확인 — `execute` 후 `GET /api/v1/sessions/:id/evidence`

SDK 로도 동일하게 할 수 있습니다 — [packages/participant-sdk](packages/participant-sdk).
참고 예제: [examples/minimal-participant-client](examples/minimal-participant-client) (정답 로직 없음, API 연동만).

```bash
# 정적 형식 예제로 전체 왕복 시연 (세션→제출→검증→실행→Evidence)
npm run dev              # 다른 터미널에서 플랫폼 실행 중이어야 함
npm run demo:client      # RUN_EXAMPLE=1 로 minimal-participant-client 실행
```

**참가팀이 API 로 제출하면 공식 웹이 자동으로 감지**(1초 폴링)하여 검토 화면으로 넘어갑니다 —
브라우저에 JSON 을 다시 붙여넣을 필요가 없습니다. 검증·실행·Evidence 는 모두 **서버가
권위적으로** 수행하며, 웹은 서버 결과를 애니메이션으로 표시만 합니다. 운영/시연용 수동 업로드도
보조 기능으로 제공합니다.

---

## 🧪 테스트 / 빌드

```bash
npm run test          # 전체 (엔진 + 공개 계약 + 회귀 + 정합성)
npm run test:public   # 환경별 공개 계약 테스트 (특정 추천 ID 를 정답으로 고정하지 않음)
npm run test:contract # 회귀 테스트 (역할 분리 + 검증/실행 동작)
npm run typecheck
npm run build
npm run test:e2e           # Playwright E2E (Sandbox 기준, 사전 준비 아래 참고)
```

---

## 🏗️ 역할 분리

| 공식 플랫폼(창업팀 제공) | 참가팀 개발 |
| --- | --- |
| 환경 Fixture, 상태 머신, 안전규칙, 스키마 | 프로필/추천/이유/승인 UI/**의미 기반** 실행계획 |
| 세션·제출·검증·실행·Evidence API | 시뮬레이터 제출 API 연동 |
| **Simulation Driver** + 가상 키오스크 재생 + Evidence | 접근성 기능, 최종 참가팀 서비스 |
| Participant SDK, 형식 예제, sandbox 연습환경 | — |

**공식 시뮬레이터가 하지 않는 것:** 프로필/추천/유사도/이유/승인/실행계획 생성, 참가팀
서비스의 fallback, 실제 Agent·키오스크·결제·접수·민원 처리.

---

## 📁 구조

```
kiobridge-simulation-kit/
├── apps/
│   ├── simulator-web/       # 공식 UI: 환경→세션→제출대기→읽기전용검토→검증→트윈→Evidence
│   └── simulation-api/      # 공식 API: 세션/제출/검증/실행/Evidence (어댑터 호출·fallback 없음)
├── packages/
│   ├── contracts/                # 타입 + 고정 상수 (driver-agnostic)
│   ├── state-engine/             # 상태 머신 (의미·전환만 검증)
│   ├── safety-engine/            # 안전규칙
│   ├── evaluator/                # 재생 + STOP 분류 + Evidence + 시맨틱 검증
│   ├── kiosk-driver-contract/    # KioskDriver 인터페이스 (교체 지점)
│   ├── simulation-driver/        # 가상 키오스크 드라이버 (현재 사용, READY)
│   ├── uprlite-driver-contract/  # 실기기 드라이버 계약 (PENDING_REAL_DEVICE)
│   └── participant-sdk/          # 참가팀 연동 SDK (전송·타입만)
├── environments/            # chicken-store / hospital / public-office / sandbox
│   └── <id>/bindings/       # simulation.binding.json · uprlite.binding.json
├── extensions/              # 참가팀 확장 예시
├── tools/                   # 운영 스크립트
├── examples/
│   ├── submission-format-example/   # sandbox 형식 예제 (정답 아님)
│   ├── invalid-submissions/         # 오류 제출 예제
│   └── minimal-participant-client/  # API 연동 예제 (정답 로직 없음)
├── schemas/                 # participant-submission 포함 7개 스키마
├── tests/                   # public / contract / e2e / private
└── docs/
```

### E2E 실행 (선택)

E2E 는 **릴리스 검증과 개발 검증용**입니다. 시뮬레이터를 사용하기 위해 참가팀이
반드시 실행해야 하는 것은 아닙니다.

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

Linux CI 나 Docker 처럼 시스템 라이브러리가 없는 환경이라면:

```bash
npx playwright install --with-deps chromium
```

브라우저 바이너리는 공개 ZIP 에 포함되지 않습니다. 테스트 소스
(`tests/e2e/`, `playwright.config.ts`) 만 함께 배포됩니다.

> `packages/shared-ui` 는 현재 별도 패키지로 분리하지 않았습니다(웹 내부 포함). 관련 TODO 는
> [docs/PENDING_REAL_DEVICE.md](docs/PENDING_REAL_DEVICE.md).

---

## 🩺 문제 해결

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| "Simulation API 에 연결할 수 없습니다" 배너 | 백엔드 미실행 | `npm run dev` 로 web·simulation-api 함께 실행 |
| `Failed to fetch` | 위와 동일 | `curl http://localhost:4000/api/health` 확인 |
| 세션이 계속 WAITING | 제출이 없음 (정상 동작) | 참가팀 제출 또는 UI 에서 예제/JSON 제출 |
| 검증 오류 `TARGET_KIND_NOT_ALLOWED` | 그 화면에서 못 고르는 대상 종류 | fixture 의 `screens[].targetKinds` 확인 |
| 검증 오류 `OPTION_NOT_SUPPORTED_BY_CANDIDATE` | 후보가 지원하지 않는 옵션 | `candidates[].supportedOptions` 확인 |

---

## 📚 문서

- **[WHAT_YOU_BUILD](docs/WHAT_YOU_BUILD.md)** · **[WHAT_WE_PROVIDE](docs/WHAT_WE_PROVIDE.md)** — 역할 구분 (여기부터)
- [ARCHITECTURE](docs/ARCHITECTURE.md) · [PARTICIPANT_GUIDE](docs/PARTICIPANT_GUIDE.md) · [API_CONTRACT](docs/API_CONTRACT.md)
- [SUBMISSION_GUIDE](docs/SUBMISSION_GUIDE.md) · [SAFETY_POLICY](docs/SAFETY_POLICY.md) · [DATA_CLASSIFICATION](docs/DATA_CLASSIFICATION.md)
- [EXTENSION_GUIDE](docs/EXTENSION_GUIDE.md) · [ENVIRONMENT_PACK_GUIDE](docs/ENVIRONMENT_PACK_GUIDE.md) · [EVALUATION_BOUNDARY](docs/EVALUATION_BOUNDARY.md)
- [CUSTOMIZATION](docs/CUSTOMIZATION.md) · [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) · [PENDING_REAL_DEVICE](docs/PENDING_REAL_DEVICE.md)
