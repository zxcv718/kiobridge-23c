# API 예제

`[참고]` 기술 스택은 자유입니다. 여기 있는 것은 **연결 방법**일 뿐입니다.

| 문서 | 언제 보나 |
| --- | --- |
| [CURL.md](CURL.md) | 터미널에서 흐름을 빠르게 확인할 때 |
| [JAVASCRIPT_FETCH.md](JAVASCRIPT_FETCH.md) | 브라우저·Node 에서 붙일 때 |
| [TYPESCRIPT_SDK.md](TYPESCRIPT_SDK.md) | 타입 검사를 받고 싶을 때 |
| [PYTHON_REQUESTS.md](PYTHON_REQUESTS.md) | 파이썬 백엔드일 때 |
| [JAVA_SPRING.md](JAVA_SPRING.md) | Java/Spring 백엔드일 때 |

## 공통 흐름

모든 문서가 같은 아홉 단계를 보여줍니다.

| # | 호출 | 뜻 |
| --- | --- | --- |
| 1 | `GET /health` | 서버가 살아 있는지, 버전이 맞는지 |
| 2 | `GET /api/v1/environments/{env}/fixture` | 후보·옵션·화면·상태전환 |
| 3 | `GET /api/v1/environments/{env}/compatibility-rules` | 플랫폼이 추천을 어떻게 판정하는지 |
| 4 | `GET /api/v1/environments/{env}/review-mapping` | 검토화면이 어떤 값을 쓰는지 |
| 5 | `POST /api/v1/sessions` | 세션 만들기 |
| 6 | `POST /api/v1/sessions/{id}/submission` | 내 제출물 보내기 |
| 7 | `POST /api/v1/sessions/{id}/validate` | 검증 |
| 8 | `POST /api/v1/sessions/{id}/execute` | 가상 키오스크에서 실행 |
| 9 | `GET /api/v1/sessions/{id}/evidence` | 실행 증거 |

3번과 4번은 **제출 전에** 스스로 확인할 때 씁니다. 필수는 아닙니다.

## 기본 주소

```
API  http://localhost:4000
Web  http://localhost:3000
```

`npm run dev` 로 켜집니다.

## 제출물은 어디서 오나

예제에서 `<YOUR_SUBMISSION>` 이라고 쓰인 곳에는 **여러분이 만든 JSON** 이 들어갑니다.

연습용 Sandbox 는 완성 예제가 있습니다:

```
examples/submission-format-example/sandbox.json
```

**공식 3환경(닭강정·병원·관공서)의 완성 제출물은 제공되지 않습니다.**
그것을 만드는 것이 과제입니다.

## 공통 주의

| 항목 | 왜 |
| --- | --- |
| timeout 을 두세요 | 응답 없는 호출이 화면을 잡아둡니다 |
| HTTP 상태를 확인하세요 | 4xx/5xx 를 성공으로 처리하면 원인을 못 찾습니다 |
| JSON 파싱 오류를 처리하세요 | 오류 응답이 JSON 이 아닐 수 있습니다 |
| `validate` 가 실패하면 멈추세요 | `execute` 는 검증을 통과해야 의미가 있습니다 |
| API Key 를 브라우저에 넣지 마세요 | 이 API 는 Key 가 없지만, 외부 API 는 다릅니다 |

---

관련: [API_CONTRACT.md](../API_CONTRACT.md) · [ERROR_CATALOG.md](../ERROR_CATALOG.md)
