<!--
  ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
  이 폴더는 원본 스키마/문서에서 자동 생성됩니다.
  원본을 수정한 뒤 `npm run sync:contracts` 를 실행하세요.

  generatedAt        : 2026-08-03T13:10:52.926Z
  contractVersion    : 1.0.0
  generatorVersion   : 1.0.0
-->

# SCHEMA NEGOTIATION GUIDE (계약 협상)

개발을 시작할 때 서버가 지원하는 계약 버전을 먼저 조회하세요.

## 1. 지원 버전 확인

```bash
curl localhost:4000/api/v1/contracts
```

```json
{ "supportedInputContractVersions": ["1.0.0"],
  "defaultInputContractVersion": "1.0.0",
  "supportedSubmissionVersions": ["1.0.0"],
  "coreContractVersion": "1.0.0" }
```

## 2. 환경별 입력 계약 확인

```bash
curl localhost:4000/api/v1/environments/chicken-store/input-contract
```

```json
{ "environmentId": "chicken-store", "inputContractVersion": "1.0.0",
  "schemaUrl": "/api/v1/schemas/chicken-store.context.schema.json",
  "vocabularyUrl": "/api/v1/vocabularies/chicken-store",
  "requiredFields": ["intent","facts","preferences","hardConstraints","capabilities"],
  "optionalFields": ["fieldMetadata"] }
```

## 3. 어휘(enum) 조회

```bash
curl localhost:4000/api/v1/vocabularies/chicken-store
```

## 4. 스키마 원본 조회

```bash
curl localhost:4000/api/v1/schemas/chicken-store.context.schema.json
curl localhost:4000/api/v1/schemas/canonical-profile.schema.json
```

## 5. 제출 전 검증

```bash
curl -X POST localhost:4000/api/v1/contracts/input/validate           -d @input.json -H 'content-type: application/json'
curl -X POST localhost:4000/api/v1/contracts/profile/validate         -d @profile.json -H 'content-type: application/json'
curl -X POST localhost:4000/api/v1/contracts/session-context/validate -d @ctx.json -H 'content-type: application/json'
```

SDK:

```ts
const client = new KioBridgeSimulationClient({ baseUrl: "http://localhost:4000" });
const contracts = await client.getSupportedContracts();
const ic = await client.getInputContract("chicken-store");
const vocab = await client.getVocabulary("chicken-store");
```

## 지원하지 않는 버전

```json
{ "path": "/inputContractVersion", "code": "UNSUPPORTED_INPUT_CONTRACT_VERSION",
  "message": "지원하지 않는 inputContractVersion: 2.0.0",
  "allowedValues": ["1.0.0"], "receivedValue": "2.0.0" }
```
