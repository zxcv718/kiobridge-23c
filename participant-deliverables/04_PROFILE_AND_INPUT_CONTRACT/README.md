# 04. Profile & Input Contract (참가팀 배포자료)

> **이 폴더는 원본 스키마에서 자동 생성됩니다. 이 폴더 안의 파일을 직접 수정하지 마세요.**
>
> | 항목 | 값 |
> | --- | --- |
> | 생성 시각 | `2026-08-03T13:10:52.926Z` |
> | 소스 계약 버전 | `1.0.0` |
> | 생성 스크립트 버전 | `1.0.0` |
>
> 원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.
> 원본과 이 폴더가 다르면 `npm run check:contract-drift` 가 실패합니다.

---

> **참가팀은 어떤 방식으로 사용자 정보를 수집해도 됩니다.**
>
> 웹, 앱, 음성, AI 대화, 보호자 입력 등 수집 인터페이스는 자유롭게 설계할 수 있습니다.
>
> **다만 공식 시뮬레이터에 제출하기 전, 수집한 정보를
> KioBridge Canonical Input Contract 에 맞게 변환해야 합니다.**

## 핵심 원칙

```
정보 수집 방식은 참가팀이 자유롭게 설계한다.
하지만 KioBridge 서버로 제출하는 최종 의미, 변수명, 자료형,
enum 값과 버전은 KioBridge Canonical Input Contract 를 따른다.
```

## 3층 구조

| 층 | 내용 | 변경 정책 |
| --- | --- | --- |
| **Layer 1. Core** | `inputContractVersion` `teamId` `environmentId` `profile` `sessionContext` `recommendation` `userDecision` `executionPlan` `extensions` | 대회 중 MAJOR 변경 금지 |
| **Layer 2. Domain** | 환경별 `sessionContext` (닭강정 / 병원 / 관공서 / sandbox) | 버전 관리하 변경 가능 |
| **Layer 3. Extensions** | 팀 namespace 자유 확장 | 자유 |

## Profile vs SessionContext

| | Profile | SessionContext |
| --- | --- | --- |
| 성격 | 사용자에게 **지속되는** 정보 | **이번 이용에만** 적용 |
| 예 | 큰 글씨 필요, 청각 지원, 선호 입력, 언어 | 이번 주문은 포장, 오늘 예약 여부, 필요한 민원 |

## 이 폴더의 구성

| 경로 | 내용 |
| --- | --- |
| `PROFILE_DATA_DICTIONARY.md` | 프로필 전 필드 사전 |
| `SESSION_CONTEXT_DICTIONARY.md` | 환경별 SessionContext 사전 |
| `MAPPING_GUIDE.md` | Profile Mapper 작성법 |
| `ENUM_REFERENCE.md` | 공식 enum 전체 |
| `UNKNOWN_POLICY.md` | UNKNOWN · 누락 · NO_PREFERENCE 구분 |
| `SCHEMA_VERSIONING_POLICY.md` | 버전 정책 |
| `SCHEMA_NEGOTIATION_GUIDE.md` | 계약 협상 API |
| `MIGRATION_FROM_V4.md` | v4 → v5 마이그레이션 |
| `schemas/` | core · domains · registry 스키마 |
| `vocabularies/` | 환경별 공식 enum |
| `examples/` | 수집 방식별 Canonical Input 예제 |
| `sdk/profile-contract/` | 타입 · enum · 검증기 소스 |

## 제출 전 검증

1. **Schema Playground** — 시뮬레이터 우측 상단 버튼
2. **API** — `POST /api/v1/contracts/input/validate`
3. **SDK** — `validateCanonicalInput(input)`

## 시작하기

```bash
curl localhost:4000/api/v1/contracts                                 # 지원 버전
curl localhost:4000/api/v1/environments/chicken-store/input-contract # 환경 계약
curl localhost:4000/api/v1/vocabularies/chicken-store                # 허용 enum
```
