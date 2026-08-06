# 최종 제출 체크리스트

`[필수]` 제출 직전에 확인하세요.

## 파일

`npm run participant:package` 가 `submission-output/<팀ID>/` 에 만들어 줍니다.

- [ ] `participant-submission.json` — **공식 재실행 대상**
- [ ] `simulation-evidence.json`
- [ ] `submission.sha256`
- [ ] `validation-report.md`
- [ ] `environment-version.json`
- [ ] `README.md` (빈칸을 모두 채웠는가)
- [ ] `demo-video.mp4` (선택)

## 내용

- [ ] `README.md` 의 팀명·서비스 소개·수집 방식·추천 방식·접근성 고려사항을 채웠다
- [ ] `validation-report.md` 의 SIMULATION 결과가 `PASS`
- [ ] `actualDeviceCommandSent` 가 `false`
- [ ] 계획된 결제 Action 이 `0`
- [ ] 검토 경계 도달 · 필수 verifier 실행이 `true`

## 마지막 확인

- [ ] 깨끗한 폴더에 ZIP 을 다시 풀고 제출 JSON 을 재검증했다
      ```bash
      npm run participant:validate -- --file <제출 JSON> --execute
      ```
- [ ] 제출 폴더에 `node_modules` 를 넣지 않았다
- [ ] 실제 개인정보가 들어 있지 않다
- [ ] SHA-256 값을 README 에 적었다

## 공식 판정 방식

운영진은 **깨끗한 v5.1.4 패키지**에서 여러분의 `participant-submission.json` 을
다시 실행합니다. 여러분이 플랫폼 파일을 고쳤더라도 그 변경은 반영되지 않습니다.

`SIMULATION PASS` 는 계약·안전·상태 전환 검증만 뜻합니다.
추천 품질·접근성 UX·창의성은 별도 심사입니다 → [docs/PASS_SCOPE.md](docs/PASS_SCOPE.md)

## 로그인·저장·개인정보 정책

| 구분 | 내용 |
| --- | --- |
| Example UI | 로그인 없이 동작하는 **Sandbox 참고 예제**입니다. 공식 정답이 아닙니다. |
| 참가팀 자유 | 로그인, 기기 내 프로필 저장, QR, 음성, 카메라, OCR, 보호자 입력 등을 **선택적으로 자유롭게** 구현할 수 있습니다. |
| 반드시 지킬 것 | 로그인 기능은 금지되지 않지만, **로그인하지 않아도 서비스의 핵심 기능을 사용할 수 있어야 합니다.** |
| 심사 데이터 | 해커톤·심사·시뮬레이션에서는 실제 개인정보가 아닌 **가상·합성 데이터**를 사용해야 합니다. |
| 실제 서비스 확장 | 실제 서비스에서 개인정보를 처리하려면 별도의 동의, 최소수집, 저장기간, 삭제, 보안 정책이 필요합니다. |

자세한 내용: [docs/LOGINLESS_QR_PROFILE_GUIDE.md](docs/LOGINLESS_QR_PROFILE_GUIDE.md)
