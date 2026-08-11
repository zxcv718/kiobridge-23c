# 팀 23C — 주문 도우미

키오스크 앞에서 작은 글씨와 깊은 옵션 메뉴 때문에 주문을 포기하는 분들이 있습니다.
이 서비스는 그분들에게 **로그인 없이 큰 버튼으로 몇 가지만 여쭤보고**, 알레르기와 예산을
지킨 메뉴를 왜 그것인지와 함께 추천한 다음, 확인을 받아 가상 키오스크에서 장바구니까지
대신 눌러 드립니다. 결제는 사람이 직접 하도록 남겨 둡니다.

2026 영그라운드 MVP 해커톤 출품작이고, 주최 측이 준 **KioBridge Simulation Kit** 위에서
동작합니다. 환경은 `chicken-store`(닭강정 가게) 하나를 골랐습니다.

- 지금 돌아가는 화면: **https://kiobridge-23c-demo.vercel.app** (모바일 폭 기준으로 만들었습니다)
- 작업 규칙과 브랜치 흐름: [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## 먼저 알아 두실 것 — 폴더가 두 개입니다

처음 오시면 가장 헷갈리는 부분이라 먼저 적습니다.

이 저장소에는 **우리가 만든 것만** 들어 있습니다. 그런데 이 서비스는 혼자 돌지 않고,
주최 측이 나눠 준 **키트**(시뮬레이션 플랫폼)가 있어야 제출물을 만들 수 있습니다.
그 키트는 이 저장소에 없습니다. 여러분이 받은 ZIP 을 **따로 압축 풀어** 쓰시게 됩니다.

정리하면 여러분 컴퓨터에는 폴더가 둘 생깁니다.

```
~/어딘가/kiobridge-23c/                    ← 이 저장소. 화면 만들고 고치는 곳
~/어딘가/kiobridge-kit/…-v5.1.x/           ← 키트. 제출물 만들 때만 쓰는 곳
```

**대부분의 작업은 첫 번째 폴더에서만 하시면 됩니다.** 화면을 고치고, 검사를 돌리고,
배포하는 것까지 전부 거기서 됩니다. 키트는 제출물(심사에 내는 8개 파일)을 새로 만들 때만
필요하고, 그건 자주 하는 일이 아닙니다.

왜 이렇게 나눠 놨냐면, 주최 측이 키트를 계속 새 버전으로 내주기 때문입니다. 갱신 절차가
「새 키트를 별도 폴더에 풀고 참가팀이 만든 파일만 옮겨라」이고, 그러려면 우리 파일이
한곳에 모여 있어야 합니다. 실제로 그 사이 v5.1.6 RC5 까지 나왔고, 우리 파일 폴더 하나를
복사하는 것으로 이주가 끝났습니다.

---

## 1단계 — Node 버전 맞추기

키트가 **Node 20 또는 22 만** 지원합니다. **24 이상은 쓰지 마세요.** 주최 측이 명시적으로
금지했고, 실제로 24 에서는 키트 도구가 다르게 동작합니다.

지금 버전부터 확인해 주세요.

```bash
node -v
```

`v20.x` 나 `v22.x` 가 나오면 그대로 두시면 됩니다. 다른 숫자가 나오거나 `command not found`
가 나오면 [nvm](https://github.com/nvm-sh/nvm) 으로 맞추는 것이 가장 편합니다.

```bash
# nvm 이 없다면 먼저 설치 (설치 후 터미널을 새로 여세요)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

nvm install 22
nvm use 22
node -v          # v22.x 가 나오면 됩니다
```

터미널을 새로 열 때마다 `nvm use 22` 를 다시 해야 할 수 있습니다. 매번 하기 번거로우면
`nvm alias default 22` 로 기본값을 바꿔 두세요.

---

## 2단계 — 저장소 받고 설치하기

경로는 어디든 좋습니다. 다만 3단계의 키트와 **다른 폴더**여야 합니다.

```bash
git clone https://github.com/zxcv718/kiobridge-23c.git
cd kiobridge-23c
npm ci
```

`npm ci` 는 `package-lock.json` 에 적힌 **정확히 그 버전들**을 설치합니다. `npm install`
과 달리 버전을 새로 고르지 않기 때문에, 세 사람이 완전히 같은 것을 쓰게 됩니다.
1~2분 걸리고, 중간에 `npm warn deprecated …` 가 여러 줄 지나가는 것은 정상입니다.

여기까지 하면 **화면 개발에 필요한 것은 전부 끝났습니다.**

> **`npm ci` 가 실패한다면** 대개 Node 버전 때문입니다. `node -v` 를 다시 확인해 주세요.
> 그래도 안 되면 `rm -rf node_modules && npm ci` 로 한 번 지우고 다시 해 보세요.

---

## 3단계 — 화면 띄워 보기

```bash
npm run dev
```

`http://localhost:5173` 이 뜹니다. 브라우저에서 열고 **개발자 도구로 모바일 크기(390×844
정도)로 바꿔서** 보세요. 이 서비스는 키오스크 앞에서 폰으로 쓰는 것을 전제로 만들었기
때문에, 데스크톱 넓이로 보면 디자인과 다르게 보입니다.

첫 화면에서 「새로 설정하기」를 누르면 프로필 만들기(글씨 크기·고대비·화면 안내) 세 걸음을
지나 QR 화면, 그다음 질문 7개, 추천, 확인, 결과까지 이어집니다. 한 바퀴 돌아 보시면 우리가
무엇을 만들고 있는지 가장 빨리 아실 수 있습니다.

이때 **Simulation API 가 없어도 됩니다.** 없으면 내장 데이터로 도는 «체험 모드»가 되고,
배포된 주소도 같은 모드로 돕니다. 즉 지금 보시는 것이 심사위원이 보는 것과 같습니다.

---

## 4단계 — 검사 돌려 보기

고치기 전에 한 번 돌려서 **원래 초록인 상태**를 봐 두시는 것을 권합니다. 그래야 나중에
무언가 빨개졌을 때 그게 내가 만든 것인지 알 수 있습니다.

```bash
npm run typecheck    # 타입이 맞는가
npm test             # 단위 검사 141개
npm run build        # 배포본이 실제로 만들어지는가
```

e2e(실제 브라우저로 화면을 눌러 보는 검사)는 **개발 서버가 떠 있어야** 돕니다.
터미널을 하나 더 열어서:

```bash
npm run dev          # 첫 번째 터미널 (계속 켜 둠)
npm run test:e2e     # 두 번째 터미널
```

처음 한 번은 브라우저를 내려받느라 시간이 걸립니다(`npx playwright install chromium`).

### 각 검사가 무엇을 보는지

| | |
| --- | --- |
| `typecheck` | 타입 오류. 화면을 고치다 필드 이름을 잘못 쓰면 여기서 걸립니다 |
| `test` | 추천 엔진의 판단, **색 대비**, **터치 타깃 48px**, 디자인 토큰, 키트 규칙 목록 |
| `test:e2e` | 실제 브라우저로 화면을 눌러 봅니다. 시안 좌표와 접근성도 실측합니다 |
| `build` | 배포본이 만들어지는지 |

단위 검사가 접근성까지 보는 것이 이 프로젝트의 특징입니다. 색을 새로 넣으면 대비 계산기가
자동으로 그 색도 재고, 기준에 못 미치면 실패합니다. 「접근성을 지켰다」를 말로만 주장하지
않으려고 그렇게 만들었습니다.

---

## 5단계 — 키트 준비 (제출물 만들 때만)

**당장은 안 하셔도 됩니다.** 화면만 고치실 거면 4단계까지로 충분합니다.
제출물을 새로 만들어야 할 때 돌아와 주세요.

주최 측에서 받은 ZIP 을 이 저장소와 **다른 폴더**에 푸세요.

```bash
mkdir -p ~/kiobridge-kit
unzip ~/Downloads/kiobridge-simulation-kit-v5.1.x-participant.zip -d ~/kiobridge-kit
cd ~/kiobridge-kit/kiobridge-simulation-kit-v5.1.x
npm ci
npm run participant:doctor
```

마지막 줄에서 **`[READY]`** 가 나오면 준비된 것입니다. 중간에 `[FAIL]` 이 있으면 그 줄이
무엇이 문제인지 알려 줍니다(대개 Node 버전이거나 `npm ci` 를 안 한 것입니다).

`[WARN] Simulator Web :3000 응답 없음` 은 무시하셔도 됩니다. 키트가 제공하는 별도 화면인데
우리 작업에는 필요하지 않습니다.

---

## 제출물 만들기

우리 파일을 키트로 옮기고, 키트 안에서 돌립니다. 순서가 중요합니다.

```bash
# 1. 우리 파일을 키트로 복사
cp -R ~/어딘가/kiobridge-23c/workspace/23C  ~/kiobridge-kit/<키트>/workspace/23C
cd ~/kiobridge-kit/<키트>

# 2. API 서버 켜기 (터미널을 하나 더 열어 계속 켜 두세요)
npm run start:api

# 3. 검사 — 여기서 실패하면 4번으로 넘어가지 마세요
npx tsx workspace/23C/verify-combinations.ts      # 조합 12,960개
npx tsx workspace/23C/verify-scenarios.ts         # 시나리오 A1–A5

# 4. 제출물 만들기 → 공식 검증 → 패키징
npx tsx workspace/23C/build-submission.ts
npm run participant:validate -- --file "$PWD/workspace/23C/output/participant-submission.json" --execute
npm run participant:package -- --team 23C --file "$PWD/workspace/23C/output/participant-submission.json"

# 5. 반드시 마지막
npx tsx workspace/23C/install-readme.ts
```

**5번을 빼먹으면 안 됩니다.** `participant:package` 는 돌 때마다 제출용 README 를
「(채우세요)」가 여덟 칸 있는 **빈 서식으로 덮어씁니다.** `install-readme.ts` 가 우리가 쓴
원본(`workspace/23C/submission-readme.md`)을 다시 깔고, 해시가 네 곳에서 일치하는지까지
검사합니다. 실제로 한 번 이 단계를 잊어서 문단이 통째로 날아간 적이 있어 스크립트로
만들어 두었습니다.

제출용 README 내용을 고치실 때는 `submission-output/` 이 아니라
**`workspace/23C/submission-readme.md`** 를 고치세요. 저쪽은 어차피 덮어써집니다.

다 되면 만들어진 `submission-output/23C/` 8개 파일을 이 저장소로 되가져와 커밋합니다.

---

## 저장소에 무엇이 있나

```
workspace/23C/            우리가 만든 것 전부
  src/core/                 추천 판단 로직 (화면과 CLI 가 같은 코드를 씁니다)
  ui/                       화면 (React + Vite)
  tests/                    단위 141 + 화면 e2e 102
  build-submission.ts       제출물 만들기
  install-readme.ts         제출 README 설치
  submission-readme.md      제출 README 원본 ← 여기를 고치세요
  FIGMA_RULES.md            디자인을 코드로 옮길 때의 판단 기준
submission-output/23C/    심사에 내는 8개 파일
packages/                 @kiobridge/* — 키트 파일 (건드리지 않습니다)
environments/chicken-store/  후보·가격·안전규칙 — 키트 파일 (건드리지 않습니다)
```

마지막 둘은 키트 파일인데 여기 함께 둡니다. 우리 코드가 **그것을 가져다 컴파일하기**
때문에 없으면 CI 가 `npm ci` 부터 실패하고, `@kiobridge/*` 는 npm 에 올라가 있지 않아
따로 받을 방법도 없습니다. **읽기만 하고 고치지는 마세요** — 공식 심사는 깨끗한 키트에서
다시 돌리므로 우리가 고친 것은 반영되지 않고, 「내 컴퓨터에서만 되는」 코드만 남습니다.

---

## 하루 작업은 이렇게 흘러갑니다

```bash
git switch main && git pull        # 남이 올린 것 받기
git switch -c feat/무엇을-한다      # 브랜치 만들기
npm run dev                        # 화면 띄워 놓고 고치기
npm run typecheck && npm test      # 올리기 전에 확인
git push -u origin feat/무엇을-한다
```

push 하면 나머지는 자동입니다. PR 이 자동으로 열리고, 검사가 통과하면 자동으로 `main` 에
병합되고, 곧바로 배포까지 나갑니다. 아직 올리고 싶지 않으면 PR 에 **`hold` 라벨**을 붙이면
자동 병합만 멈춥니다.

`main` 에는 직접 push 할 수 없습니다. 저장소 주인도 마찬가지입니다 — 검사를 통과한 커밋만
들어갈 수 있고, 그 통과는 브랜치에서 생깁니다.

자세한 것은 [`CONTRIBUTING.md`](CONTRIBUTING.md) 에 있습니다. 화면을 고치실 거라면
**디자인이 기준**이라는 부분을 꼭 읽어 주세요.

---

## 막혔을 때

| 증상 | 대개 이것입니다 |
| --- | --- |
| `npm ci` 실패 | Node 버전. `node -v` 로 20 또는 22 인지 확인 |
| `npm run dev` 는 되는데 화면이 이상함 | 브라우저를 모바일 폭(390×844)으로 바꿔 보세요 |
| `test:e2e` 가 전부 실패 | 개발 서버(`npm run dev`)가 안 떠 있는 경우입니다 |
| e2e 의 `D11` 만 실패 | 정상입니다. 그 검사는 키트 API 가 있어야 돌아 CI 에서 제외돼 있습니다 |
| `participant:doctor` 가 `[FAIL] Product 불일치` | 다른 버전 키트의 API 가 `:4000` 에 떠 있습니다. 그것부터 끄세요 |
| 제출 README 가 「(채우세요)」로 바뀜 | `install-readme.ts` 를 안 돌렸습니다 |

그래도 막히시면 그냥 물어봐 주세요. 대부분 위 표에 없는 것이면 저희도 처음 보는 것이라,
같이 보는 편이 빠릅니다.
