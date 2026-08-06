/**
 * @kiobridge/profile-contract
 *
 * The KioBridge Canonical Input Contract: types, official enums, validation and
 * version negotiation.
 *
 * 참가팀은 어떤 방식으로 사용자 정보를 수집해도 됩니다(웹·앱·음성·AI·보호자 입력).
 * 다만 서버에 제출하기 전, 수집한 정보를 이 계약에 맞게 **직접 변환**해야 합니다.
 *
 * 이 패키지는 프로필을 만들거나 추천을 생성하지 않습니다.
 * 제공하는 것: 타입 · enum · 스키마 검증 · 오류메시지 · 계약 버전 확인.
 */
export * from "./enums";
export * from "./types";
export * from "./errors";
export * from "./version";
export {
  validateCanonicalInput,
  validateProfile,
  validateSessionContext,
  validateFieldMetadata,
  validateUnknownPolicy,
  validateUserDecisionTimestamps,
  validateContextExtensions,
  validateExtensions,
  detectPersonalData,
} from "./validator";
export type { ReconfirmationOptions } from "./validator";
export { convertLegacyV4 } from "./legacy-v4-adapter";
export type { LegacyV4Profile, LegacyConversionResult } from "./legacy-v4-adapter";

// Canonical Input timestamp policy — one definition shared by the hand-written
// validator, the AJV format, the SDK and participant code.
export * from "./timestamp";
export * from "./create-ajv";
