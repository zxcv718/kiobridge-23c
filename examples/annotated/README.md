# 주석 달린 예제 (설명용)

`[참고]` **이 폴더의 `.jsonc` 파일은 API 에 제출할 수 없습니다.**

JSONC 는 주석을 허용하는 형식이라 `JSON.parse` 가 실패합니다.
실행 가능한 예제는 `../submission-format-example/sandbox.json` 입니다.

| 파일 | 설명 |
| --- | --- |
| `01-canonical-profile.annotated.jsonc` | 오래 유지되는 사용자 정보 |
| `02-session-context-sandbox.annotated.jsonc` | 이번 이용의 맥락 |
| `03-recommendation.annotated.jsonc` | 추천 결과의 형태 |
| `04-user-decision.annotated.jsonc` | 사용자 승인 |
| `05-execution-plan.annotated.jsonc` | 의미 기반 실행계획 |
| `06-complete-sandbox-submission.annotated.jsonc` | 전체 제출 (Sandbox) |
| `07-evidence.annotated.jsonc` | 서버가 만든 실행 증거 (읽기 전용) |

## 각 필드에서 확인할 것

- 이 값을 **누가** 만드는가 (참가팀 / 플랫폼 / 사용자)
- **언제** 만들어지는가
- **필수**인가
- 공식 값은 **어디서** 조회하는가
- 잘못되면 **어떤 오류**가 나는가

## 공식 3환경에 대해

`recommendation` 과 `executionPlan` 의 **형태**만 보여줍니다.
공식 평가 환경(닭강정·병원·관공서)의 완성된 추천이나 실행계획은
이 폴더 어디에도 없습니다. 그것이 여러분이 만들 결과물입니다.
