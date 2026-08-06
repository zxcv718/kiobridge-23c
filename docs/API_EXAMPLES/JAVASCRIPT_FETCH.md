# JavaScript (fetch) 예제

`[참고]` 브라우저와 Node 18+ 에서 동작합니다. 빌드 도구가 필요 없습니다.

## CORS 부터

브라우저에서 `http://localhost:4000` 을 직접 부르면 **origin 이 다릅니다.**

```
브라우저 페이지  http://localhost:5500   (또는 file://)
KioBridge API   http://localhost:4000
```

| 상황 | 권장 |
| --- | --- |
| 개발 중 로컬에서만 | 그대로 직접 호출 (개발 서버가 허용) |
| 참가팀 백엔드가 있음 | **백엔드가 대신 부르게 하세요** |
| 외부 API Key 가 필요 | **반드시 백엔드 경유** — Key 가 브라우저에 노출됩니다 |

브라우저 콘솔에 `blocked by CORS policy` 가 보이면 백엔드 경유로 바꾸세요.

## 공통 헬퍼

```js
const API = "http://localhost:4000";

/** timeout + 상태 확인 + JSON 파싱 오류까지 한 곳에서 다룹니다. */
async function call(path, init = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });

    const text = await res.text();
    let body;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // 오류 응답이 HTML 일 수도 있습니다. 원문을 남겨야 원인을 찾습니다.
        throw new Error(`JSON 이 아닙니다 (HTTP ${res.status}): ${text.slice(0, 200)}`);
      }
    }
    if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
    return body;
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`${timeoutMs}ms 안에 응답이 없습니다: ${path}`);
    if (err instanceof TypeError) throw new Error(`서버에 연결하지 못했습니다 — npm run dev 로 켜세요 (${path})`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
```

`TypeError` 를 따로 잡는 이유: fetch 는 네트워크 실패를 `TypeError` 로 던지는데,
그대로 두면 "Failed to fetch" 만 보이고 원인을 알 수 없습니다.

## 1. 서버 확인

```js
const health = await call("/health", {}, 5_000);
console.log(health.productVersion, health.inputContractVersion);
```

## 2–4. 공개 계약 조회

```js
const ENV = "sandbox";

const fixture = await call(`/api/v1/environments/${ENV}/fixture`);
console.log(`후보 ${fixture.candidates.length}개`);

// 제출 전 자기검증에 씁니다. 필수는 아닙니다.
const rules = await call(`/api/v1/environments/${ENV}/compatibility-rules`);
const reviewMapping = await call(`/api/v1/environments/${ENV}/review-mapping`);
```

## 5–9. 세션 → 제출 → 검증 → 실행 → Evidence

```js
async function run(submission, env = "sandbox") {
  const session = await call("/api/v1/sessions", {
    method: "POST",
    body: JSON.stringify({ environmentId: env }),
  });

  await call(`/api/v1/sessions/${session.sessionId}/submission`, {
    method: "POST",
    body: JSON.stringify(submission),
  });

  const validation = await call(`/api/v1/sessions/${session.sessionId}/validate`, {
    method: "POST",
    body: "{}",
  });

  if (!validation.valid) {
    // 여기서 멈춥니다. 검증을 통과하지 못한 계획을 실행해도 의미가 없습니다.
    return { ok: false, errors: validation.errors, warnings: validation.warnings ?? [] };
  }

  await call(`/api/v1/sessions/${session.sessionId}/execute`, { method: "POST", body: "{}" }, 30_000);
  const evidence = await call(`/api/v1/sessions/${session.sessionId}/evidence`);

  return { ok: true, evidence, warnings: validation.warnings ?? [] };
}
```

## 사용

```js
// 연습용 Sandbox
const submission = await (await fetch("./examples/submission-format-example/sandbox.json")).json();
delete submission._note;   // 설명용 필드는 빼고 보냅니다

// 공식 환경이라면 여러분이 만든 것:
// const submission = <YOUR_SUBMISSION>;

try {
  const result = await run(submission);
  if (!result.ok) {
    for (const e of result.errors) console.error(`${e.code} @ ${e.path}: ${e.message}`);
  } else {
    console.log(result.evidence.result, result.evidence.stopType);
    for (const w of result.warnings) console.warn(`경고 ${w.code}: ${w.message}`);
  }
} catch (err) {
  console.error("호출 실패:", err.message);
}
```

## 오류를 사용자에게 보여줄 때

```js
function describe(error) {
  const step = {
    "/profile": "프로필 만들기",
    "/sessionContext": "이번 이용 정보",
    "/recommendation": "추천",
    "/userDecision": "사용자 확인",
    "/executionPlan": "실행계획",
  };
  const where = Object.entries(step).find(([prefix]) => error.path.startsWith(prefix));
  return `${where ? where[1] : "제출물"} 단계: ${error.message}`;
}
```

`code` 의 뜻은 [ERROR_CATALOG.md](../ERROR_CATALOG.md) 에 있습니다.

## Node 에서 파일로 보낼 때

```js
import { readFile } from "node:fs/promises";

const submission = JSON.parse(await readFile("./my-submission.json", "utf-8"));
delete submission._note;
const result = await run(submission);
```

---

관련: [README.md](README.md) · [TYPESCRIPT_SDK.md](TYPESCRIPT_SDK.md)
