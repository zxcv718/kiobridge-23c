# 같이 작업하는 법

## 흐름

```
git switch -c feat/무엇을-한다
... 작업 ...
git push -u origin feat/무엇을-한다
```

push 하면 나머지는 자동입니다.

1. PR 이 자동으로 열립니다.
2. CI(`gate`)가 돕니다 — 타입 · 단위 · 빌드 · 화면 e2e.
3. 통과하면 **자동으로 main 에 병합**되고, 곧바로 배포까지 나갑니다.

아직 올리고 싶지 않으면 PR 에 **`hold` 라벨**을 붙이세요. 자동 병합만 멈추고 CI 는 계속 돕니다.
준비되면 라벨을 떼면 다시 예약됩니다.

커밋은 각자 이름으로 남습니다. 병합 커밋만 자동화가 만듭니다.

## 어디를 고쳐도 되나

**`workspace/23C/` 안에서만 작업합니다.** 나머지는 주최 측이 준 키트이고, 공식 재실행이
깨끗한 키트 위에서 이뤄지므로 우리가 고친 것은 심사에 반영되지 않습니다. 고치면 «내
컴퓨터에서만 되는» 코드가 됩니다.

손대지 않는 곳: `apps/` · `packages/` · `environments/` · `schemas/` · `examples/` ·
`tools/` · 저장소 루트의 `tests/` · 루트 `package.json` · 루트 `tsconfig.json`

`submission-output/23C/` 는 사람이 직접 고치지 않습니다 — 공식 패키저가 만듭니다
(아래 «제출물» 참고).

## 화면을 고칠 때

디자인(Figma)에 있는 화면은 **디자인이 기준입니다.** 문구·색·굵기·크기·여백·순서 전부요.
「우리 것이 더 낫다」는 근거가 되지 않습니다. 우리가 정하는 것은 **디자인이 다루지 않은
것**뿐입니다(디자인에 없는 상태·요건·화면).

판단 기준은 [`workspace/23C/FIGMA_RULES.md`](workspace/23C/FIGMA_RULES.md) 에 있습니다.
새 판단이 필요하면 거기 적고 나서 하는 것이 순서입니다.

크기는 `px` 로 박지 마세요. 디자인 수치는 본문 18px 기준이라 그대로 박으면 «큰 글씨»를
켠 분에게서만 상대적으로 작아집니다. `em` 이나 `calc(var(--fs) * n)` 을 씁니다.

색은 **의미 이름만** 씁니다(`--fg` `--muted` `--brand` …). `--kb-…` 원시 토큰이나 hex 를
화면 CSS 에 직접 쓰면 고대비 모드가 그것만 못 갈아끼웁니다.

## CI 가 보는 것과 안 보는 것

CI 는 **배포되는 화면만** 봅니다 — 배포본에는 Simulation API 가 없으므로 CI 도 API 없이
돕니다. 배포된 주소와 같은 조건에서 재는 것이 요점입니다.

키트 쪽 검증(제출물 생성 · 공식 검증 · 시나리오 재생)은 CI 에 없습니다. 그건 로컬에서
API 를 띄워 놓고 합니다:

```bash
npm run start:api                                   # :4000 — 다른 터미널에
npx tsx workspace/23C/verify-combinations.ts        # 조합 12,960
npx tsx workspace/23C/verify-scenarios.ts           # 시나리오 A1–A5
npx playwright test --config tests/e2e/playwright.config.ts   # workspace/23C 에서 · D11 포함
```

`D11`(오류 주입 7종)은 API 가 있을 때만 화면에 나오는 기능이라 CI 에서 빠져 있습니다.
그 근처를 고쳤다면 **로컬에서 한 번 돌려 주세요.**

## 제출물을 다시 만들 때

화면 문구나 엔진이 바뀌면 제출물 내용이 바뀌고 해시도 바뀝니다. 순서가 있습니다:

```bash
npm run start:api                                   # 먼저 켜 둘 것
npx tsx workspace/23C/build-submission.ts
npm run participant:validate -- --file workspace/23C/output/participant-submission.json --execute
npm run participant:package -- --team 23C --file workspace/23C/output/participant-submission.json
npx tsx workspace/23C/install-readme.ts             # 반드시 마지막
```

마지막 줄을 빼먹으면 안 됩니다. `participant:package` 는 돌 때마다
`submission-output/23C/README.md` 를 **빈 서식으로 덮어씁니다.** `install-readme.ts` 가
`workspace/23C/submission-readme.md` 를 다시 깔고, 해시 네 곳(README · `submission.sha256` ·
`validation-report.md` · 실제 파일)이 같은지까지 검사합니다.

README 내용을 고칠 때는 `submission-output/` 이 아니라 **`workspace/23C/submission-readme.md`**
를 고치세요. 저쪽은 어차피 덮어써집니다.

## 비밀

`.vercel/` 은 `.gitignore` 에 있습니다(OIDC 토큰이 들어갑니다). 저장소가 공개이므로
**절대 강제로 추가하지 마세요.** 배포 토큰은 GitHub Actions 비밀에만 둡니다.
