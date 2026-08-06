# Python (requests) 예제

`[참고]` Python 3.9 이상.

## 설치

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install requests
```

`requirements.txt`:

```
requests>=2.31.0
```

## 전체 코드

```python
"""KioBridge 연결 예제 — Sandbox 기준."""
import json
import sys
from typing import Any

import requests

API = "http://localhost:4000"
ENV = "sandbox"
TIMEOUT = 10          # 초. 응답 없는 호출이 스크립트를 잡아두지 않게 합니다.


class KioBridgeError(Exception):
    """API 가 오류를 돌려주거나 연결이 안 될 때."""


def call(method: str, path: str, body: Any = None, timeout: int = TIMEOUT) -> Any:
    url = f"{API}{path}"
    try:
        res = requests.request(
            method, url,
            json=body,
            headers={"content-type": "application/json"},
            timeout=timeout,
        )
    except requests.Timeout as exc:
        raise KioBridgeError(f"{timeout}초 안에 응답이 없습니다: {path}") from exc
    except requests.ConnectionError as exc:
        raise KioBridgeError("서버에 연결하지 못했습니다 — npm run dev 로 켜세요") from exc

    # 오류 응답이 JSON 이 아닐 수 있으므로 본문을 먼저 확보합니다.
    text = res.text
    try:
        data = json.loads(text) if text else None
    except json.JSONDecodeError as exc:
        raise KioBridgeError(f"JSON 이 아닙니다 (HTTP {res.status_code}): {text[:200]}") from exc

    if not res.ok:
        message = (data or {}).get("error") if isinstance(data, dict) else None
        raise KioBridgeError(message or f"HTTP {res.status_code}")
    return data


# 1. 서버 확인
def check_health() -> None:
    health = call("GET", "/health", timeout=5)
    print(f"서버 {health['productVersion']} · 계약 {health['inputContractVersion']}")


# 2-4. 공개 계약 조회
def load_contracts() -> tuple[Any, Any, Any]:
    fixture = call("GET", f"/api/v1/environments/{ENV}/fixture")
    rules = call("GET", f"/api/v1/environments/{ENV}/compatibility-rules")
    review = call("GET", f"/api/v1/environments/{ENV}/review-mapping")
    print(f"후보 {len(fixture['candidates'])}개 · 규칙 {len(rules['rules'])}개")
    return fixture, rules, review


# 5-9. 세션 → 제출 → 검증 → 실행 → Evidence
def run(submission: dict) -> dict | None:
    session = call("POST", "/api/v1/sessions", {"environmentId": submission["environmentId"]})
    sid = session["sessionId"]

    call("POST", f"/api/v1/sessions/{sid}/submission", submission)

    validation = call("POST", f"/api/v1/sessions/{sid}/validate", {})
    if not validation["valid"]:
        # 검증을 통과하지 못한 계획을 실행해도 의미가 없습니다.
        for err in validation["errors"]:
            print(f"  {err['code']} @ {err['path']}: {err['message']}", file=sys.stderr)
        return None

    for warn in validation.get("warnings", []):
        print(f"  경고 {warn['code']}: {warn['message']}", file=sys.stderr)

    call("POST", f"/api/v1/sessions/{sid}/execute", {}, timeout=30)
    return call("GET", f"/api/v1/sessions/{sid}/evidence")


def main() -> int:
    try:
        check_health()
        load_contracts()

        # 연습용 Sandbox
        with open("examples/submission-format-example/sandbox.json", encoding="utf-8") as f:
            submission = json.load(f)
        submission.pop("_note", None)      # 설명용 필드는 빼고 보냅니다

        # 공식 환경이라면 여러분이 만든 것: submission = <YOUR_SUBMISSION>

        evidence = run(submission)
        if evidence is None:
            print("검증 실패", file=sys.stderr)
            return 1

        print(f"{evidence['result']} · {evidence['stopType']} · {evidence['resultScope']}")
        return 0 if evidence["result"] == "PASS" else 1

    except KioBridgeError as exc:
        print(f"오류: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
```

## 실행

```bash
python3 kiobridge_example.py
```

```
서버 5.1.4 · 계약 1.0.0
후보 6개 · 규칙 2개
PASS · NORMAL_BOUNDARY_STOP · SIMULATION_VALIDATION_ONLY
```

## UTC 타임스탬프

```python
from datetime import datetime, timezone

def now_iso_utc() -> str:
    """2026-08-03T00:11:00.123456+00:00 이 아니라 ...Z 형태여야 합니다."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
```

`datetime.now().isoformat()` 은 시간대가 없어 `INVALID_UTC_TIMESTAMP` 가 됩니다.
`+00:00` 도 거부됩니다. **반드시 `Z` 로 끝나야 합니다.**

## 흔한 실수

| 실수 | 결과 | 고치는 법 |
| --- | --- | --- |
| `timeout` 없음 | 스크립트가 멈춤 | `timeout=10` |
| `res.json()` 을 바로 호출 | 오류 응답에서 예외 | 본문을 먼저 문자열로 받기 |
| `raise_for_status()` 만 | 서버 오류 메시지를 잃음 | 본문의 `error` 를 읽기 |
| `_note` 를 그대로 전송 | `UNKNOWN_FIELD` | `pop("_note", None)` |
| 검증 실패인데 execute | 의미 없는 결과 | `valid` 확인 후 진행 |

## raise_for_status 를 쓰고 싶다면

```python
try:
    res.raise_for_status()
except requests.HTTPError as exc:
    # 서버가 준 설명을 잃지 않도록 본문을 함께 남깁니다.
    raise KioBridgeError(f"{exc} — {res.text[:200]}") from exc
```

---

관련: [README.md](README.md) · [ERROR_CATALOG.md](../ERROR_CATALOG.md)
