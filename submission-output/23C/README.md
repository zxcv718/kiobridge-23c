# 23C 최종 제출

| 항목 | 내용 |
| --- | --- |
| 팀명 | 23C |
| 환경 | `chicken-store` |
| 서비스 한 줄 소개 | 키오스크 앞에서 작은 글씨·깊은 옵션 때문에 주문을 포기하는 사용자가, 로그인 없이 큰 버튼 질문에 답하면 알레르기·예산을 지킨 추천과 그 이유를 받고, 확인 후 가상 키오스크에서 장바구니까지 안전하게 완주하는 주문 도우미 |
| 사용자 정보 수집 방식 | 웹 폼(선택형 큰 버튼 마법사 7문항: 이용방식·맵기·형태·수량·컵·알레르기·예산) + 접근성 설정 7종 토글. 로그인 없음, 자유 텍스트 입력 없음 — 모든 값이 입력 시점에 공식 enum으로 구조화됩니다. 보호자·직원 대리 입력 시 `preferredInput=ASSISTED` · `collectionChannel=ASSISTED_INPUT`으로 출처를 기록합니다. 음성 입력은 미구현이므로 선택지에 노출하지 않습니다. |
| 추천 방식 요약 | ① 하드 제약(알레르기·가격 상한·품절·이용방식 미지원)은 감점이 아니라 후보 제거 ② 생존 후보를 결정론 가중 스코어(맵기25·형태20·이용방식25·컵10·가격여유20)로 랭킹하고 scoreBreakdown 기록 ③ 외부 맥락(시간대)은 정렬 순서만 조정 — 후보를 제거하지 않고, 사용자가 이용 방식을 직접 고르면 개입하지 않습니다(하드제약 > 선호 > 맥락) ④ 이유는 '[근거]+[행동]' 문장으로 생성하고 제외 사유·대안 2건을 함께 제시 ⑤ **선택 옵션은 사용자 선호를 정확히 만족할 때만 실행계획에 넣습니다** — 못 맞추면 다른 값으로 대체하지 않고 생략한 뒤 그 사실을 화면에 알립니다 ⑥ 하드 제약 UNKNOWN 또는 낮은 신뢰 미확인 값이면 재확인을 요구하고 승인 버튼을 잠급니다. |
| 접근성 고려사항 | 공식 profile.accessibility 7개 플래그를 모두 열었고 각 토글이 화면에서 실제로 바꾸는 것이 있습니다(큰 글씨·고대비·쉬운 말·그림 병기·소리 미사용 고지·타깃 확대·직원 도움 상시 노출). **선언이 아니라 측정입니다** — 실제 브라우저에서 키보드 완주, 포커스 가시성, 모든 조작 요소 48px 이상, 200% 확대 시 가로 스크롤 없음, 색상 비의존을 자동 측정해 6/6 통과했습니다(`workspace/23C/tests/e2e/keyboard.spec.ts`). 정적 보증 11건은 `tests/a11y.test.ts`가 검사합니다. |
| 실행 방법 | 키트 루트에서 ① `npm ci` ② `npm run start:api` ③ `npx vite --config workspace/23C/ui/vite.config.ts` → http://localhost:5173. 공식 시뮬레이터를 함께 보려면 `npx vite --config workspace/23C/tools/simulator-web.vite.config.ts`(:3000). 외부 체험용: https://kiobridge-23c-demo.vercel.app (서버 없이 추천~계획 JSON 생성까지 동작하며, 결과 화면에 로컬에서 받은 지난 Evidence를 '사전 생성 기록'으로 세션 ID·생성시각과 함께 명시해 표시합니다). ※ 진행률은 `npx tsx tools/participant-cli.mjs progress --team 23C` 사용(별도 제보한 Node 버전 이슈). |
| 알려진 제한사항 | ① 가중치는 튜닝 중이며 근거는 `core/engine.ts` WEIGHTS 주석에 있습니다 ② 음성 입력·QR 시작 미구현 — 선택지로도 노출하지 않습니다 ③ 상황신호는 시간대·재고 2종이며 외부 API를 쓰지 않습니다 ④ 제출 환경은 닭강정 1개입니다(PARTICIPANT_CHECKLIST §3 '중 하나 선택' 기준) ⑤ 고령 사용자 실사용 테스트와 데모 영상은 아직입니다 ⑥ 심사 재실행 시 `npm run dev` 대신 `npm run start:api` 분리 기동 권장(별도 제보함) |
| Submission SHA-256 | `3ec2be6a32109e8b74f594b440562a12ffb21c465f980bb5a2c362a774a22a8f` |

## 선택 채널 사용 내역

스키마가 열어 둔 선택 필드 3종을 모두 사용했습니다. 안전규칙을 우회하지 않으며 `extensions`는 Evidence에 감사 기록됩니다.

| 필드 | 내용 |
| --- | --- |
| `extensions["23C"]` | 구현 기능 목록, 랭킹 가중치, 상황신호 개수, 외부 API·LLM 미사용 선언 |
| `accessibilityEvidence` | 제공 supportModes 6종, 이번 세션에 켜진 채널, 프로필 플래그, UI 보증치와 **측정 결과**, 미구현 항목(VOICE_INPUT) |
| `teamMetadata` | 팀·서비스·환경·fixture 식별 정보 |
| `sessionContext.extensions["TEAM_23C.contextSignals"]` | 시간대·재고 신호(출처·관측시각·만료시각·신뢰도 포함) |

## 검증 결과

```
공식 검증        valid · 오류 0 · 경고 0
SIMULATION       PASS · NORMAL_BOUNDARY_STOP
호환규칙         BLOCK 0 · WARN 0
검토화면         필수 필드 미해결 0
자체 테스트      62
접근성 브라우저 실측  6
깨끗한 키트 재실행   PASS (운영진 공식 판정과 동일 조건)
```

## 포함 파일

| 파일 | 설명 |
| --- | --- |
| `participant-submission.json` | 공식 재실행 대상 |
| `simulation-evidence.json` | 이 팀 환경에서의 실행 증거 |
| `submission.sha256` | 무결성 확인 |
| `validation-report.md` | 검증 요약 |
| `environment-version.json` | 환경·버전 기록 |
| `participant-ux.json` | 팀의 사용자 접점 선언 |
| `MANUAL_REVIEW_CHECKLIST.md` | 사람이 확인하는 항목 |
| `demo-video.mp4` | (선택) 시연 영상 |
