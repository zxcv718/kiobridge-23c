/** Type surface for the packaging parity helpers, used by the release tests. */
export interface FileHash { sha256: string; size: number; }
export interface Mismatch { path: string; aSha: string; bSha: string; aSize: number; bSize: number; }

export const EXCLUDED_DIRS: Set<string>;
export const GENERATED_IN_PACKAGE: Set<string>;
export const ALLOWED_STAGING_ONLY: Map<string, string>;
export const SOURCE_ONLY: Set<string>;
export const SOURCE_ONLY_PREFIXES: string[];
export const CRITICAL_FILES: string[];

export function sha256(buf: Buffer | string): string;
export function shaOf(file: string): string;
export function listFiles(root: string): string[];
export function sourceCopiedFiles(root: string): string[];
export function hashTree(root: string, files: string[]): Record<string, FileHash>;
export function snapshotDigest(map: Record<string, FileHash>): string;
export function compare(
  a: Record<string, FileHash>,
  b: Record<string, FileHash>,
  options?: { onlyIn?: string },
): { mismatches: Mismatch[]; missing: string[] };
