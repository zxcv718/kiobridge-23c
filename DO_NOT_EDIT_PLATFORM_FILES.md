# 수정하지 않는 영역

`[필수]` 30초만 읽으세요.

## 왜 중요한가

**공식 평가는 여러분이 수정한 플랫폼이 아니라, 운영진의 깨끗한 v5.1.4 패키지에서
`participant-submission.json` 을 다시 실행한 결과입니다.**

플랫폼 파일을 고쳐 통과시켜도 공식 판정에는 반영되지 않습니다.
반대로, 실수로 고쳐도 여러분의 작업 파일은 그대로 남습니다.

## 수정하세요

| 위치 | 내용 |
| --- | --- |
| `workspace/<팀ID>/` | init 으로 만든 내 작업폴더 |
| `workspace/<팀ID>/src/participant.ts` | **9개 함수 — 여기가 시작점** |
| `participant-workspace/` | 템플릿과 예제 UI |
| 여러분의 서비스 코드 | 위치·언어·프레임워크 자유 |

## 수정하지 마세요 (고쳐도 평가에 반영되지 않음)

| 위치 | 무엇인가 |
| --- | --- |
| `apps/simulation-api` | 검증·실행·Evidence 서버 |
| `apps/simulator-web` | 공식 시뮬레이터 UI |
| `packages/simulation-driver` | 가상 키오스크 재생 |
| `packages/evaluator` | 검증 엔진 |
| `packages/safety-engine` | 안전 경계 |
| `packages/contracts`, `packages/profile-contract` | 계약 정의 |
| `environments/` | 환경 fixture · 호환규칙 · 검토 매핑 |
| `schemas/` | JSON Schema |
| `examples/submission-format-example/` | 공식 예제 |
| `tools/verify-*` | 검증기 |
| `tests/` | 공식 테스트 |

## 실수로 고쳤다면

```bash
npm run participant:doctor
```

변경된 공식 파일을 경고로 알려줍니다. **아무것도 지우지 않습니다.**

되돌리려면 ZIP 을 새 폴더에 다시 풀고 `workspace/<팀ID>/` 만 옮기세요.

---

관련: [participant-workspace/EDIT_ONLY_THIS_FOLDER.md](participant-workspace/EDIT_ONLY_THIS_FOLDER.md)
