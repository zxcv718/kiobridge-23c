# Java / Spring 예제

`[참고]` Spring Boot 3.2+ (`RestClient`). WebFlux 를 쓰면 `WebClient` 로 바꿔도 됩니다.

## 의존성

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-web</artifactId>
</dependency>
```

Gradle:

```groovy
implementation 'org.springframework.boot:spring-boot-starter-web'
```

## DTO

계약 전체를 매핑할 필요는 없습니다. **읽을 것만** 정의하고 나머지는 무시하세요.

```java
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Health(String productVersion, String inputContractVersion) {}

@JsonIgnoreProperties(ignoreUnknown = true)
public record Session(String sessionId, String environmentId, String submissionStatus) {}

@JsonIgnoreProperties(ignoreUnknown = true)
public record ValidationIssue(String code, String path, String message) {}

@JsonIgnoreProperties(ignoreUnknown = true)
public record ValidationResult(boolean valid,
                               List<ValidationIssue> errors,
                               List<ValidationIssue> warnings) {}

@JsonIgnoreProperties(ignoreUnknown = true)
public record Evidence(String runId, String result, String resultScope,
                       String stopType, boolean boundaryReached,
                       boolean actualDeviceCommandSent) {}
```

`@JsonIgnoreProperties(ignoreUnknown = true)` 가 중요합니다.
플랫폼이 필드를 추가해도 여러분 코드가 깨지지 않습니다.

## 클라이언트

```java
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Service
public class KioBridgeClient {

    private final RestClient client;

    public KioBridgeClient() {
        var factory = new SimpleClientHttpRequestFactory();
        // timeout 이 없으면 응답 없는 호출이 스레드를 잡아둡니다.
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(30));

        this.client = RestClient.builder()
                .baseUrl("http://localhost:4000")
                .requestFactory(factory)
                .defaultHeader("content-type", "application/json")
                .defaultStatusHandler(status -> status.isError(), (req, res) -> {
                    // 서버가 준 설명을 잃지 않도록 본문을 함께 담습니다.
                    String body = new String(res.getBody().readAllBytes());
                    throw new KioBridgeException(
                            "HTTP " + res.getStatusCode() + " — " + truncate(body));
                })
                .build();
    }

    public Health health() {
        return client.get().uri("/health").retrieve().body(Health.class);
    }

    public Map<String, Object> fixture(String environmentId) {
        return client.get()
                .uri("/api/v1/environments/{env}/fixture", environmentId)
                .retrieve().body(Map.class);
    }

    /** 제출 전 자기검증용 공개 계약입니다. 추천 정답이 아닙니다. */
    public Map<String, Object> compatibilityRules(String environmentId) {
        return client.get()
                .uri("/api/v1/environments/{env}/compatibility-rules", environmentId)
                .retrieve().body(Map.class);
    }

    public Map<String, Object> reviewMapping(String environmentId) {
        return client.get()
                .uri("/api/v1/environments/{env}/review-mapping", environmentId)
                .retrieve().body(Map.class);
    }

    public Session createSession(String environmentId) {
        return client.post().uri("/api/v1/sessions")
                .body(Map.of("environmentId", environmentId))
                .retrieve().body(Session.class);
    }

    public void submit(String sessionId, Map<String, Object> submission) {
        client.post().uri("/api/v1/sessions/{id}/submission", sessionId)
                .body(submission).retrieve().toBodilessEntity();
    }

    public ValidationResult validate(String sessionId) {
        return client.post().uri("/api/v1/sessions/{id}/validate", sessionId)
                .body(Map.of()).retrieve().body(ValidationResult.class);
    }

    public void execute(String sessionId) {
        client.post().uri("/api/v1/sessions/{id}/execute", sessionId)
                .body(Map.of()).retrieve().toBodilessEntity();
    }

    public Evidence evidence(String sessionId) {
        return client.get().uri("/api/v1/sessions/{id}/evidence", sessionId)
                .retrieve().body(Evidence.class);
    }

    private static String truncate(String s) {
        return s.length() > 200 ? s.substring(0, 200) : s;
    }

    public static class KioBridgeException extends RuntimeException {
        public KioBridgeException(String message) { super(message); }
    }
}
```

## 전체 흐름

```java
@Service
public class SubmissionRunner {

    private final KioBridgeClient kio;

    public SubmissionRunner(KioBridgeClient kio) { this.kio = kio; }

    public Evidence run(Map<String, Object> submission) {
        var health = kio.health();
        log.info("서버 {} · 계약 {}", health.productVersion(), health.inputContractVersion());

        var session = kio.createSession((String) submission.get("environmentId"));
        kio.submit(session.sessionId(), submission);

        var validation = kio.validate(session.sessionId());
        if (!validation.valid()) {
            // 검증을 통과하지 못한 계획을 실행해도 의미가 없습니다.
            validation.errors().forEach(e ->
                    log.error("{} @ {}: {}", e.code(), e.path(), e.message()));
            return null;
        }
        if (validation.warnings() != null) {
            validation.warnings().forEach(w -> log.warn("경고 {}: {}", w.code(), w.message()));
        }

        kio.execute(session.sessionId());
        return kio.evidence(session.sessionId());
    }
}
```

## UTC 타임스탬프

```java
import java.time.Instant;
import java.time.temporal.ChronoUnit;

// 2026-08-03T00:11:00.123Z
String collectedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
```

`Instant.toString()` 은 이미 `Z` 로 끝납니다.
`LocalDateTime` 이나 `ZonedDateTime` 을 쓰면 `+09:00` 이 붙어 `INVALID_UTC_TIMESTAMP` 가 됩니다.

## API Key 를 브라우저에 넣지 않는 구조

KioBridge API 는 Key 가 없지만, 여러분이 외부 API(날씨 등)를 쓸 때는 다릅니다.

```
브라우저 / 모바일
      │  (Key 없음)
      ▼
참가팀 Spring 백엔드   ← application.yml 또는 환경변수에 Key 보관
      │  (Key 포함)
      ▼
외부 API (날씨·공휴일 등)
```

```java
@Value("${weather.api-key}")   // 환경변수 WEATHER_API_KEY
private String weatherApiKey;
```

```yaml
# application.yml — 실제 Key 를 여기 적지 말고 환경변수로 주입하세요
weather:
  api-key: ${WEATHER_API_KEY:}
```

Key 를 프론트엔드 번들에 넣으면 개발자 도구에서 그대로 보입니다.

## 예외 처리

| 상황 | 처리 |
| --- | --- |
| 연결 실패 | `RestClientException` → "서버를 켜세요" 안내 |
| timeout | 위와 동일. connect/read 를 따로 설정 |
| 4xx/5xx | `defaultStatusHandler` 에서 본문과 함께 예외 |
| 알 수 없는 필드 | `@JsonIgnoreProperties(ignoreUnknown = true)` |
| 검증 실패 | 예외가 아니라 `valid=false` — 정상 응답입니다 |

`validate` 가 `valid=false` 를 주는 것은 **오류가 아닙니다.**
HTTP 200 으로 오며, 내용을 읽어 사용자에게 보여주면 됩니다.

---

관련: [README.md](README.md) · [EXTERNAL_API_SAFETY_GUIDE.md](../EXTERNAL_API_SAFETY_GUIDE.md)
