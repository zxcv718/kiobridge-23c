<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# PENDING_REAL_DEVICE (TODO)

v0.1 은 **실제 좌표를 참고한 Mock UI + 합성 데이터**로 완전히 실행 가능한 시뮬레이터입니다.
아래 항목은 실제 Windows 실기기가 있어야 수집/구현할 수 있으므로 `PENDING_REAL_DEVICE` 로
표시하고 여기에 정리합니다. **현재 코드베이스에는 구현되어 있지 않습니다.**

## 데이터 수집 (실기기 필요)

- [ ] 실제 UPRLite 각 화면의 전체 UIA(UI Automation) 트리 캡처
- [ ] 실제 화면별 스크린샷 및 좌표 검증 (현재는 대표 버튼 좌표만 `ACTUAL_EXTRACTED`)
- [ ] 실제 메뉴/가격/옵션 카탈로그 (현재 닭강정 8종은 `SYNTHETIC_MOCK`)
- [ ] 장바구니 금액/상품명 OCR 실측 데이터 (현재는 참고 영역 좌표만 보유)
- [ ] 병원/관공서 키오스크의 실제 화면 구조 (현재 두 환경은 좌표 없는 논리 Mock)

## 통합 (범위 밖 — 의도적으로 미구현)

아래는 [SAFETY_POLICY](../05_SAFETY_AND_BOUNDARY/SAFETY_POLICY.md) 에 따라 **구현하지 않습니다.** 실기기 연동 단계에서
별도 보안 검토를 거쳐야 합니다.

- [ ] 실제 VoiceBridge 서버 연동
- [ ] 실제 Windows Agent 연동 및 명령 전송
- [ ] 실제 좌표 클릭 / 키 입력 디스패치
- [ ] 실제 결제 / 접수 완료 / 민원 신청

## 코드 TODO

- [ ] `packages/shared-ui` 를 별도 패키지로 분리 (현재 웹 UI 내부에 포함)
- [ ] `packages/environment-sdk` 독립 패키지화 — 현재는 `environment-pack.schema.json` +
      `simulation-api/loader.ts` 로 대체 (환경팩 자동 발견/로딩 동작).
- [ ] **UPRLite Driver 실제 구현** — 현재 `packages/uprlite-driver-contract` 는 인터페이스와
      데이터 형식만 정의하며 모든 메서드가 예외를 던집니다. 실제 UIA·OCR·좌표·Agent 명령은
      구현되어 있지 않고 이번 범위가 아닙니다.
- [ ] **실기기 데이터 수집** — `environments/<id>/bindings/uprlite.binding.json` 은 모두
      `status: PENDING_REAL_DEVICE`, `controls: {}` 입니다. 닭강정 바인딩에는 이전에 추출한
      참고값이 `_referenceCapture` 로 보관되어 있으나 런타임에서 사용되지 않습니다.
- [ ] 실행 자동감지에 **SSE** 적용 — 현재는 1초 폴링(`GET /sessions/:id` / `subscribeRun`).
      기능상 자동 감지는 동작하지만 SSE 전환은 개선 항목.
- [x] JSON Schema 런타임 검증 — simulation-api 의 `validate` 가 ajv + 시맨틱 + dry-run 수행.
- [x] Evidence 서버 일원화 — 웹은 서버 Evidence 만 표시(재계산 없음).
- [ ] `tests/private/` (비공개 채점 테스트) 채움 — 현재는 placeholder. 비공개 평가 정답은
      공개 저장소/ZIP 에 포함하지 않습니다 ([EVALUATION_BOUNDARY](../05_SAFETY_AND_BOUNDARY/EVALUATION_BOUNDARY.md)).
- [ ] 세션 스토어 영속화(DB) — 현재는 in-memory (재시작 시 초기화).
- [x] `tools/` 디렉터리 — `generate-examples.ts`, `submit-demo.ts` 제공.
- [ ] Docker/Codespaces 실제 실행 검증 — 이번 세션에서는 `npm ci`/로컬만 검증, `docker compose
      build` 는 미실행.
- [ ] Playwright E2E 를 CI 에 연결 (`npx playwright install` 필요).

## 표시 규칙

- 실기기에서 실제 데이터를 수집하기 전까지, 해당 화면/상품을 `ACTUAL_EXTRACTED` 로
  표시하지 않습니다.
- 수집이 완료되면 분류를 `PENDING_REAL_DEVICE` → `ACTUAL_EXTRACTED` 로 갱신합니다.
