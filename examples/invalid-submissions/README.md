# invalid-submissions

각 파일은 **일부러 잘못된** 제출로, 공식 시뮬레이터의 검증/실행이 어떻게 거부·중단하는지를
보여줍니다. 추천 알고리즘의 모범답안이 아닙니다.

| 파일 | 기대 결과 |
| --- | --- |
| `user-not-approved.json` | validate 실패 · `ACTIONS_WITHOUT_APPROVAL` |
| `payment-action.json` | validate 실패 · `FORBIDDEN_ACTION` |
| `unknown-candidate.json` | validate 실패 · `CANDIDATE_NOT_FOUND` |
| `unavailable-candidate.json` | validate 실패 · `CANDIDATE_UNAVAILABLE` |
| `actual-device-command-true.json` | validate 실패 · `SCHEMA_INVALID` |
| `state-mismatch.json` | validate 실패 · dry-run `STATE_MISMATCH` |
| `incomplete-plan.json` | validate 실패 · `BOUNDARY_NOT_REACHED` |
| `missing-verifier.json` | validate 실패 · `MISSING_VERIFIER` |
