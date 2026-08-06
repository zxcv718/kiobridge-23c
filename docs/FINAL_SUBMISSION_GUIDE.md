# 최종 제출 가이드

`[필수]` 제출 직전에 읽으세요. 체크리스트는 [FINAL_SUBMISSION_CHECKLIST.md](../FINAL_SUBMISSION_CHECKLIST.md).

## 1. 제출 폴더 만들기

```bash
npm run participant:package -- --team TEAM-001 --file ./workspace/TEAM-001/output/participant-submission.json
```

검증을 통과하지 못하면 **패키징이 중단됩니다.** 이것은 의도된 동작입니다 —
통과하지 못한 제출을 포장해 주면 "다 됐다" 는 잘못된 신호를 주게 됩니다.

## 2. 만들어지는 것

```
submission-output/TEAM-001/
├── participant-submission.json   ← 운영진이 재실행할 파일
├── simulation-evidence.json      ← 여러분 환경에서의 실행 증거
├── submission.sha256             ← 무결성
├── validation-report.md          ← 검증 요약 (자동 생성)
├── environment-version.json      ← 환경·버전 기록
└── README.md                     ← 빈칸을 채우세요
```

여기에 `demo-video.mp4` 를 넣어도 됩니다.

## 3. README.md 채우기

| 항목 | 무엇을 쓰나 |
| --- | --- |
| 팀명 | |
| 환경 | 닭강정 / 병원 / 관공서 중 하나 |
| 서비스 한 줄 소개 | 누구의 어떤 불편을 어떻게 줄였는지 |
| 사용자 정보 수집 방식 | 웹 / 음성 / QR / 보호자 대리입력 등 |
| 추천 방식 요약 | 무엇을 기준으로 순위를 정했는지 |
| 접근성 고려사항 | 큰 글씨·고대비·키보드·쉬운 말 등 |
| 실행 방법 | 심사위원이 여러분 서비스를 어떻게 켜는지 |
| 알려진 제한사항 | 솔직하게 |
| Submission Hash | `submission.sha256` 의 값 |

## 4. 공식 판정 방식

운영진은 **깨끗한 v5.1.4 패키지**에 여러분의 `participant-submission.json` 을 넣고
다시 실행합니다.

- 여러분이 플랫폼 파일을 고쳤어도 그 변경은 반영되지 않습니다
- 여러분의 `simulation-evidence.json` 은 참고자료이지 판정 근거가 아닙니다
- 재실행 결과가 공식 결과입니다

그래서 제출 전에 한 번 더 확인하는 것이 안전합니다:

```bash
# 깨끗한 폴더에 ZIP 을 다시 풀고
npm ci
npm run dev            # 다른 터미널
npm run participant:validate -- --file <제출 JSON> --execute
```

## 5. SIMULATION PASS 의 범위

`PASS` 는 계약·안전·상태 전환 검증을 통과했다는 뜻입니다.
추천 품질·접근성 UX·창의성은 별도 심사입니다 → [PASS_SCOPE.md](PASS_SCOPE.md)

경고(`WARN`)가 있어도 제출할 수 있습니다. 다만 왜 생겼는지 설명할 수 있어야 합니다.
