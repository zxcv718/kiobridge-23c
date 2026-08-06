# curl 예제

`[참고]` bash 기준. PowerShell 차이는 아래에 따로 적었습니다.

## 0. 준비

```bash
API=http://localhost:4000
ENV=sandbox
```

`jq` 가 없어도 됩니다. 있으면 결과 읽기가 편합니다.

## 1. 서버 확인

```bash
curl -s --max-time 5 "$API/health"
```

```json
{"status":"ok","service":"kiobridge-simulation-api","productVersion":"5.1.4","version":"5.1.4","inputContractVersion":"1.0.0"}
```

`productVersion` 이 여러분 패키지와 다르면 서버를 재시작하세요.

## 2. 환경 Fixture

```bash
curl -s --max-time 5 "$API/api/v1/environments/$ENV/fixture" -o fixture.json
```

jq 로 후보만 보기:

```bash
jq '.candidates[] | {candidateId, name, available}' fixture.json
```

## 3. 호환규칙 (제출 전 자기검증용)

```bash
curl -s --max-time 5 "$API/api/v1/environments/$ENV/compatibility-rules"
```

```bash
jq '.rules[] | {ruleId, evaluationScope, severity, errorCode}' <<< "$(curl -s $API/api/v1/environments/$ENV/compatibility-rules)"
```

## 4. 검토화면 매핑

```bash
curl -s --max-time 5 "$API/api/v1/environments/$ENV/review-mapping"
```

## 5. 세션 생성

```bash
SESSION=$(curl -s --max-time 5 -X POST "$API/api/v1/sessions" \
  -H 'content-type: application/json' \
  -d "{\"environmentId\":\"$ENV\"}")
echo "$SESSION"
```

세션 ID 만 뽑기 (jq 있을 때):

```bash
SID=$(jq -r .sessionId <<< "$SESSION")
```

jq 없이:

```bash
SID=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).sessionId))' <<< "$SESSION")
```

## 6. 제출

```bash
# Sandbox 연습용 예제
SUBMISSION=examples/submission-format-example/sandbox.json
# 공식 환경이라면 여러분이 만든 파일: SUBMISSION=<YOUR_SUBMISSION>

curl -s --max-time 10 -X POST "$API/api/v1/sessions/$SID/submission" \
  -H 'content-type: application/json' \
  --data-binary "@$SUBMISSION"
```

## 7. 검증

```bash
curl -s --max-time 10 -X POST "$API/api/v1/sessions/$SID/validate" \
  -H 'content-type: application/json' -d '{}'
```

오류만 보기:

```bash
jq '{valid, errors: [.errors[] | {code, path}]}' <<< "$(curl -s -X POST $API/api/v1/sessions/$SID/validate -H 'content-type: application/json' -d '{}')"
```

`valid` 가 `false` 면 여기서 멈추고 고치세요.

## 8. 실행

```bash
curl -s --max-time 30 -X POST "$API/api/v1/sessions/$SID/execute" \
  -H 'content-type: application/json' -d '{}' -o /dev/null -w "HTTP %{http_code}\n"
```

## 9. Evidence

```bash
curl -s --max-time 10 "$API/api/v1/sessions/$SID/evidence" -o evidence.json
jq '{result, resultScope, stopType, boundaryReached, actualDeviceCommandSent}' evidence.json
```

```json
{
  "result": "PASS",
  "resultScope": "SIMULATION_VALIDATION_ONLY",
  "stopType": "NORMAL_BOUNDARY_STOP",
  "boundaryReached": true,
  "actualDeviceCommandSent": false
}
```

## 전체를 한 번에

```bash
#!/usr/bin/env bash
set -euo pipefail

API=http://localhost:4000
ENV=sandbox
SUBMISSION=examples/submission-format-example/sandbox.json

curl -sf --max-time 5 "$API/health" > /dev/null || { echo "서버가 꺼져 있습니다. npm run dev"; exit 1; }

SID=$(curl -s --max-time 5 -X POST "$API/api/v1/sessions" \
        -H 'content-type: application/json' -d "{\"environmentId\":\"$ENV\"}" \
      | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).sessionId))')

curl -s --max-time 10 -X POST "$API/api/v1/sessions/$SID/submission" \
  -H 'content-type: application/json' --data-binary "@$SUBMISSION" > /dev/null

VALID=$(curl -s --max-time 10 -X POST "$API/api/v1/sessions/$SID/validate" \
          -H 'content-type: application/json' -d '{}' \
        | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const v=JSON.parse(d);console.log(v.valid);if(!v.valid)console.error(v.errors.map(e=>e.code+" @ "+e.path).join("\n"))})')

[ "$VALID" = "true" ] || { echo "검증 실패"; exit 1; }

curl -s --max-time 30 -X POST "$API/api/v1/sessions/$SID/execute" \
  -H 'content-type: application/json' -d '{}' > /dev/null

curl -s --max-time 10 "$API/api/v1/sessions/$SID/evidence" \
| node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const e=JSON.parse(d);console.log(e.result,e.stopType)})'
```

## PowerShell 차이

| bash | PowerShell |
| --- | --- |
| `curl` | `curl.exe` (그냥 `curl` 은 `Invoke-WebRequest` 별칭입니다) |
| `API=http://…` | `$API = "http://…"` |
| `-d '{"a":1}'` | `-d '{\"a\":1}'` 또는 파일로 |
| `--data-binary "@f.json"` | `--data-binary "@f.json"` (동일) |
| `$(...)` | `$(...)` (동일) |

```powershell
$API = "http://localhost:4000"
curl.exe -s --max-time 5 "$API/health"
```

작은따옴표 안의 JSON 이 자꾸 깨지면 파일로 저장해 `--data-binary "@body.json"` 을 쓰세요.

## timeout 과 오류 처리

| 옵션 | 하는 일 |
| --- | --- |
| `--max-time 10` | 전체 10초 제한 |
| `--connect-timeout 3` | 연결만 3초 제한 |
| `-f` | 4xx/5xx 를 실패로 (`set -e` 와 함께) |
| `-w "HTTP %{http_code}\n"` | 상태 코드 출력 |

```bash
curl -sf --max-time 5 "$API/health" || echo "서버 응답 없음 — npm run dev 로 켜세요"
```

---

관련: [README.md](README.md) · [ERROR_CATALOG.md](../ERROR_CATALOG.md)
