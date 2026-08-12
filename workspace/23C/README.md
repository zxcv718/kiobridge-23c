# 23C 작업 폴더 — 데모 구현 완료 (2026-08-05 · 최종 갱신 2026-08-07)

| 항목 | 값 |
| --- | --- |
| 팀 ID | `23C` |
| 환경 | `chicken-store` (닭강정 가게) — **8/7 공식회신 A-1로 확정**(공식 3환경 중 1개, 현행 유지 승인) |
| 제품 버전 | `5.1.4` · 입력계약 `1.0.0` |
| 상태 | **9/9 구현 · 자체 테스트 78개 그린 · SIMULATION PASS · 데모 UI 동작 · 제출 8종 체크리스트 12/12** |
| 제출 SHA-256 | `dfb09eb504a2979c13e4557ccad62f8a8a4022933e69005fee8a632172a58b3e` |
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
tests/                 vitest 78개 (5파일) — 단위 + 공개 예제 재현 + 경계 시나리오 + 접근성
ui/                    데모 UI (Vite+React — 키트 루트 의존성 재사용, 별도 설치 불필요)
```

**설계 원칙**: 판단은 전부 `core/*` 순수 함수(CLI·UI 단일 진실). 브라우저 번들을 위해 값 import는
`@kiobridge/profile-contract`에서(SDK 인덱스는 evaluator→node:fs를 재수출해 브라우저에서 깨짐 — 타입 import는 무관).
가중치는 `core/engine.ts`의 `WEIGHTS` 한 곳(맵기25·형태25·이용방식25·가격25 — 심사 대상, 킥오프에서 튜닝).
컵은 질문에서 빼면서 점수에서도 뺐다(질문 6개). 실행계획이 외부 입력의 `cupOption` 을 존중하는 것은 그대로다.
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
npx tsx tools/participant-cli.mjs progress --team 23C   # 9/9 (v5.1.4 한정 우회 — 아래 주의 참조)
npx vitest run -c workspace/23C/vitest.config.ts        # 자체 스위트 124개
npx tsx workspace/23C/src/run.ts                        # CLI 파이프라인 → output/ 생성
npm run participant:validate -- --file workspace/23C/output/participant-submission.json --execute
npm run participant:package  -- --team 23C --file workspace/23C/output/participant-submission.json
```

> **v5.1.6 이관 시 이 블록을 고칠 것** — 첫 줄의 `npx tsx` 우회는 *현재 쓰는 v5.1.4에서만* 필요하다
> (`npm run participant:progress`가 Node 22에서 `.ts` import 실패). 우리가 제보한 이 버그는 **v5.1.6에서
> 수정 완료**(공식회신 B-1)이므로, 새 키트에서는 `npm run participant:progress -- --team 23C`를 그대로 쓰고
> 이 우회 줄과 본 주의문을 삭제한다. 지원 Node는 **20·22 LTS**(24+ 금지, 현재 v22.12.0).

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
- 발표자료(P2, 8/14 예정) · 제출 직전 깨끗한 폴더 재검증(§8.4 — `npm ci` → **`npm run start:api`** → `validate --execute`)

## v5.1.6 이관 체크리스트 (RC 미수령 — FINAL 공지 대기)

새 키트는 **별도 폴더에 압축 해제**하고 `node_modules`는 복사하지 않는다. 기존 프로젝트는 삭제하지 말고,
참가팀 작성 파일(`workspace/23C/**` + 서비스 UI)만 옮긴 뒤 `doctor`→`progress`→`validate`→`package`로 재검증한다.
입력계약 1.0.0은 유지되므로 재구현은 불필요하다.

1. **`ui/vite.config.ts`의 alias 재점검 — 최우선.** 현재 `@kiobridge/participant-sdk`·`@kiobridge/evaluator`를
   `src/index.ts`로 **직접** 가리키고 있어, v5.1.6의 브라우저/Node 진입점 분리(회신 B-3) 효과를 받지 못한다.
   Node 전용 evaluator가 브라우저 번들에 다시 딸려올 수 있으므로 브라우저 진입점으로 교체한다.
2. 위 "검증 루프"의 `npx tsx` 우회 줄 삭제 (B-1 수정 반영).
3. 검증·재실행 명령은 `npm run start:api`로 통일 (B-2). `npm run dev`는 소스 수정 중 watch 용도로만.
4. `tools/simulator-web.vite.config.ts`의 `/health` 프록시·문서링크 우회 2건은 회신에 언급이 없다 —
   새 키트에서 버그 재현 여부를 확인한 뒤 존치/제거를 결정한다.
5. RC는 개발·호환성 확인용이다. **최종 제출 기준본은 운영진 FINAL 공지**를 따르고, 그 버전에서 재검증을 1회 더 돌린다.
