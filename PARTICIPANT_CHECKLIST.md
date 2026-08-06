# 참가팀 진행 체크리스트

> **Windows 사용자는 `start-windows.bat` 실행 전
> [WINDOWS_FINAL_CHECKLIST.md](WINDOWS_FINAL_CHECKLIST.md) 를 먼저 확인하세요.**

`[권장]` 위에서부터 순서대로 채우세요.

## 1. 설치

- [ ] Node.js 20 이상 (`node -v`)
- [ ] ZIP 압축 해제 (한글·공백 경로도 괜찮습니다)
- [ ] `00_START_HERE.html` 열어봄
- [ ] 시작파일 실행 → 브라우저에 환경 선택 화면
- [ ] `npm run participant:doctor` 가 `[READY]`

## 2. 첫 실행

- [ ] `npm run participant:demo` 가 `SIMULATION PASS`
- [ ] 브라우저에서 가상 키오스크가 움직이는 것을 봄
- [ ] Evidence 화면에서 `resultScope: SIMULATION_VALIDATION_ONLY` 확인

## 3. 환경 선택

- [ ] 닭강정 / 병원 / 관공서 중 하나 선택
- [ ] `docs/environments/<환경>_PARTICIPANT_GUIDE.md` 읽음
- [ ] 그 환경의 `compatibility-rules` 를 API 로 조회해 봄
- [ ] 그 환경의 `review-mapping` 을 조회해 봄

## 4. 작업 시작

- [ ] `npm run participant:init -- --team <팀ID> --env <환경>`
- [ ] `workspace/<팀ID>/src/participant.ts` 를 엶
- [ ] `DO_NOT_EDIT_PLATFORM_FILES.md` 읽음

## 5. 구현 (9단계)

- [ ] STEP 1 `collectProfile` — 사용자 정보 수집
- [ ] STEP 2 `mapToCanonicalInput` — Canonical Profile
- [ ] STEP 3 `createSessionContext` — 세션 맥락
- [ ] STEP 4 `filterCandidates` — 제약 위반 제외
- [ ] STEP 5 `recommend` — 순위 결정
- [ ] STEP 6 `explainRecommendation` — 이유 설명 (최소 1개)
- [ ] STEP 7 `buildAlternatives` — 대안
- [ ] STEP 8 `collectUserDecision` — 사용자 승인
- [ ] STEP 9 `buildExecutionPlan` — 의미 기반 실행계획
- [ ] `npm run participant:progress` 가 9/9

## 6. 사용자 접점 (사람이 확인)

- [ ] 로그인하지 않아도 핵심 이용 흐름이 동작한다 (로그인 기능 자체는 선택사항)
- [ ] 추천 이유가 화면에 보인다
- [ ] 대안 보기 / 거절 / 직원 도움 경로가 있다
- [ ] 최종 확인 화면이 있다
- [ ] 키보드만으로 전체 흐름을 쓸 수 있다
- [ ] 큰 글씨·고대비를 지원한다
- [ ] 외부 API 가 죽어도 쓸 수 있다
- [ ] 실제 개인정보를 저장하지 않는다

## 7. 검증

- [ ] `npm run participant:validate -- --file <출력.json> --execute`
- [ ] `valid=true`
- [ ] `SIMULATION PASS`
- [ ] 경고가 있다면 이유를 설명할 수 있다

## 8. 제출

- [ ] `npm run participant:package -- --team <팀ID> --file <출력.json>`
- [ ] `submission-output/<팀ID>/README.md` 빈칸 채움
- [ ] (선택) `demo-video.mp4` 추가
- [ ] [FINAL_SUBMISSION_CHECKLIST.md](FINAL_SUBMISSION_CHECKLIST.md) 확인

## 로그인·저장·개인정보 정책

| 구분 | 내용 |
| --- | --- |
| Example UI | 로그인 없이 동작하는 **Sandbox 참고 예제**입니다. 공식 정답이 아닙니다. |
| 참가팀 자유 | 로그인, 기기 내 프로필 저장, QR, 음성, 카메라, OCR, 보호자 입력 등을 **선택적으로 자유롭게** 구현할 수 있습니다. |
| 반드시 지킬 것 | 로그인 기능은 금지되지 않지만, **로그인하지 않아도 서비스의 핵심 기능을 사용할 수 있어야 합니다.** |
| 심사 데이터 | 해커톤·심사·시뮬레이션에서는 실제 개인정보가 아닌 **가상·합성 데이터**를 사용해야 합니다. |
| 실제 서비스 확장 | 실제 서비스에서 개인정보를 처리하려면 별도의 동의, 최소수집, 저장기간, 삭제, 보안 정책이 필요합니다. |

자세한 내용: [docs/LOGINLESS_QR_PROFILE_GUIDE.md](docs/LOGINLESS_QR_PROFILE_GUIDE.md)
