# 문제 해결 흐름

`[권장]` 증상에서 시작해 아래로 따라가세요.

---

## 설치가 안 됨

```
node -v 가 안 됨
  └→ nodejs.org 에서 LTS 설치 후 터미널 재시작

node -v 가 v20 미만
  └→ LTS 로 업그레이드

npm ci 실패
  ├→ 사내 프록시? npm config get registry 결과 확인
  ├→ node_modules 지우고 재시도
  └→ 그래도 실패하면 오류 전문과 registry 값을 운영진에 공유
```

## 서버가 안 열림

```
브라우저에 아무것도 안 뜸
  ├→ npm run participant:doctor
  ├→ [WARN] :3000/:4000 응답 없음 → npm run dev
  └→ 포트 충돌(EADDRINUSE) → stop-macos.command / stop-windows.bat 후 재시작

http://localhost:3000 은 되는데 "API 연결 실패"
  └→ :4000 이 죽은 것. 터미널의 api 로그 확인
```

## 제출을 감지하지 못함

```
세션은 만들었는데 계속 WAITING
  ├→ 제출 주소가 맞는지 (화면의 "제출 주소" 확인)
  ├→ sessionId 오타
  └→ HTTP 응답이 202 인지 확인
```

## JSON 파싱 실패

```
Unexpected token
  ├→ .jsonc 파일을 그대로 제출했는지 확인 (주석이 들어 있습니다)
  ├→ 실행용은 examples/submission-format-example/sandbox.json
  └→ 마지막 쉼표(trailing comma) 확인
```

## Schema 실패

```
SCHEMA_INVALID / REQUIRED_FIELD_MISSING
  ├→ docs/ERROR_CATALOG.md 1번 표
  ├→ Schema Playground 에서 값을 넣어보며 확인
  └→ path 가 가리키는 STEP 을 고치세요
```

## 추천 검증 실패

```
CANDIDATE_* / *_MISMATCH
  ├→ Stage A: 후보 자체가 사용자를 지원하나?  → STEP 4·5
  ├→ Stage B: 실제로 누른 값이 맞나?          → STEP 9
  └→ npm run participant:validate 의 path 로 구분
```

## ExecutionPlan 실패

```
STATE_MISMATCH / BOUNDARY_NOT_REACHED / MISSING_VERIFIER
  ├→ fixture.transitions 를 순서대로 따라가세요
  ├→ 마지막은 reviewBoundaryState + verifier
  └→ 페이지 이동 Action 은 만들지 마세요 (Driver 가 처리)
```

## Evidence FAIL

```
SIMULATION FAIL
  ├→ stopType 이 SAFETY_STOP 이면 stopReason 확인
  ├→ plannedPaymentActionCount > 0 이면 결제 Action 제거
  └→ REVIEW_FIELD_UNRESOLVED 면 검토화면 필수값을 채우세요
```

## Windows 시작 실패

```
start-windows.bat 이 창만 뜨고 닫힘
  ├→ 명령 프롬프트에서 직접 실행해 메시지 확인
  ├→ SmartScreen: "추가 정보" → "실행"
  └→ 한글이 깨지면 콘솔 글꼴을 Consolas/D2Coding 으로
```

## macOS Gatekeeper

```
"개발자를 확인할 수 없음"
  ├→ start-macos.command 우클릭 → 열기
  └→ 또는 터미널에서 ./start-macos.command
```

## 포트 충돌

```
EADDRINUSE :3000 또는 :4000
  ├→ stop 스크립트 실행
  ├→ macOS/Linux: lsof -ti:3000,4000 | xargs kill -9
  └→ Windows: stop-windows.bat
```

---

여기서 해결되지 않으면 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 와
[ERROR_CATALOG.md](ERROR_CATALOG.md) 를 확인한 뒤 운영진에 문의하세요.
문의할 때 `npm run participant:doctor` 출력을 함께 보내주세요.
