# participant-workspace

참가팀은 키오스크 자체를 다시 만드는 팀이 아닙니다. 키오스크 앞에서 겪는 정보 입력·탐색·이해·선택의 어려움을 줄이는 **사용자 접점**을 만듭니다.

`[참가팀 수정 파일]` 참가팀의 작업 템플릿입니다.

## 바로 시작

```bash
npm run participant:init -- --team TEAM-001 --env sandbox
```

그 다음 `workspace/TEAM-001/src/participant.ts` 를 여세요.

## 이 폴더의 파일

| 파일 | 설명 |
| --- | --- |
| `EDIT_ONLY_THIS_FOLDER.md` | 수정 범위 |
| `src/participant.ts` | 9개 함수 템플릿 (STEP 1–9) |
| `src/types.ts` · `src/config.ts` | 팀 코드용 보조 파일 |
| `tests/` | 단계별 자기 테스트 뼈대 |
| `example-ui/` | 브라우저에서 바로 열리는 사용자 접점 예제 |

## 다음 단계

| 명령 | 하는 일 |
| --- | --- |
| `npm run participant:progress` | 9단계 구현 상태 |
| `npm run participant:validate -- --file <출력.json> --execute` | 제출 검증 |
| `npm run participant:package -- --team TEAM-001 --file <출력.json>` | 최종 제출 폴더 |

## 로그인·저장·개인정보 정책

| 구분 | 내용 |
| --- | --- |
| Example UI | 로그인 없이 동작하는 **Sandbox 참고 예제**입니다. 공식 정답이 아닙니다. |
| 참가팀 자유 | 로그인, 기기 내 프로필 저장, QR, 음성, 카메라, OCR, 보호자 입력 등을 **선택적으로 자유롭게** 구현할 수 있습니다. |
| 반드시 지킬 것 | 로그인 기능은 금지되지 않지만, **로그인하지 않아도 서비스의 핵심 기능을 사용할 수 있어야 합니다.** |
| 심사 데이터 | 해커톤·심사·시뮬레이션에서는 실제 개인정보가 아닌 **가상·합성 데이터**를 사용해야 합니다. |
| 실제 서비스 확장 | 실제 서비스에서 개인정보를 처리하려면 별도의 동의, 최소수집, 저장기간, 삭제, 보안 정책이 필요합니다. |

자세한 내용: [../docs/LOGINLESS_QR_PROFILE_GUIDE.md](../docs/LOGINLESS_QR_PROFILE_GUIDE.md)
