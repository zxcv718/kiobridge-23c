import type { ContractError, ContractValidationResult } from "./types";
import { CORE_CONTRACT_VERSION } from "./version";

/** Thrown by assert-style helpers; carries the standard error payload. */
export class ContractValidationError extends Error {
  readonly errors: ContractError[];
  readonly contractVersion: string;

  constructor(errors: ContractError[], contractVersion = CORE_CONTRACT_VERSION) {
    super(errors[0]?.message ?? "계약 검증에 실패했습니다.");
    this.name = "ContractValidationError";
    this.errors = errors;
    this.contractVersion = contractVersion;
  }

  toResult(): ContractValidationResult {
    return { valid: false, contractVersion: this.contractVersion, errors: this.errors };
  }
}

export const ok = (contractVersion = CORE_CONTRACT_VERSION, warnings: ContractError[] = []): ContractValidationResult => ({
  valid: true, contractVersion, errors: [], ...(warnings.length ? { warnings } : {}),
});

export const fail = (errors: ContractError[], contractVersion = CORE_CONTRACT_VERSION, warnings: ContractError[] = []): ContractValidationResult => ({
  valid: false, contractVersion, errors, ...(warnings.length ? { warnings } : {}),
});

export function enumError(path: string, received: unknown, allowed: string[]): ContractError {
  return {
    path, code: "ENUM_VALUE_INVALID",
    message: `${JSON.stringify(received)} 은(는) 허용되지 않습니다.`,
    allowedValues: allowed, receivedValue: received,
  };
}

export function typeError(path: string, received: unknown, expected: string): ContractError {
  return { path, code: "TYPE_MISMATCH", message: `${expected} 형식이어야 합니다.`, receivedValue: received };
}

/**
 * One official code for every timestamp problem. The specific issue
 * (format / calendar / timezone) goes in the message rather than splitting into
 * three codes a participant would have to learn.
 */
export function timestampError(path: string, received: unknown, detail: { message?: string; expectedFormat?: string } = {}): ContractError {
  return {
    path,
    code: "INVALID_UTC_TIMESTAMP",
    message: detail.message ?? "UTC ISO 8601 타임스탬프가 필요합니다.",
    receivedValue: received,
    ...(detail.expectedFormat ? { expectedFormat: detail.expectedFormat } : {}),
  } as ContractError;
}

export function missingError(path: string): ContractError {
  return { path, code: "REQUIRED_FIELD_MISSING", message: "필수 필드가 없습니다." };
}

export function unknownFieldError(path: string): ContractError {
  return { path, code: "UNKNOWN_FIELD", message: "정의되지 않은 필드입니다. 확장은 extensions 아래에만 작성하세요." };
}
