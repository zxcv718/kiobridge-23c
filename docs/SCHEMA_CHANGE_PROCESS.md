# SCHEMA CHANGE PROCESS (변경 승인 절차)

참가팀 요청이 있다고 해서 Core Contract 에 바로 필드를 추가하지 않습니다.
**먼저 `extensions` 로 표현 가능한지 검토**하고, 공식 실행·평가에 필요한 의미가 확인되면
다음 버전의 Domain Contract 로 승격합니다.

## 절차

1. **변경 제안 작성** — 무엇을, 왜.
2. **사용 목적 설명** — 어떤 사용자 시나리오가 필요한가.
3. **기존 필드로 표현 불가능한지 검토** — 특히 `extensions` 로 충분한지.
4. **분류** — Core · Domain · Extension 중 어디인가.
5. **하위호환성 분석** — 기존 제출이 깨지는가.
6. **버전 결정** — MAJOR / MINOR / PATCH ([SCHEMA_VERSIONING_POLICY](SCHEMA_VERSIONING_POLICY.md)).
7. **Migration 예제 작성** — 이전 → 이후 변환 예.
8. **SDK 업데이트** — enum 상수·타입·검증.
9. **공개 공지** — 참가팀 전체 공지.
10. **테스트 통과 후 적용** — `npm run test` 전부 통과.

## 승격 경로

```
팀 아이디어 → extensions.<teamId>  (자유, 즉시)
        → 여러 팀이 같은 의미를 필요로 함
        → Domain Contract (MINOR, 공지 후)
        → 모든 환경에 공통 필요
        → Core Contract (MAJOR — 해커톤 중 금지)
```

## 변경 시 함께 수정할 것

| 변경 | 함께 수정 |
| --- | --- |
| enum 값 추가 | `packages/profile-contract/src/enums.ts` → `tools/generate-schemas.ts` · `tools/generate-vocabularies.ts` 재실행 |
| 도메인 필드 추가 | 위 + `validator.ts` 의 `checkClosed`/`SECTION_RULES` + 데이터 사전 |
| 새 환경팩 | `ENVIRONMENT_PACK_GUIDE` + `schemas/domains/<id>.context.schema.json` + 레지스트리 |
| 새 Action | `schemas/registry/action-registry.json` 등록 (extensions 로 추가 불가) |

스키마는 **enum 소스에서 생성**되므로 손으로 고치지 말고 생성기를 다시 실행하세요.
테스트(`tests/contract/schema-consistency.test.ts`)가 불일치를 잡아냅니다.
