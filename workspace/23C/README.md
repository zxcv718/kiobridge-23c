# 23C 작업 폴더 — 데모 구현 완료 (2026-08-05)

| 항목 | 값 |
| --- | --- |
| 팀 ID | `23C` |
| 환경 | `chicken-store` (닭강정 가게) |
| 제품 버전 | `5.1.4` · 입력계약 `1.0.0` |
| 상태 | **9/9 구현 · 자체 테스트 34개 그린 · SIMULATION PASS · 데모 UI 동작** |
| 배포 | **https://kiobridge-23c-demo.vercel.app** (정적 — 서버 없이 추천~JSON 생성까지, 로컬 서버 감지 시 실행까지 자동 전환) |

## 구조

```
src/participant.ts     공식 측정 표면 — 9개 함수 (progress가 실제 호출로 검사)
src/core/normalize.ts  동의어 정규화 테이블 (한글 → 공식 enum)
src/core/canonical.ts  STEP 2·3 — RawUserInput → Profile / SessionContext (순수, 브라우저 공용)
src/core/engine.ts     STEP 4~7 — 필터·랭킹(가중치 WEIGHTS)·설명·대안 (순수 결정론)
src/core/plan.ts       STEP 9 — 전이표 기반 의미 실행계획 빌더 (순수)
src/run.ts             CLI: input/raw-user-input.json → output/participant-submission.json
input/                 데모 페르소나(박순자 — 합성 데이터)
tests/                 vitest 33개 — 단위 + 공개 예제 재현 + 경계 시나리오
ui/                    데모 UI (Vite+React — 키트 루트 의존성 재사용, 별도 설치 불필요)
```

**설계 원칙**: 판단은 전부 `core/*` 순수 함수(CLI·UI 단일 진실). 브라우저 번들을 위해 값 import는
`@kiobridge/profile-contract`에서(SDK 인덱스는 evaluator→node:fs를 재수출해 브라우저에서 깨짐 — 타입 import는 무관).
가중치는 `core/engine.ts`의 `WEIGHTS` 한 곳(맵기25·형태20·이용방식25·컵10·가격20 — 심사 대상, 킥오프에서 튜닝).
재질문 의미론: 동점은 재질문 사유가 아니라 이유·대안 제시로 해결, 재질문은 입력 신뢰 문제(UNKNOWN 하드제약·confidence<0.6 미확인)에만.

## 실행 (터미널 3개)

```bash
# 키트 루트에서
npm run start:api      # ① Simulation API :4000 — dev(watch)는 재시작 문제가 있어 데모 중 금지
npm run dev:web        # ② 공식 시뮬레이터 웹 :3000
npx vite --config workspace/23C/ui/vite.config.ts   # ③ 우리 데모 UI :5173
```

## 검증 루프

```bash
npx tsx tools/participant-cli.mjs progress --team 23C   # 9/9 (주의: npm run participant:progress는 Node 22에서 .ts import 실패)
npx vitest run -c workspace/23C/vitest.config.ts        # 자체 스위트 33개
npx tsx workspace/23C/src/run.ts                        # CLI 파이프라인 → output/ 생성
npm run participant:validate -- --file workspace/23C/output/participant-submission.json --execute
npm run participant:package  -- --team 23C --file workspace/23C/output/participant-submission.json
```

## 팀 시연 대본 (5분)

1. **우리 UI**(:5173) — 큰 글씨·고대비 토글, 로그인 없이 "이번 한 번만" 시작 → 질문 6개(포장·매운맛·순살·1개·땅콩 알레르기·예산 1만원).
2. **추천 화면** — 이유 7건("포장을 원하셔서…", "등록하신 알레르기와 겹치는 메뉴 1개를 제외했습니다"), 제외 3건(땅콩·품절·매장전용), 대안 2건, 거절·직원 도움 경로.
3. **공식 시뮬레이터**(:3000)에서 닭강정 세션 시작 → 세션 ID를 우리 UI 확인 화면에 붙여넣고 실행 → **공식 화면에서 가상 키오스크가 실제로 움직이는 재생**(버튼 강조→화면 전환→CART_REVIEW 정지).
4. **결과 화면** — PASS·NORMAL_BOUNDARY_STOP·결제 0/0/0·실기기 명령 false. Evidence JSON 내려받기.
5. **안전 시연** — 오류 주입 6종 버튼: 결제 시도가 `FAIL·SAFETY_STOP·계획1/실행0`으로 즉시 차단되는 모습.

에지 시나리오 재연: 알레르기 "잘 모르겠어요" 선택 → 재확인 배너 + 승인 버튼 비활성 / 예산 6,000·알레르기 다수 → 후보 전멸 → 직원 도움 안내.

## 남은 일 (킥오프 안건)

- 가중치 튜닝 + 산정 근거 문서화(발표 소재) — `WEIGHTS` 한 곳만 수정
- 창의 기능 선택: 음성 입력(confidence 흐름 이미 구현됨)·보호자 모드·QR 프로필
- UI 카피·화면 다듬기(현재는 데모 수준) — 배포는 완료(위 URL), 갱신 시 `npx vite build --config workspace/23C/ui/vite.config.ts` 후 `dist`에서 `npx vercel deploy --prod --yes`
- 발표자료(P2, 8/14 예정) · 제출 직전 깨끗한 폴더 재검증(§8.4)
