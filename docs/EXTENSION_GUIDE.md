# EXTENSION GUIDE (참가팀 창의적 확장)

참가팀은 정해진 추천 로직만 바꾸는 것이 아니라, 자신의 아이디어를 자유롭게 추가할 수 있습니다.
단, **공식 상태 머신과 안전경계는 수정할 수 없습니다.**

## 자유롭게 확장 가능한 영역

음성 프로필 입력, 쉬운 문장, 다국어, 수어·자막 연계, 큰 글씨/고대비, 보호자 모드, 직원 도움,
추천 이유 시각화, AI/규칙/학습형 추천, 신뢰도·재질문 전략, 새로운 프로필 필드, 추가 접근성 정보,
조건 수정 UX 등.

## 확장 필드

핵심 객체(profile/recommendation/userDecision/executionPlan)는 `additionalProperties: false`
입니다. 임의 필드는 **`extensions` 아래 네임스페이스**로만 추가하세요.

```json
{
  "extensions": {
    "teamNamespace": { "featureName": "voice-profile", "version": "1.0", "metadata": {} }
  },
  "accessibilityEvidence": { "...": "선택" },
  "teamMetadata": { "...": "선택" }
}
```

## 우회 불가 원칙

`extensions` 가 있어도 다음은 항상 공식 규칙 + dry-run 검증을 따릅니다: 추천 후보 유효성,
사용자 승인, Action 형식, 상태 전환, 금지 Action, 안전경계, `actualDeviceCommandSent=false`.
확장은 Evidence 의 `extensions` 에 감사 기록됩니다.

예시: [`extensions/example-accessibility-extension`](../extensions/example-accessibility-extension).
