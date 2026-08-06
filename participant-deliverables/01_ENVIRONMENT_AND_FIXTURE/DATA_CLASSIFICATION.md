<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# DATA CLASSIFICATION

모든 데이터는 아래 세 가지 중 하나로 분류됩니다. UI 색상으로도 구분합니다.

| 분류 | 색상 | 의미 |
| --- | --- | --- |
| `ACTUAL_EXTRACTED` | 청록색 | 실제 UPRLite 에서 **기존에 추출**한 구조·좌표·식별자·OCR 기록 |
| `SYNTHETIC_MOCK` | 보라색 | 해커톤 테스트용으로 **제작한 합성** 메뉴·접수·민원 데이터 |
| `PENDING_REAL_DEVICE` | 주황색 | 향후 Windows 실기기에서 **추가 수집할** 데이터 |

프로필은 별도로 `SYNTHETIC_PROFILE` 로 표시합니다 (합성, 실제 개인정보 없음).

## ACTUAL_EXTRACTED (닭강정 환경에만 존재)

`environments/chicken-store/kiosk-profile.json` 및 `controls.json` 의 좌표/식별자입니다.

- 프로세스명 `UPRLite`, 창 제목 `UP KIOSK`, 기준 해상도 `1080×1920`, 배율 100%
- 루트 AutomationId `KIOSKMainForm`
- 버튼 좌표(원본)와 식별자: `btnBarrierFreeEatIn(388,1533)`, `btnBarrierFreeTakeOut(694,1533)`,
  옵션 버튼 4개, `btnConfirmOption(674,1718)`, `btnCart(674,1719)`, `btnCancel(138,1719)`,
  `btnCallStaff(407,1857)`, 장바구니 상품명 `lbMenuName`, 금액 `lbAmount`
- OCR 참고 영역 `x:270 y:1603 w:799 h:182`

> **주의:** 위 좌표는 실제 마우스 클릭에 사용하지 않습니다. 1080×1920 기준으로
> `normalizedX = x/1080`, `normalizedY = y/1920` 로 정규화하여 반응형 Mock UI 의
> 상대 배치 참고값으로만 사용합니다.

## SYNTHETIC_MOCK

- 닭강정 메뉴 8종 (`catalog.json`)
- 병원 접수 흐름 6종 (`flows.json`)
- 관공서 민원 6종 (`services.json`)
- 세 환경의 screens / transitions / safety-rules / profiles / scenarios

이들은 실제 상품·접수·민원 데이터가 아니며, 실제 이름/전화번호/주소/주민등록번호/환자번호/
예약번호/결제정보를 포함하지 않습니다.

## PENDING_REAL_DEVICE

실제 Windows 화면·UIA 트리·OCR·실제 메뉴 데이터는 아직 수집 전입니다.
[PENDING_REAL_DEVICE.md](../03_SEMANTIC_ACTION/PENDING_REAL_DEVICE.md) 의 TODO 목록을 참고하세요.

## 원칙

- 현재 Mock UI 에 실제로 없는 화면/상품을 `ACTUAL_EXTRACTED` 로 표시하지 않습니다.
- Evidence 의 `dataClassification` 에 `actualExtractedDataUsed` / `syntheticMockDataUsed` 를 기록합니다.
