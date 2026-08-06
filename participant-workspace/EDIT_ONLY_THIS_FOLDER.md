# 이 폴더에서 작업하세요

`[참가팀 수정 파일]`

## 시작점

```
participant-workspace/src/participant.ts
```

`npm run participant:init -- --team TEAM-001 --env sandbox` 를 실행하면
이 파일이 `workspace/TEAM-001/src/participant.ts` 로 복사됩니다.
그 뒤로는 **복사된 쪽**에서 작업하세요.

## 폴더 구성

| 경로 | 용도 |
| --- | --- |
| `src/participant.ts` | 9개 함수 (STEP 1–9) |
| `src/types.ts` | 팀 내부 타입 |
| `src/config.ts` | 팀 설정값 |
| `src/raw-input.example.ts` | 원본 입력 예시 |
| `tests/step-0*.test.ts` | 단계별 자기 테스트 |
| `input/` | 수집한 원본 입력 |
| `output/` | 만들어진 제출 JSON |
| `example-ui/` | 프레임워크 없는 사용자 접점 예제 |

## 하지 않아도 되는 일

- 키오스크 화면을 새로 만들 필요 없음 (KioBridge 가 제공)
- 상태 머신·안전 검증·Evidence 구현 불필요 (서버가 담당)
- 좌표·컨트롤 ID 계산 불필요 (Driver 가 담당)
- 페이지 이동 Action 불필요 (Driver 가 알아서 넘김)

## 자유롭게 정하세요

기술 스택, UI 프레임워크, 백엔드, 데이터베이스, AI 모델, 음성 API —
아무것도 강제하지 않습니다. **최종 출력이 계약에 맞으면 됩니다.**

```
ParticipantSubmission
├── profile          STEP 2
├── sessionContext   STEP 3
├── recommendation   STEP 5·6·7
├── userDecision     STEP 8
└── executionPlan    STEP 9
```

---

관련: [../DO_NOT_EDIT_PLATFORM_FILES.md](../DO_NOT_EDIT_PLATFORM_FILES.md)

## 로그인·저장·개인정보 정책

| 구분 | 내용 |
| --- | --- |
| Example UI | 로그인 없이 동작하는 **Sandbox 참고 예제**입니다. 공식 정답이 아닙니다. |
| 참가팀 자유 | 로그인, 기기 내 프로필 저장, QR, 음성, 카메라, OCR, 보호자 입력 등을 **선택적으로 자유롭게** 구현할 수 있습니다. |
| 반드시 지킬 것 | 로그인 기능은 금지되지 않지만, **로그인하지 않아도 서비스의 핵심 기능을 사용할 수 있어야 합니다.** |
| 심사 데이터 | 해커톤·심사·시뮬레이션에서는 실제 개인정보가 아닌 **가상·합성 데이터**를 사용해야 합니다. |
| 실제 서비스 확장 | 실제 서비스에서 개인정보를 처리하려면 별도의 동의, 최소수집, 저장기간, 삭제, 보안 정책이 필요합니다. |

자세한 내용: [../docs/LOGINLESS_QR_PROFILE_GUIDE.md](../docs/LOGINLESS_QR_PROFILE_GUIDE.md)
