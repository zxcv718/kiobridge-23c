# extensions

참가팀은 공식 상태 머신·안전경계를 수정하지 않고, `ParticipantSubmission.extensions` 아래에
자유롭게 기능을 추가할 수 있습니다. 확장은 **네임스페이스**로 격리되며, 공식 안전검사를
우회할 수 없습니다.

```json
{
  "extensions": {
    "teamNamespace": {
      "featureName": "voice-profile",
      "version": "1.0",
      "metadata": { "locale": "ko", "ttsEngine": "example" }
    }
  }
}
```

확장이 존재하더라도 다음은 항상 공식 규칙을 따릅니다: 추천 후보 유효성, 사용자 승인, Action
형식, 상태 전환, 금지 Action, 안전경계, `actualDeviceCommandSent=false`.

`extensions` 는 Evidence 에 그대로 기록됩니다(감사용). 스키마상 핵심 객체는
`additionalProperties: false` 이므로, 임의 필드는 반드시 `extensions` 아래에 두세요.

예시: [`example-accessibility-extension`](example-accessibility-extension).
