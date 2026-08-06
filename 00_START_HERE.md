# 여기서 시작하세요

참가팀은 키오스크 자체를 다시 만드는 팀이 아닙니다. 키오스크 앞에서 겪는 정보 입력·탐색·이해·선택의 어려움을 줄이는 **사용자 접점**을 만듭니다.

`[필수]` 브라우저가 있으면 **`00_START_HERE.html` 을 더블클릭**하세요. 같은 내용을 더 편하게 볼 수 있습니다.

| 항목 | 값 |
| --- | --- |
| 제품 버전 | `5.1.4` |
| inputContractVersion | `1.0.0` |
| Web | http://localhost:3000 |
| API | http://localhost:4000 |

---

## 처음에는 두 곳만 보세요

```
00_START_HERE.html          ← 지금 이 안내
participant-workspace/      ← 여러분이 코드를 쓰는 곳
```

`packages`, `apps`, `environments`, `schemas` 는 플랫폼이 실행에 쓰는 파일이며
**참가팀 구현 시작점이 아닙니다.**

## 다섯 가지 답

| 질문 | 답 |
| --- | --- |
| 무엇을 만드나 | 사용자를 대신해 키오스크를 조작할 **의미 기반 실행계획**을 만드는 서비스 |
| 어느 파일을 고치나 | `participant-workspace/src/participant.ts` → init 후 `workspace/<팀ID>/src/participant.ts` |
| 어떤 순서로 | 9개 함수를 위에서부터. `participant:progress` 가 알려줍니다 |
| 어떻게 확인하나 | `participant:validate` → SIMULATION PASS |
| 무엇을 제출하나 | `participant:package` 가 만든 `submission-output/<팀ID>/` |

## 권장 경로

```bash
# 1~2. ZIP 압축 해제 → 00_START_HERE.html 열기
# 3. 시작파일 실행 (macOS: start-macos.command / Windows: start-windows.bat / Linux: start-linux.sh)

npm run participant:doctor      # 4. 설치·서버·버전 점검
npm run participant:demo        # 5. Sandbox 왕복 시연
npm run participant:init -- --team TEAM-001 --env sandbox   # 6. 내 작업폴더

# 7. workspace/TEAM-001/src/participant.ts 구현

npm run participant:progress    # 8. 남은 단계 확인
npm run participant:validate -- --file ./workspace/TEAM-001/output/participant-submission.json --execute
npm run participant:package -- --team TEAM-001 --file ./workspace/TEAM-001/output/participant-submission.json
# 11. submission-output/TEAM-001/ 제출
```

## 용어

| 용어 | 뜻 |
| --- | --- |
| Canonical Profile | 수집 방식과 무관하게 KioBridge 가 공통으로 이해하는 사용자 정보 형식 |
| SessionContext | 이번 이용에만 해당하는 맥락 |
| Fixture | 해당 환경의 후보·옵션·화면·상태전환이 들어 있는 공개 데이터 |
| Semantic ExecutionPlan | 좌표가 아니라 무엇을 어떤 순서로 선택할지를 나타내는 계획 |
| Evidence | 서버가 생성한 시뮬레이션 실행 증거 |

## 다음 문서

| 문서 | 언제 |
| --- | --- |
| [README_FIRST.md](README_FIRST.md) | 실행이 안 될 때 |
| [PARTICIPANT_CHECKLIST.md](PARTICIPANT_CHECKLIST.md) | 진행 상황 확인 |
| [docs/environments/README.md](docs/environments/README.md) | 환경을 고를 때 |
| [docs/ERROR_CATALOG.md](docs/ERROR_CATALOG.md) | 오류가 났을 때 |
| [docs/PASS_SCOPE.md](docs/PASS_SCOPE.md) | PASS 의미가 궁금할 때 |
| [FINAL_SUBMISSION_CHECKLIST.md](FINAL_SUBMISSION_CHECKLIST.md) | 제출 직전 |

## Windows 사용자

Windows 사용자는 `start-windows.bat` 실행 전
[WINDOWS_FINAL_CHECKLIST.md](WINDOWS_FINAL_CHECKLIST.md) 를 먼저 확인하세요.

## 로그인·저장·개인정보 정책

| 구분 | 내용 |
| --- | --- |
| Example UI | 로그인 없이 동작하는 **Sandbox 참고 예제**입니다. 공식 정답이 아닙니다. |
| 참가팀 자유 | 로그인, 기기 내 프로필 저장, QR, 음성, 카메라, OCR, 보호자 입력 등을 **선택적으로 자유롭게** 구현할 수 있습니다. |
| 반드시 지킬 것 | 로그인 기능은 금지되지 않지만, **로그인하지 않아도 서비스의 핵심 기능을 사용할 수 있어야 합니다.** |
| 심사 데이터 | 해커톤·심사·시뮬레이션에서는 실제 개인정보가 아닌 **가상·합성 데이터**를 사용해야 합니다. |
| 실제 서비스 확장 | 실제 서비스에서 개인정보를 처리하려면 별도의 동의, 최소수집, 저장기간, 삭제, 보안 정책이 필요합니다. |

자세한 내용: [docs/LOGINLESS_QR_PROFILE_GUIDE.md](docs/LOGINLESS_QR_PROFILE_GUIDE.md)

## 받은 패키지 확인

`npm run participant:doctor` 의 `공식 파일 무결성` 이 PASS 면 됩니다.
더 확인하려면 `npm run verify:public-package` 를 실행하세요.
압축 해제본에 `release/` 폴더가 없는 것은 정상입니다.
