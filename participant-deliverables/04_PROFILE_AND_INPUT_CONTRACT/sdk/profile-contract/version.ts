/**
 * Contract versioning (see docs/SCHEMA_VERSIONING_POLICY.md).
 *
 * MAJOR — incompatible (field removed, meaning changed, structure changed)
 * MINOR — backwards-compatible additions (optional field, new enum value)
 * PATCH — docs / messages / validation bug fixes
 *
 * During the hackathon Core and Domain contracts must not take a MAJOR bump.
 */
import { ContractValidationError } from "./errors";

export const CORE_CONTRACT_VERSION = "1.0.0";

export const SUPPORTED_INPUT_CONTRACT_VERSIONS = ["1.0.0"] as const;
export const DEFAULT_INPUT_CONTRACT_VERSION = "1.0.0";
export const SUPPORTED_SUBMISSION_VERSIONS = ["1.0.0"] as const;

export interface SemVer { major: number; minor: number; patch: number }

export function parseSemVer(v: string): SemVer | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v ?? "");
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function isSupportedInputContractVersion(v: string): boolean {
  return (SUPPORTED_INPUT_CONTRACT_VERSIONS as readonly string[]).includes(v);
}

/**
 * Throws unless the version is supported.
 * A MINOR/PATCH difference within a supported MAJOR is reported precisely so
 * teams understand whether they must migrate.
 */
export function assertSupportedVersion(v: string): void {
  if (isSupportedInputContractVersion(v)) return;
  const parsed = parseSemVer(v);
  const detail = !parsed
    ? `버전 형식이 올바르지 않습니다 (SemVer 필요): ${v}`
    : `지원하지 않는 inputContractVersion: ${v}`;
  throw new ContractValidationError([
    {
      path: "/inputContractVersion",
      code: "UNSUPPORTED_INPUT_CONTRACT_VERSION",
      message: detail,
      allowedValues: [...SUPPORTED_INPUT_CONTRACT_VERSIONS],
      receivedValue: v,
    },
  ]);
}

export function contractCapabilities() {
  return {
    supportedInputContractVersions: [...SUPPORTED_INPUT_CONTRACT_VERSIONS],
    defaultInputContractVersion: DEFAULT_INPUT_CONTRACT_VERSION,
    supportedSubmissionVersions: [...SUPPORTED_SUBMISSION_VERSIONS],
    coreContractVersion: CORE_CONTRACT_VERSION,
  };
}
