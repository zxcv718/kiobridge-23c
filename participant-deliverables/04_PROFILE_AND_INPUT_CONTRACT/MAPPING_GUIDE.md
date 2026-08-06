<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# MAPPING GUIDE (Profile Mapper 작성)

> 참가팀은 어떤 방식으로 사용자 정보를 수집해도 됩니다.
> 웹, 앱, 음성, AI 대화, 보호자 입력 등 수집 인터페이스는 자유롭게 설계할 수 있습니다.
> 다만 공식 시뮬레이터에 제출하기 전, 수집한 정보를 KioBridge Canonical Input Contract 에
> 맞게 **변환**해야 합니다.

이 변환기(Profile Mapper)는 **참가팀이 직접 구현**합니다.
SDK 는 타입·enum·검증·오류메시지·버전 확인만 제공하며, 값을 자동으로 추측하지 않습니다.

## 예시: 음성 입력

사용자 발화:

> “포장해서 매운 순살로 하나 주세요.”

팀 내부 처리 결과 (자유 형식):

```json
{ "orderType": "포장", "heat": "매운맛", "meat": "순살", "count": 1 }
```

KioBridge 제출용 정규화 결과:

```json
{
  "sessionContext": {
    "intent": { "task": "ORDER_FOOD" },
    "facts": {},
    "preferences": { "serviceType": "TAKE_OUT", "spicyLevel": "HOT", "boneType": "BONELESS", "quantity": 1 },
    "hardConstraints": { "allergenIds": [] },
    "capabilities": {},
    "fieldMetadata": {
      "/preferences/serviceType": { "source": "VOICE", "confidence": 0.94, "confirmedByUser": true }
    }
  }
}
```

## Mapper 작성 체크리스트

1. **섹션을 먼저 정한다** — 사실인가(facts) / 선호인가(preferences) / 반드시 지켜야 하나(hardConstraints) / 사용 가능한 수단인가(capabilities)?
2. **공식 enum 으로 변환한다** — 소문자·한글 원본은 거부됩니다([ENUM_REFERENCE](./ENUM_REFERENCE.md)).
3. **모르면 추측하지 않는다** — `UNKNOWN`, 선호 없음이면 `NO_PREFERENCE`([UNKNOWN_POLICY](./UNKNOWN_POLICY.md)).
4. **출처를 기록한다** — `fieldMetadata` 에 source/confidence/confirmedByUser.
5. **개인정보를 넣지 않는다** — 원문·음성파일·연락처 금지. 필요하면 해시만.
6. **제출 전에 검증한다** — 아래 참조.

## 제출 전 검증

로컬(SDK):

```ts
import { validateCanonicalInput, SERVICE_TYPE, SPICY_LEVEL } from "@kiobridge/participant-sdk";

const input = { inputContractVersion: "1.0.0", environmentId: "chicken-store", teamId: "TEAM-001", profile, sessionContext };
const result = validateCanonicalInput(input);
if (!result.valid) console.error(result.errors);   // path + code + allowedValues + receivedValue
```

서버:

```bash
curl -X POST localhost:4000/api/v1/contracts/input/validate -H 'content-type: application/json' -d @input.json
```

또는 공식 시뮬레이터의 **Schema Playground** 화면에서 붙여넣어 확인하세요.

## 잘못된 매핑 예 → 서버 응답

```json
{ "valid": false, "contractVersion": "1.0.0",
  "errors": [{
    "path": "/sessionContext/preferences/serviceType",
    "code": "ENUM_VALUE_INVALID",
    "message": "\"take_out\" 은(는) 허용되지 않습니다.",
    "allowedValues": ["DINE_IN", "TAKE_OUT", "NO_PREFERENCE", "UNKNOWN"],
    "receivedValue": "take_out" }] }
```

## 같은 의미, 다른 수집 방식

`examples/canonical-input/` 의 네 파일(web-form / mobile-app / voice / assisted)은
**서로 다른 수집 경로**지만 동일한 Canonical Input 으로 정규화됩니다.
차이는 `profile.source.collectionChannel` 과 `fieldMetadata` 에만 나타납니다.
