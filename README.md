# 팀 23C — 주문 도우미 (KioBridge 해커톤)

키오스크 앞에서 작은 글씨·깊은 옵션 때문에 주문을 포기하는 사용자가, 로그인 없이 큰 버튼
질문에 답하면 **알레르기·예산을 지킨 추천과 그 이유**를 받고, 확인 후 가상 키오스크에서
장바구니까지 안전하게 완주하는 서비스.

| | |
| --- | --- |
| 배포 | https://kiobridge-23c-demo.vercel.app |
| 환경 | `chicken-store` (공식 3환경 중 1개) |
| 상태 | SIMULATION **PASS** · `NORMAL_BOUNDARY_STOP` · 결제 계획 0 / 실행 0 |
| 같이 만들려면 | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

---

## 처음 한 번 — 환경 만들기

### 1. Node 20 또는 22

키트가 **20.x 또는 22.x 만** 지원합니다. **24 이상은 쓰지 마세요.**

```bash
node -v          # v20.x 또는 v22.x 여야 함
nvm install 22   # 아니라면
nvm use 22
```

### 2. 이 저장소

경로는 아무 데나 좋습니다. 아래 3번의 키트와 **다른 폴더**이기만 하면 됩니다.

```bash
git clone https://github.com/zxcv718/kiobridge-23c.git
cd kiobridge-23c
npm ci
```

여기까지만 하면 **화면 개발·검사·배포는 전부 됩니다.**

```bash
npm run dev          # :5173 우리 서비스
npm run typecheck    # 타입
npm test             # 단위 137
npm run test:e2e     # 화면 e2e 102 (dev 서버가 떠 있어야 함)
npm run build        # 배포본 빌드
```

### 3. 키트 — 제출물을 만들 때만

주최 측이 ZIP 으로 나눠 준 시뮬레이션 키트입니다. **이 저장소에는 없습니다.**
각자 받은 ZIP 을 **별도 폴더**에 풀어 두세요.

```bash
unzip kiobridge-simulation-kit-v5.1.x-participant.zip -d ~/kiobridge-kit
cd ~/kiobridge-kit/kiobridge-simulation-kit-v5.1.x
npm ci
npm run participant:doctor      # [READY] 가 나와야 함
```

키트를 새 버전으로 갈아탈 때도 같습니다 — **새 ZIP 을 별도 폴더에 풀고, 우리 파일만 옮깁니다**
(운영진 안내). 우리 파일은 이 저장소의 `workspace/23C/` 하나가 전부입니다.

---

## 저장소에 무엇이 있나

```
workspace/23C/          우리가 만든 것 전부
  src/core/               판단 로직 (화면·CLI 공유, 순수 모듈)
  ui/                     사용자 접점 (React + Vite)
  tests/                  단위 137 + 화면 e2e 102
  build-submission.ts     제출물 만들기
  install-readme.ts       제출 README 설치 (해시 4곳 대조 포함)
  FIGMA_RULES.md          디자인을 코드로 옮길 때의 판단 기준
submission-output/23C/  제출 패키지 8종
packages/               @kiobridge/{contracts,participant-sdk,profile-contract}
environments/chicken-store/
```

`packages/` 와 `environments/chicken-store/` 는 키트 파일인데 여기 함께 둡니다.
우리 코드가 **컴파일되는 대상**이라 없으면 CI 가 `npm ci` 부터 실패하고,
`@kiobridge/*` 는 npm 에 없어(404) 내려받을 방법도 없기 때문입니다.
나머지 키트(도구·API·문서·Docker)는 제출물을 만들 때만 쓰이므로 각자 로컬 키트에서 씁니다.

---

## 제출물 만들기 (로컬 키트에서)

우리 파일을 키트로 옮기고, 키트 안에서 돌립니다.

```bash
cp -R <이 저장소>/workspace/23C  ~/kiobridge-kit/<키트>/workspace/23C
cd ~/kiobridge-kit/<키트>
npm run start:api                                    # :4000 — 다른 터미널에

npx tsx workspace/23C/verify-combinations.ts         # 조합 12,960
npx tsx workspace/23C/verify-scenarios.ts            # 시나리오 A1–A5
npx tsx workspace/23C/build-submission.ts
npm run participant:validate -- --file "$PWD/workspace/23C/output/participant-submission.json" --execute
npm run participant:package -- --team 23C --file "$PWD/workspace/23C/output/participant-submission.json"
npx tsx workspace/23C/install-readme.ts              # 반드시 마지막
```

마지막 줄을 빼먹으면 안 됩니다 — `participant:package` 가 제출 README 를 **빈 서식으로
덮어쓰기** 때문입니다. `install-readme.ts` 가 원본(`workspace/23C/submission-readme.md`)을
다시 깔고 해시 네 곳이 일치하는지까지 검사합니다.

만들어진 `submission-output/23C/` 8종을 이 저장소로 되가져와 커밋합니다.

---

## 자동화

브랜치를 push 하면 PR 이 자동으로 열리고, CI(`gate`)가 통과하면 자동 병합된 뒤 배포까지
나갑니다. 자세한 것과 멈추는 법은 [`CONTRIBUTING.md`](CONTRIBUTING.md) 에 있습니다.

CI 는 **배포되는 화면만** 봅니다 — 배포본에는 Simulation API 가 없으므로 CI 도 API 없이
돌려, 심사위원이 여는 주소와 같은 조건에서 잽니다. 제출물 검증·조합·시나리오는 위의
로컬 절차가 맡습니다.
