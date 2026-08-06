# 외부 API 안전 가이드

`[권장]` 날씨·공휴일·재고 API 를 쓸 때 지켜야 할 것.

## 한 줄 요약

**외부 API 가 죽어도 여러분의 서비스는 계속 동작해야 합니다.**

심사 당일 API 가 응답하지 않는 일은 실제로 일어납니다.
그때 화면이 멈추면 아무것도 보여줄 수 없습니다.

## 필수 요구사항

| 항목 | 왜 |
| --- | --- |
| **timeout** | 응답 없는 API 가 화면 전체를 잡아둡니다 |
| **retry 제한** | 무한 재시도는 장애를 키웁니다 (1~2회면 충분) |
| **fallback** | 실패 시 맥락 없이 진행 |
| **cache** | 같은 날씨를 1분에 열 번 물을 필요 없습니다 |
| **수집시각** | `observedAt` — 언제 받은 값인지 |
| **만료시간** | `expiresAt` — 언제까지 쓸 수 있는지 |
| **출처** | `source` — 사용자에게 밝힐 수 있어야 합니다 |
| **API Key 서버 보관** | 브라우저에 넣으면 누구나 봅니다 |
| **개인정보 미전송** | 외부 API 에 사용자 정보를 보내지 마세요 |

## 코드 형태

```js
async function fetchWeather() {
  const cached = readCache("weather");
  if (cached && !isExpired(cached)) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);   // timeout
  try {
    const res = await fetch("/api/weather", { signal: controller.signal });  // 우리 서버 경유
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const signal = {
      type: "WEATHER", key: "condition", value: data.condition,
      source: "WEATHER_API",
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      confidence: 1,
    };
    writeCache("weather", signal);
    return signal;
  } catch (err) {
    return null;              // fallback: 맥락 없이 진행
  } finally {
    clearTimeout(timer);
  }
}
```

호출하는 쪽:

```js
const weather = await fetchWeather();
const reasons = [];
if (weather) {
  reasons.push("지금 비가 내려 따뜻한 메뉴를 앞에 두었습니다.");
} else {
  // 이유에서도 날씨를 언급하지 않습니다. 없는 근거를 말하면 안 됩니다.
}
```

## API Key

```
❌ 브라우저 코드에 Key 를 넣는다
   const key = "abc123";                    ← 개발자 도구에서 그대로 보입니다
   fetch(`https://api.weather.com?key=${key}`)

✅ 우리 서버가 대신 부른다
   브라우저 → 우리 백엔드 (/api/weather) → 외부 API (Key 는 서버 환경변수)
```

백엔드가 없다면 **Mock 데이터를 쓰세요.** Key 를 노출하는 것보다 낫습니다.

## 개인정보

| 보내지 말 것 | 대신 |
| --- | --- |
| 정확한 GPS 좌표 | 지역명 또는 매장 ID |
| 사용자 이름·연락처 | 보낼 이유가 없습니다 |
| 접근성 프로필 | 기기 안에서만 씁니다 |
| 주문·민원 내용 | 외부 API 와 무관합니다 |

## 오래된 데이터

```js
function isExpired(signal) {
  if (!signal.expiresAt) return false;
  return new Date(signal.expiresAt) < new Date();
}
```

만료된 값은 **없는 것으로 취급**합니다. 어제 날씨로 오늘 추천을 정하지 마세요.

화면에 남겨야 한다면 오래됐다고 표시하세요:

> "30분 전 정보입니다."

## Rate Limit

```js
if (res.status === 429) {
  // 캐시된 값을 쓰거나, 맥락 없이 진행합니다. 재시도로 상황을 악화시키지 마세요.
  return readCache("weather") ?? null;
}
```

## Mock 과 실제 구분

심사에서는 **Mock 으로도 충분합니다.** 다만 무엇이 Mock 인지 밝히세요.

```json
{ "type": "WEATHER", "value": "RAIN", "source": "MOCK_WEATHER", "...": "..." }
```

`source` 가 `MOCK_` 으로 시작하면 화면에도 "예시 데이터" 라고 표시하는 것을 권장합니다.

**실시간 API 를 붙였다고 더 높은 점수를 받는 것이 아닙니다.**
API 가 실패했을 때 어떻게 동작하는지가 더 중요합니다.

## 체크리스트

- [ ] timeout 을 설정했다
- [ ] 재시도 횟수에 상한이 있다
- [ ] 실패하면 맥락 없이 진행한다
- [ ] 응답을 캐시한다
- [ ] `observedAt` 을 기록한다 (UTC Z)
- [ ] `expiresAt` 을 기록한다
- [ ] `source` 를 기록한다
- [ ] API Key 가 브라우저에 없다
- [ ] 개인정보를 외부로 보내지 않는다
- [ ] 만료된 데이터를 쓰지 않는다
- [ ] 429 를 처리한다
- [ ] Mock 과 실제를 구분해 표시한다
- [ ] 추천 이유에 쓴 맥락의 출처를 밝힌다

## 예제 UI

[예제 UI](../participant-workspace/example-ui/app.js) 의 `loadContext()` 가
이 패턴을 보여줍니다: 파일을 읽되 실패해도 화면이 멈추지 않고,
`observedAt`·`source` 를 남기며, 상황 카드에 출처를 표시합니다.

---

관련: [상황 기반 추천](CONTEXT_AWARE_RECOMMENDATION_GUIDE.md) · [설명 가능한 추천](EXPLAINABLE_RECOMMENDATION_GUIDE.md)

## 로그인·저장·개인정보 정책

| 구분 | 내용 |
| --- | --- |
| Example UI | 로그인 없이 동작하는 **Sandbox 참고 예제**입니다. 공식 정답이 아닙니다. |
| 참가팀 자유 | 로그인, 기기 내 프로필 저장, QR, 음성, 카메라, OCR, 보호자 입력 등을 **선택적으로 자유롭게** 구현할 수 있습니다. |
| 반드시 지킬 것 | 로그인 기능은 금지되지 않지만, **로그인하지 않아도 서비스의 핵심 기능을 사용할 수 있어야 합니다.** |
| 심사 데이터 | 해커톤·심사·시뮬레이션에서는 실제 개인정보가 아닌 **가상·합성 데이터**를 사용해야 합니다. |
| 실제 서비스 확장 | 실제 서비스에서 개인정보를 처리하려면 별도의 동의, 최소수집, 저장기간, 삭제, 보안 정책이 필요합니다. |

자세한 내용: [../docs/LOGINLESS_QR_PROFILE_GUIDE.md](../docs/LOGINLESS_QR_PROFILE_GUIDE.md)
