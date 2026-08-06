# KioBridge Windows 최종 확인 체크리스트

제품 버전: 5.1.4
Input Contract: 1.0.0

> 이 문서는 `tools/templates/WINDOWS_FINAL_CHECKLIST.template.md` 에서 생성됩니다. 직접 고치지 마세요.
> 참가팀 ZIP 루트와 운영진 `release/` 에 같은 내용이 들어가며 SHA-256 이 일치합니다.

Windows 사용자는 `start-windows.bat` 을 실행하기 전에 이 문서를 먼저 확인하세요.

## 검증 상태

| 항목 | 상태 | 뜻 |
| --- | --- | --- |
| `WINDOWS_STATIC_VALIDATION` | **PASS** | 배치 파일·경로·인코딩·문서를 파일 내용으로 검사함 |
| `WINDOWS_RUNTIME_VALIDATION` | **NOT_RUN** | 실제 Windows PC 에서 실행해 확인하지 않음 |

실제 Windows 에서 아래를 끝까지 수행한 경우에만
`WINDOWS_RUNTIME_VALIDATION` 을 `PASS` 로 바꾸세요.
확인하지 않은 항목을 `PASS` 라고 적지 마세요.

## A. 압축 해제

- [ ] 받은 파일이 **Participant ZIP** 인지 확인 (`kiobridge-simulation-kit-v5.1.4-participant.zip`)
      전체 개발 프로젝트를 통째로 압축한 파일이 아니어야 합니다
- [ ] ZIP 을 **완전히** 압축 해제 (탐색기에서 "압축 풀기")
- [ ] ZIP 미리보기 창 안에서 바로 실행하지 않기
      Windows 는 ZIP 내부를 임시 폴더로 열어 주며, 그 안에서는 `npm ci` 가 실패합니다
- [ ] 경로에 한글·공백·괄호가 있어도 동작합니다
      예: `C:\Users\사용자\내 문서 (1)\KioBridge\`
- [ ] 경로가 너무 길어 오류가 나면 짧은 경로로 옮기세요
      예: `C:\KioBridge\`
- [ ] 무결성 확인: `certutil -hashfile kiobridge-simulation-kit-v5.1.4-participant.zip SHA256`
      출력이 `kiobridge-simulation-kit-v5.1.4-participant.zip.sha256` 의 값과 같아야 합니다

## B. 필수 환경

- [ ] Node.js **20 이상**
- [ ] npm **10 이상**
- [ ] `node --version`
- [ ] `npm --version`
- [ ] PowerShell 또는 명령 프롬프트(cmd.exe) 를 열 수 있음

Node.js 가 없으면 <https://nodejs.org> 에서 LTS 를 설치한 뒤
**새 터미널을 열어** 다시 확인하세요. (PATH 는 기존 창에 반영되지 않습니다)

## C. 첫 실행

- [ ] `start-windows.bat` 더블클릭
- [ ] 배치 파일이 자기 위치를 프로젝트 루트로 삼는지 확인
      (`cd /d "%~dp0"` — 어느 폴더에서 실행해도 동작해야 합니다)
- [ ] 의존성 설치가 진행됨 (`npm ci`, 처음에는 몇 분 걸립니다)
- [ ] Web  : <http://127.0.0.1:3000>
- [ ] API  : <http://127.0.0.1:4000/health>
- [ ] 브라우저가 자동으로 열림 (열리지 않으면 위 주소를 직접 입력)
- [ ] 콘솔 창이 즉시 닫히지 않음
- [ ] 한글이 깨지지 않음 (`chcp 65001`)
- [ ] 실행 로그는 배치 파일을 띄운 콘솔 창에 그대로 출력됩니다

## D. 참가팀 진단

```
npm run participant:doctor
```

기대 출력:

```
[READY] 개발을 시작할 수 있습니다.
```

확인:

- [ ] Product 5.1.4
- [ ] Input Contract 1.0.0
- [ ] Web 3000
- [ ] API 4000
- [ ] 공식 파일 무결성
- [ ] `WINDOWS_FINAL_CHECKLIST.md` 무결성

`[READY]` 가 나오지 않으면 다음 단계로 넘어가지 마세요.

## E. Sandbox 데모

```
npm run participant:demo
```

확인:

- [ ] Session 생성
- [ ] Validate PASS
- [ ] Execute PASS
- [ ] SIMULATION PASS
- [ ] `actualDeviceCommandSent=false`
- [ ] `executionEnvironment=DIGITAL_TWIN`
- [ ] `validationMode=SIMULATION_ONLY`

이 셋 중 하나라도 다르면 실행을 멈추고 운영진에게 알리세요.
실제 장비로 명령이 나간다는 뜻이기 때문입니다.

## F. 참가팀 작업공간

```
npm run participant:init -- --team TEAM-WINDOWS --env sandbox
```

확인:

- [ ] `workspace\TEAM-WINDOWS\`
- [ ] `workspace\TEAM-WINDOWS\participant-ux.json`
- [ ] `workspace\TEAM-WINDOWS\src\participant.ts`

```
npm run participant:progress -- --team TEAM-WINDOWS
```

- [ ] 9단계 구현 현황이 보임
- [ ] 사용자 접점 자동 검사가 보임
- [ ] `MANUAL_REVIEW_REQUIRED` 항목이 보임

## G. 제출 검증

여러 줄 명령 (Linux/macOS 문법) 은 Windows 에서 그대로 붙여넣으면 안 됩니다.
`\` 줄바꿈은 cmd.exe 에서 동작하지 않습니다. **한 줄 명령**을 쓰세요.

cmd.exe · PowerShell 공통 (한 줄):

```
npm run participant:validate -- --file examples/submission-format-example/sandbox.json --execute
```

cmd.exe 여러 줄 (`^` 사용):

```
npm run participant:validate -- ^
  --file examples/submission-format-example/sandbox.json ^
  --execute
```

PowerShell 여러 줄 (`` ` `` 사용):

```
npm run participant:validate -- `
  --file examples/submission-format-example/sandbox.json `
  --execute
```

- [ ] 검증 통과 메시지가 나옴
- [ ] `--execute` 로 Simulation Driver 재생까지 확인됨

## H. 제출 패키징

한 줄:

```
npm run participant:package -- --team TEAM-WINDOWS --file examples/submission-format-example/sandbox.json
```

확인:

- [ ] `submission-output\TEAM-WINDOWS\`
- [ ] `participant-submission.json`
- [ ] `simulation-evidence.json`
- [ ] `submission.sha256`
- [ ] `validation-report.md`
- [ ] `participant-ux.json`
- [ ] `MANUAL_REVIEW_CHECKLIST.md`

## I. Example UI

`participant-workspace\example-ui\index.html` 을 더블클릭하세요.

- [ ] 로그인 없이 시작됨
- [ ] 추천 이유가 보임
- [ ] 대안이 보임
- [ ] 사용자 확인 단계가 있음
- [ ] Canonical JSON 미리보기가 보임
- [ ] 서버가 켜져 있으면 **API 연결 모드** (실제 Sandbox 검증 결과)
- [ ] 서버가 꺼져 있으면 **독립 미리보기 모드** (가짜 PASS 를 만들지 않음)
- [ ] 큰 글씨·고대비가 실제로 적용됨

## J. 종료

- [ ] 콘솔 창에서 `Ctrl+C`
- [ ] `stop-windows.bat` 실행
- [ ] 3000 포트 종료 확인: `netstat -ano | findstr :3000`
- [ ] 4000 포트 종료 확인: `netstat -ano | findstr :4000`

## K. 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| Node 를 찾지 못함 | Node.js 설치 후 **새 터미널**을 열었는지, `node --version` |
| `npm ci` 실패 | 네트워크, 사내 프록시, `package-lock.json` 존재 여부 |
| 포트 충돌 | `netstat -ano \| findstr :3000` → `taskkill /PID <pid> /F` |
| Windows Defender · SmartScreen 경고 | "추가 정보" → "실행" (배치 파일에 서명이 없어 뜨는 경고입니다) |
| `start-windows.bat` 이 즉시 닫힘 | cmd.exe 를 먼저 열고 배치 파일 경로를 입력해 오류 메시지를 확인 |
| 경로 문제 | 짧은 경로(`C:\KioBridge\`)로 옮겨 다시 시도 |
| 권한 문제 | 사용자 폴더 아래로 옮기기. `C:\Program Files\` 아래는 피하세요 |
| 브라우저가 자동으로 열리지 않음 | <http://127.0.0.1:3000> 을 직접 입력 |
| API health 실패 | <http://127.0.0.1:4000/health> 확인, 콘솔 오류 확인 |

자세한 오류코드는 `docs\ERROR_CATALOG.md`,
증상별 분기는 `docs\TROUBLESHOOTING_DECISION_TREE.md` 를 보세요.

## L. 문의 시 함께 보낼 정보

- [ ] `npm run participant:doctor` 전체 출력
- [ ] `node --version` · `npm --version`
- [ ] Windows 버전 (`winver`)
- [ ] 압축 해제 경로 전체
- [ ] 오류 화면 캡처
- [ ] API 콘솔 로그
- [ ] Web 콘솔 로그

## M. 보고 양식

```
WINDOWS_STATIC_VALIDATION: PASS
WINDOWS_RUNTIME_VALIDATION: NOT_RUN
확인 일시(UTC):
Windows 버전:
Node.js 버전:
npm 버전:
압축 해제 경로:
실패 항목:
```

---

제품 버전 5.1.4 · inputContractVersion 1.0.0 ·
Web 3000 · API 4000

시작 문서: [00_START_HERE.html](00_START_HERE.html) · [00_START_HERE.md](00_START_HERE.md) · [README_FIRST.md](README_FIRST.md)
