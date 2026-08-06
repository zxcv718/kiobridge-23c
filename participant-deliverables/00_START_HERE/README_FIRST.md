<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# KioBridge Simulation Kit 시작하기

> **Windows 사용자는 `start-windows.bat` 실행 전
> [WINDOWS_FINAL_CHECKLIST.md](../../WINDOWS_FINAL_CHECKLIST.md) 를 먼저 확인하세요.**

**이 폴더에서 package.json 을 찾거나 직접 하위 폴더로 이동할 필요가 없습니다.**
지금 이 파일이 있는 폴더가 프로젝트 루트입니다.

운영체제에 맞는 시작 파일을 실행하세요.

| 운영체제 | 실행 방법 |
| --- | --- |
| **macOS** | `start-macos.command` 더블클릭 |
| **Windows** | `start-windows.bat` 더블클릭 |
| **Linux** | `./start-linux.sh` |

> 시작 파일은 **어느 위치에서 실행하든 자신이 있는 폴더로 자동 이동**합니다.
> 경로에 공백·한글·괄호가 있어도 동작합니다.
> Node.js 와 npm 을 확인하고, `node_modules` 가 없으면 `npm ci` 를 먼저 실행합니다.

직접 명령어로 실행할 경우에는 **반드시 package.json 이 있는 이 폴더에서** 실행합니다.

```bash
npm ci
npm run dev
```

종료: 실행 중인 터미널에서 `Ctrl+C`, 또는 `stop-macos.command` / `stop-windows.bat` / `./stop-linux.sh`

## 정상 실행 주소

| 서비스 | 주소 |
| --- | --- |
| 공식 시뮬레이터 | http://localhost:3000 |
| Simulation API | http://localhost:4000 |
| 헬스체크 | http://localhost:4000/health |

`npm run dev` 는 두 서비스를 **함께** 실행합니다. 터미널을 두 개 열 필요가 없습니다.
두 서비스가 응답하면 준비 완료 메시지가 표시되고, 실패하면 실패한 서비스·포트·로그 위치가 출력됩니다.

### 요구 사항

- Node.js **20 이상** (권장: **22 LTS**)
- npm 10 이상

---

## 여러분(참가팀)이 만드는 것

키오스크를 새로 만드는 것이 아닙니다. 다음을 만듭니다.

1. **사용자 프로필 수집** — 웹·앱·음성·AI 대화·보호자 입력 등 방식은 자유
2. **Profile Mapper** — 수집한 원본을 **Canonical Input Contract** 로 변환
3. **개인화 추천** + 추천 이유 + 대체안
4. **사용자 승인 UI** (승인·거절·수정)
5. **의미 기반 실행계획** — 좌표가 아니라 "어떤 후보·옵션을 어떤 순서로"
6. **공식 API 제출**

## KioBridge 가 제공하는 것

환경 Fixture · 공통 상태 머신 · 안전규칙 · Simulation Driver(가상 키오스크) ·
Action 재생 · 서버 권위 Evidence · Participant SDK · Schema Playground · 공개 테스트

---

## 10분 시작 가이드

### 1. 프로필 데이터 계약 조회

```bash
curl http://localhost:4000/api/v1/contracts                                  # 지원 계약 버전
curl http://localhost:4000/api/v1/environments/chicken-store/input-contract  # 환경별 입력 계약
curl http://localhost:4000/api/v1/vocabularies/chicken-store                 # 허용 enum 전체
curl http://localhost:4000/api/v1/schemas/canonical-profile.schema.json      # 스키마 원본
```

### 2. Schema Playground 로 검증

시뮬레이터 화면 **우측 상단 `Schema Playground` 버튼**을 누르면
프로필 + SessionContext 를 붙여넣어 즉시 검증할 수 있습니다.
잘못된 enum, 개인정보 패턴, 누락 필드가 `path` / `code` / `allowedValues` / `receivedValue` 와 함께 표시됩니다.

> Playground 는 **추천이나 실행계획을 생성하지 않습니다.** 스키마 확인 전용입니다.

### 3. Sandbox 에서 연결 연습

평가에 사용되지 않는 `sandbox` 환경으로 전체 왕복을 연습하세요.

```bash
# 세션 생성
curl -X POST http://localhost:4000/api/v1/sessions \
  -H 'content-type: application/json' -d '{"environmentId":"sandbox"}'

# 제출 → 검증 → 실행 → Evidence
curl -X POST http://localhost:4000/api/v1/sessions/<SESSION_ID>/submission \
  -H 'content-type: application/json' -d @examples/submission-format-example/sandbox.json
curl -X POST http://localhost:4000/api/v1/sessions/<SESSION_ID>/validate
curl -X POST http://localhost:4000/api/v1/sessions/<SESSION_ID>/execute -H 'content-type: application/json' -d '{}'
curl http://localhost:4000/api/v1/sessions/<SESSION_ID>/evidence
```

SDK 를 쓰면 동일한 흐름을 코드로 실행할 수 있습니다 —
[`examples/minimal-participant-client`](../../examples/minimal-participant-client).

### 4. 세션 생성과 제출 (웹에서)

1. 첫 화면에서 환경 선택 → **세션 생성**
2. 화면에 표시된 **제출 주소** 로 참가팀 서비스가 결과를 POST
3. 웹이 **자동으로 제출을 감지**(1초 폴링)하여 읽기 전용 검토 화면으로 전환

### 5. 가상 키오스크 실행

검토 화면에서 **검증** → 통과하면 **디지털 트윈 재생** 버튼이 활성화됩니다.
(검증 전에는 실행 버튼이 비활성화되어 있습니다.)

한 단계 실행 / 전체 자동재생 / 일시정지 / 다시 시작 / 속도 조절 / 오류 주입을 지원하며,
Action 마다 실제로 화면과 선택 상태가 바뀝니다.

### 6. Evidence 확인

실행이 끝나면 **Evidence** 단계에서 결과를 확인하고 JSON 으로 내려받습니다.
Evidence 는 **서버에서만 생성**되며 웹이 다시 계산하지 않습니다.

---

## 더 읽을 문서

| 문서 | 내용 |
| --- | --- |
| [WHAT_YOU_BUILD](./WHAT_YOU_BUILD.md) | 참가팀이 만드는 것 |
| [WHAT_WE_PROVIDE](./WHAT_WE_PROVIDE.md) | KioBridge 가 제공하는 것 |
| [MAPPING_GUIDE](../04_PROFILE_AND_INPUT_CONTRACT/MAPPING_GUIDE.md) | Profile Mapper 작성법 |
| [PROFILE_DATA_DICTIONARY](../04_PROFILE_AND_INPUT_CONTRACT/PROFILE_DATA_DICTIONARY.md) | 프로필 필드 사전 |
| [SESSION_CONTEXT_DICTIONARY](../04_PROFILE_AND_INPUT_CONTRACT/SESSION_CONTEXT_DICTIONARY.md) | SessionContext 필드 사전 |
| [ENUM_REFERENCE](../04_PROFILE_AND_INPUT_CONTRACT/ENUM_REFERENCE.md) | 공식 enum |
| [API_CONTRACT](../02_API_CONTRACT/API_CONTRACT.md) | API 전체 |
| [TROUBLESHOOTING](../09_TROUBLESHOOTING/TROUBLESHOOTING.md) | 문제 해결 |

## 자주 겪는 문제

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `Could not read package.json / ENOENT` | 프로젝트 **바깥 폴더**에서 실행 | 이 폴더(README_FIRST.md 가 있는 곳)에서 실행하거나 시작 파일 사용 |
| 웹은 뜨는데 데이터가 안 나옴 | API 미실행 | `npm run dev` 로 함께 실행. `curl localhost:4000/health` 확인 |
| 포트 충돌 (EADDRINUSE) | 3000/4000 사용 중 | `stop-*` 스크립트 실행 또는 해당 프로세스 종료 |
| macOS 에서 실행 차단 | Gatekeeper | 파일 우클릭 → 열기, 또는 터미널에서 `./start-macos.command` |

## 로그인·저장·개인정보 정책

| 구분 | 내용 |
| --- | --- |
| Example UI | 로그인 없이 동작하는 **Sandbox 참고 예제**입니다. 공식 정답이 아닙니다. |
| 참가팀 자유 | 로그인, 기기 내 프로필 저장, QR, 음성, 카메라, OCR, 보호자 입력 등을 **선택적으로 자유롭게** 구현할 수 있습니다. |
| 반드시 지킬 것 | 로그인 기능은 금지되지 않지만, **로그인하지 않아도 서비스의 핵심 기능을 사용할 수 있어야 합니다.** |
| 심사 데이터 | 해커톤·심사·시뮬레이션에서는 실제 개인정보가 아닌 **가상·합성 데이터**를 사용해야 합니다. |
| 실제 서비스 확장 | 실제 서비스에서 개인정보를 처리하려면 별도의 동의, 최소수집, 저장기간, 삭제, 보안 정책이 필요합니다. |

자세한 내용: [docs/LOGINLESS_QR_PROFILE_GUIDE.md](../../docs/LOGINLESS_QR_PROFILE_GUIDE.md)

## 받은 패키지가 공식 패키지인지 확인

```bash
npm run participant:doctor
```

`공식 파일 무결성` 이 PASS 면 받은 파일이 운영진이 만든 그대로입니다.
직접 확인하고 싶다면 압축 해제본에서 다음을 실행하세요.

```bash
npm run verify:public-package
```

압축 해제본에는 운영진용 `release/` 폴더가 없는 것이 정상이며,
그 항목은 `NOT_APPLICABLE` 로 표시됩니다.
