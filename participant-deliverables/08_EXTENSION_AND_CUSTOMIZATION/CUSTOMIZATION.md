<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# CUSTOMIZATION GUIDE (플랫폼 커스터마이징)

이 문서는 **Kit 를 배포/운영하는 개발팀**을 위한 것입니다. (해커톤 참가팀용 안내는
[PARTICIPANT_GUIDE](../07_PARTICIPANT_STARTER/PARTICIPANT_GUIDE.md) 를 보세요.) 아래 규칙만 지키면 안전 불변식을
깨지 않고 자유롭게 확장할 수 있습니다.

## 절대 바꾸지 말아야 할 불변식

- `contracts` 의 `FIXED_PRINCIPLES` (`validationMode`, `executionEnvironment`,
  `actualDeviceCommandSent:false`, `participantSubmissionUsed:true`, `officialRecommendationGenerated:false`)
- `safety-engine` / `state-engine` 가 어댑터 출력을 **재검증**하는 흐름 (core-api)
- 최종 확인 화면 이후 `STOP` 경계, 결제/실제 실행 차단

이 세 가지는 커스터마이징 대상이 아니라 **보증(guarantee)** 입니다.

## 1. 새 환경 추가하기

`environments/<new-id>/` 폴더를 만들고 아래 파일을 둡니다.

| 파일 | 필수 | 내용 |
| --- | --- | --- |
| `manifest.json` | ✅ | id, states, initialState, finalReviewState, finalState=STOP, allowed/forbiddenActions |
| `screens.json` | ✅ | 상태별 title/controls/progress, 최종화면 `isFinalReview:true` |
| `controls.json` | ✅ | controlId/label/action (+ readOnly, 좌표) |
| `transitions.json` | ✅ | `{from, action, to, guards?}` — 읽기전용은 `guards:["readOnly"]` |
| `safety-rules.json` | ✅ | 적용 안전규칙 목록 |
| 후보 파일 | ✅ | `catalog.json` / `flows.json` / `services.json` 중 하나 |
| `option-groups.json` | ⬜ | (닭강정형) 옵션 그룹 |
| `profiles/*.json` | ✅ | 합성 프로필 (`dataClassification: SYNTHETIC_PROFILE`) |
| `scenarios/*.json` | ✅ | 시나리오 (배열 또는 객체) |

manifest 에는 `reviewBoundaryState`, `requiredVerifierAction`(읽기전용), `terminalState:"STOP"` 를
반드시 포함하세요.

그다음:

1. `packages/contracts` 의 `EnvironmentId` 유니온에 새 id 추가.
2. `apps/simulation-api/src/loader.ts` 의 `ENV_IDS` 배열에 추가 (후보 파일명이 새로우면
   `CANDIDATE_FILES` 에도 추가).
3. `examples/submission-format-example/<id>.json` 형식 예제 추가(테스트/시연용).
4. `tests/public` · `tests/contract` 에 정합성/계약 테스트 추가.

로더는 파일 기반이라 코드 변경 없이 데이터만 바꿔도 대부분 반영됩니다.
> 공식 플랫폼은 추천을 생성하지 않으므로 "플랜 템플릿" 같은 정답 로직을 플랫폼에 넣지 마세요.

## 2. 포트 / URL 변경

| 대상 | 방법 |
| --- | --- |
| simulation-api 포트 | `PORT` 환경변수 (기본 4000) |
| 웹 → simulation-api 주소 | `VITE_CORE_API_URL` (미설정 시 Vite 프록시 `/api` → 4000) |
| Vite 프록시 타깃 | `apps/simulator-web/vite.config.ts` 의 `server.proxy` |

Docker 는 `compose.yaml` 의 `environment` 로 주입합니다.

## 3. 제출 계약 유지

공식 API 는 참가팀 어댑터를 호출하지 않습니다. 참가팀 서비스가 `ParticipantSubmission` 을
`POST /api/v1/sessions/:id/submission` 으로 제출합니다. 스키마를 바꾸면
`schemas/participant-submission.schema.json` 과 `packages/contracts` 타입을 함께 갱신하세요.

## 4. 안전규칙 확장

새 규칙은 `safety-engine` 의 `evaluatePlanSafety` 에 추가하고, `contracts` 의
`SafetyRuleId` 유니온과 각 환경 `safety-rules.json` 에 등록하세요. 규칙은 항상
`PASS | BLOCK | STOP` 중 하나를 반환하고, BLOCK/STOP 이면 `blockedAtActionIndex` 를
갱신해 실행을 중단시켜야 합니다.

## 5. 상태 유지 / DB

현재 Kit 은 상태를 서버에 저장하지 않습니다(각 `/api/run` 은 독립적). 실행 이력을
남기려면 core-api 에 저장 계층을 추가하되, 트윈 재생과 Evidence 는 여전히 순수 엔진으로
계산해 재현성을 유지하세요.

## 6. 확인용 명령

```bash
npm run typecheck
npm run test        # 새 환경/규칙 추가 시 여기에 테스트를 추가
npm run build
```
