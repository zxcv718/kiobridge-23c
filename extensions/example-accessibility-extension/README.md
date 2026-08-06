# example-accessibility-extension

접근성 확장 예시입니다. **정답 로직이 아니며**, `extensions` 사용 방법만 보여줍니다.
이 확장은 큰 글씨 / 음성 안내 선호를 팀 네임스페이스로 전달합니다.

제출 시 `ParticipantSubmission.extensions` 에 아래처럼 넣습니다:

```json
{
  "extensions": {
    "a11yExt": {
      "featureName": "voice-and-large-text",
      "version": "1.0",
      "metadata": {
        "voiceGuidance": true,
        "largeText": true,
        "language": "ko",
        "note": "확장 메타데이터는 Evidence.extensions 에 감사 기록됩니다."
      }
    }
  }
}
```

> 확장은 공식 안전검사를 우회하지 못합니다. 추천/승인/실행계획/상태 전환은 여전히 공식 규칙과
> dry-run 검증을 통과해야 합니다.
