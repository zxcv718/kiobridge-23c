<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# TROUBLESHOOTING

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| "Simulation API 에 연결할 수 없습니다" 배너 / `Failed to fetch` | 백엔드 미실행 | `npm run dev` (web:3000 + simulation-api:4000). `curl http://localhost:4000/api/health` 로 확인 |
| 세션이 계속 `WAITING` | 참가팀 제출이 아직 없음(정상) | 참가팀 서비스가 제출하거나, 공식 UI 에서 예제/JSON 제출 |
| 제출했는데 웹이 안 넘어감 | 폴링 주기(1초) 대기 중이거나 다른 세션에 제출 | 세션 ID 확인, 1~2초 대기 |
| `SCHEMA_INVALID` | 핵심 객체에 임의 필드(additionalProperties:false) 또는 필수 필드 누락 | 임의 필드는 `extensions` 로, 필수 필드 확인 |
| `PERSONAL_DATA_NOT_ALLOWED` | 주민번호/전화/이메일/카드번호 형식 값 포함 | 합성/가명 값만 사용 |
| validate 는 통과했는데 execute 가 이상 | (구버전) — 현재 validate 가 전체 dry-run 하므로 execute 전에 상태 오류가 잡힘 | 검증 오류(actionIndex 포함)를 먼저 해결 |
| `STATE_MISMATCH [#n]` | n 번째 Action 의 expectedBefore/After 가 transition 과 불일치 | Fixture 의 transitions 와 맞추기 |
| `TARGET_NOT_VISIBLE` | targetId 가 현재 화면(state)의 controls 에 없음 | screens.json 의 해당 상태 controls 확인 |
| `BOUNDARY_NOT_REACHED` / `MISSING_VERIFIER` | 검토 경계 미도달 또는 verifier 누락 | 경계 상태까지 진행 + 필수 verifier 실행 |
| 결제 넣었는데 FAIL | 결제 Action 은 계획 단계부터 금지 (planned>0 → FAIL) | 결제/실제처리 Action 제거 |
| 포트 충돌(EADDRINUSE) | 3000/4000 사용 중 | 프로세스 종료 또는 `PORT`/`VITE_CORE_API_URL` 변경 |
| Windows/Linux 설치 실패 | ZIP 에 macOS node_modules 포함 | node_modules 제외, `npm ci` 로 재설치 |

크로스플랫폼: macOS/Windows/Linux/Codespaces/Docker 에서 `npm ci` 후 `npm run dev`.
ZIP 에는 `node_modules`, `dist`, `__MACOSX` 를 넣지 마세요 (`.gitignore` 참고).
