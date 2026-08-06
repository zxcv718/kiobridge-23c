# 연습용 Sandbox — 참가팀 가이드

`[권장]` 환경 ID: `sandbox` · **평가 대상이 아닙니다**

## 왜 Sandbox 부터인가

공식 3환경은 완성 예제를 제공하지 않습니다. Sandbox 는 평가 대상이 아니므로
**완성된 제출 예제 하나**가 들어 있어, 전체 흐름이 어떻게 도는지 먼저 눈으로 볼 수 있습니다.

```bash
npm run participant:demo
```

## 이 환경의 구성

| 항목 | 값 |
| --- | --- |
| 후보 | 6개 (`SANDBOX-001` … `SANDBOX-006`) |
| 옵션 그룹 | `SIZE` (필수) |
| 화면 | `WELCOME` → `ITEM_SELECTION` → `OPTION_SELECTION` → `REVIEW` |
| 검토 경계 | `REVIEW` |

후보가 6개이므로 **카드 화면이 2페이지**가 됩니다. 한 페이지에 4개씩 보입니다.
완성 예제는 일부러 **두 번째 페이지 후보**를 고르도록 되어 있습니다 —
참가팀이 페이지 이동 Action 을 만들 필요가 없다는 것을 보여주기 위해서입니다.

## 완성 예제 위치

```
examples/submission-format-example/sandbox.json   ← 실행 가능
examples/annotated/06-complete-sandbox-submission.annotated.jsonc   ← 설명용 (제출 불가)
```

## Sandbox 로 연습할 것

- [ ] 세션 생성 → 제출 → 검증 → 실행 → Evidence 왕복
- [ ] 브라우저에서 가상 키오스크가 움직이는 것 확인
- [ ] 카드가 4개씩 두 페이지로 나뉘는 것 확인
- [ ] Evidence 의 `resolvedSimulationTrace` 에서 page/slot 확인
- [ ] 일부러 값을 틀리게 넣어 오류코드가 어떻게 나오는지 확인

## Sandbox 에서 하지 않을 것

- Sandbox 제출을 최종 제출로 내지 마세요. 평가 대상이 아닙니다.
- Sandbox 완성 예제를 공식 환경에 복사해도 동작하지 않습니다.

## 다음

Sandbox 왕복이 PASS 되면 [환경 목록](README.md)에서 공식 환경 하나를 고르세요.
