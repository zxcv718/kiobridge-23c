<!-- npm run package:public 이 생성합니다. release/ 의 사본을 직접 고치지 마세요. -->
# 참가팀 배포 가이드 (운영진용)

`[운영진]` KioBridge Simulation Kit **v{{VERSION}} Participant Edition**

---

## 1. 전달할 파일 — 이것 하나입니다

```
release/kiobridge-simulation-kit-v{{VERSION}}-participant.zip
release/kiobridge-simulation-kit-v{{VERSION}}-participant.zip.sha256
```

**소스 폴더 전체를 압축해 배포하지 마세요.** `node_modules` 와 이전 `release/` 가
함께 들어가 수만 개 파일이 됩니다. 배포본은 반드시 다음으로 만드세요:

```bash
npm run package:public
```

## 2. 배포 절차

1. 참가팀용 ZIP만 업로드
2. SHA-256 을 함께 공지
3. 전체 개발폴더 ZIP 배포 금지
4. 공식 제품 버전 공지 — **{{VERSION}}**
5. Input Contract 버전 공지 — **{{CONTRACT_VERSION}}** (이전 릴리스와 동일, 재작업 불필요)
6. 참가팀에게 `npm run participant:doctor` 결과 확인 요청
7. `npm run participant:demo` 가 SIMULATION PASS 인지 확인 요청
8. 문의 채널 공지
9. 최종 제출 폴더 규칙 공지 → `submission-output/<팀ID>/`
10. **공식 판정은 운영진의 깨끗한 패키지에서 재실행한 결과**임을 공지

## 3. 참가팀 안내문 템플릿

> KioBridge Simulation Kit v{{VERSION}} 을 배포합니다.
>
> 1. ZIP 을 압축 해제하세요. (경로에 한글·공백이 있어도 됩니다)
> 2. **`00_START_HERE.html` 을 더블클릭하세요.** 인터넷 없이 열립니다.
> 3. 처음에는 `packages` 와 `apps` 폴더를 열 필요가 없습니다.
> 4. `npm run participant:doctor` 로 설치를 확인하세요.
> 5. `npm run participant:demo` 가 PASS 되면 `participant-workspace` 에서 개발을 시작하세요.
>
> 제품 버전 {{VERSION}} · inputContractVersion 1.0.0
> SHA-256: `{{SHA256}}`
>
> 막히면 `docs/ERROR_CATALOG.md` 와 `docs/TROUBLESHOOTING_DECISION_TREE.md` 를 먼저 보세요.
> 문의할 때 `npm run participant:doctor` 출력을 함께 보내주세요.


> Example UI 는 로그인 없이 동작하는 참고 예제입니다.
>
> 참가팀은 로그인, QR, 기기 내 저장, 음성 등 다양한 기능을 자유롭게 구현할 수 있습니다.
>
> 단, 로그인하지 않은 사용자도 서비스의 핵심 이용 흐름을 사용할 수 있어야 하며,
> 심사에는 실제 개인정보가 아닌 가상 데이터를 사용해야 합니다.

**운영진이 이렇게 안내하면 안 됩니다**

| 잘못된 안내 | 올바른 안내 |
| --- | --- |
| 로그인 기능은 만들면 안 됩니다 | 로그인은 선택사항이며, 핵심 흐름은 로그인 없이 가능해야 합니다 |
| 사용자 정보를 저장하면 안 됩니다 | 기기 내 저장은 자유이며, 심사 데이터는 가상 데이터를 씁니다 |
| 무조건 Example UI 를 수정해야 합니다 | Example UI 는 교체하거나 새로 만들어도 됩니다 |
| Example UI 구조가 평가 정답입니다 | Example UI 는 공식 정답이 아닙니다 |

## 4. 참가팀이 받는 것

| 위치 | 내용 |
| --- | --- |
| `00_START_HERE.html` | 오프라인 시작 페이지 (외부 요청 0) |
| `WINDOWS_FINAL_CHECKLIST.md` | Windows 최종 확인표 (ZIP 루트에 포함) |
| `participant-workspace/` | 작업 템플릿 + 9단계 Starter |
| `workspace/` | init 이 만드는 팀 폴더 자리 |
| `submission-output/` | package 가 만드는 제출 폴더 자리 |
| `docs/environments/` | 환경별 가이드 4종 |
| `docs/ERROR_CATALOG.md` | 오류코드 → 고칠 파일 |
| `examples/annotated/` | 주석 달린 설명용 예제 7종 |
| `participant-workspace/example-ui/` | 브라우저에서 바로 열리는 예제 UI (완성본 1개) |
| `docs/API_EXAMPLES/` | curl · JS fetch · TS SDK · Python · Java 연동 예제 6종 |
| `docs/PARTICIPANT_IDEA_CATALOG.md` | 아이디어 24개 (문제·구현·계약·개인정보·실패 대비) |
| `docs/LOGINLESS_QR_PROFILE_GUIDE.md` | 무로그인 QR 프로필 설계 |
| `docs/CONTEXT_AWARE_RECOMMENDATION_GUIDE.md` | 상황 인지 추천 (contextSignals) |
| `docs/EXPLAINABLE_RECOMMENDATION_GUIDE.md` | 설명 가능한 추천 |
| `docs/EXTERNAL_API_SAFETY_GUIDE.md` | 외부 API 를 안전하게 쓰는 법 |
| `participant-workspace/participant-ux.template.json` | 사용자 접점 선언 양식 |

## 5. 참가팀 CLI

| 명령 | 하는 일 |
| --- | --- |
| `participant:doctor` | 설치·서버·버전·공식 파일 무결성 |
| `participant:demo` | Sandbox 왕복 시연 |
| `participant:init` | 팀 작업폴더 생성 |
| `participant:progress` | 9단계 구현 상태 + 사용자 접점 자동 검사 |
| `participant:validate` | 제출 검증 |
| `participant:package` | 최종 제출 폴더 + SHA-256 |

## 6. 최종 제출 수집

각 팀이 제출하는 것:

```
TEAM-XXX-final/
├── participant-submission.json   ← 운영진이 재실행할 파일
├── simulation-evidence.json
├── submission.sha256
├── validation-report.md
├── participant-ux.json            ← 팀의 사용자 접점 선언
├── MANUAL_REVIEW_CHECKLIST.md     ← 사람이 확인하는 항목
├── environment-version.json
├── README.md
└── demo-video.mp4 (선택)
```

`participant-ux.json` 과 `MANUAL_REVIEW_CHECKLIST.md` 는 `participant:package` 가
자동으로 넣습니다. 팀이 작성하지 않았다면 템플릿 기본값에 경고가 붙습니다.

## 7. 채점 시 재실행 절차

```bash
# 깨끗한 v{{VERSION}} 패키지에서
npm ci
npm run dev                    # 다른 터미널
npm run participant:validate -- --file <팀 제출 JSON> --execute
```

이 결과가 공식 판정입니다. 팀이 보낸 `simulation-evidence.json` 은 참고자료입니다.

`SIMULATION PASS` 는 **제출 자격 요건**이지 순위가 아닙니다.
추천 품질·접근성 UX·창의성은 비공개 채점과 심사위원 평가로 결정됩니다.

## 8. 자주 나오는 질문

| 질문 | 답 |
| --- | --- |
| 기술 스택 제한이 있나요 | 없습니다. 최종 출력이 계약에 맞으면 됩니다 |
| 로그인을 만들어야 하나요 | 아니오. 무로그인 기본 동작을 권장합니다 |
| 외부 API 를 써도 되나요 | 예. 단 없어도 동작해야 하고 fallback 이 있어야 합니다 |
| Sandbox 를 제출해도 되나요 | 아니오. 평가 대상이 아닙니다 |
| 플랫폼 파일을 고쳐도 되나요 | 고칠 수는 있지만 평가에 반영되지 않습니다 |

---

## 9. 배포 전 Windows 확인

### 참가팀에게 따로 보낼 필요가 없습니다

`WINDOWS_FINAL_CHECKLIST.md` 는 **Participant ZIP 루트에 이미 들어 있습니다.**
참가팀은 압축을 풀면 `00_START_HERE.html` 옆에서 바로 찾을 수 있고,
START_HERE 의 "Windows 최종 체크리스트 열기" 버튼으로도 열립니다.
운영진이 이 파일을 메일이나 공지로 따로 보낼 필요는 없습니다.

`release/WINDOWS_FINAL_CHECKLIST.md` 는 **운영진 검토용 동일 사본**으로 유지합니다.

> Participant ZIP 내부의 `WINDOWS_FINAL_CHECKLIST.md` 와
> `release/WINDOWS_FINAL_CHECKLIST.md` 는 동일한 원본에서 생성되며
> SHA-256 이 일치해야 합니다.

원본은 `tools/templates/WINDOWS_FINAL_CHECKLIST.template.md` 하나뿐입니다.
두 사본 모두 `npm run package:public` 이 이 원본에서 생성하며,
SHA 가 어긋나면 패키징이 그 자리에서 멈춥니다.

### 확인 방법

```bash
shasum -a 256 release/WINDOWS_FINAL_CHECKLIST.md
unzip -p release/{{ZIP_NAME}} kiobridge-simulation-kit-v{{VERSION}}/WINDOWS_FINAL_CHECKLIST.md | shasum -a 256
```

두 값이 같아야 합니다.

Windows 실기 확인은 그 문서의 A~M 절을 따르세요.
개발 PC 에서만 확인했다면 실행 검증을 `PASS` 로 적지 말고 `NOT_RUN` 으로 적습니다.

---

관련: [../docs/ORGANIZER_DISTRIBUTION_GUIDE.md](../docs/ORGANIZER_DISTRIBUTION_GUIDE.md) ·
[../docs/ONBOARDING_VIDEO_SCRIPT_7_MINUTES.md](../docs/ONBOARDING_VIDEO_SCRIPT_7_MINUTES.md)

## 배포물은 항상 소스에서 새로 만듭니다

최종 ZIP 은 소스·staging·압축 해제본의 배포 대상 파일 SHA 가
일치한 경우에만 생성됩니다.

**운영진은 파일을 수정한 뒤 기존 ZIP 을 그대로 배포하면 안 됩니다.
반드시 `npm run package:public` 을 다시 실행해야 합니다.**

패키징은 다음 순서로만 진행되며, 어긋나면 그 자리에서 멈춥니다.

1. 배포 대상 소스 스냅샷 기록 (`.build/package-source-snapshot.json`)
2. staging 생성 → source ↔ staging SHA 대조
3. 매니페스트 생성 (staging 확정 이후)
4. ZIP 생성 직전 소스 재해시 — 바뀌었으면 `SOURCE_CHANGED_AFTER_STAGING` 으로 중단
5. 임시 영역에 ZIP 생성 → 압축 해제 → **배포본이 자기 자신을 검증**
6. 모두 통과한 뒤에만 `release/` 로 이동하고 SHA 를 만듭니다

최종 검증은 압축 해제된 Participant ZIP 내부에서
`npm run verify:public-package` 가 PASS 하는지 확인합니다.

```bash
npm run verify:package-source-parity
```

이 명령은 소스·staging·ZIP 세 곳의 배포 대상 파일이 같은 바이트인지 확인합니다.
