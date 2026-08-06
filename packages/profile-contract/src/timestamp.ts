/**
 * Canonical Input timestamp policy — the single source of truth.
 *
 * Every timestamp a participant submits must be an ISO 8601 / RFC 3339 instant
 * in UTC, ending in a capital Z. Local times and numeric offsets are rejected:
 * a kiosk session is judged against an absolute moment, and "09:11" means
 * nothing without knowing whose clock it came from.
 *
 * Two checks run, not one. A regular expression accepts 2026-02-30T00:00:00Z
 * (well-formed, non-existent), so the calendar is verified separately.
 *
 *   허용:  2026-08-03T00:11:00Z · 2026-08-03T00:11:00.123Z · 2024-02-29T23:59:59Z
 *   거부:  2026-08-03 · 2026-08-03T00:11:00 · 2026-08-03T09:11:00+09:00
 *          2026-02-30T00:00:00Z · 2026-08-03T00:11:00z · 24:00:00Z
 */

/** Human-readable shape shown in every error message. */
export const UTC_TIMESTAMP_FORMAT = "YYYY-MM-DDTHH:mm:ss(.fraction)?Z";

/** Fields in the Canonical Input governed by this policy. */
export const CANONICAL_TIMESTAMP_FIELDS = [
  "profile.source.collectedAt",
  "sessionContext.fieldMetadata.*.capturedAt",
  "userDecision.confirmedAt",
] as const;

/**
 * Structure only. Note the literal uppercase `Z` — a lowercase `z` is a
 * different string and is not accepted, so the contract has exactly one
 * spelling for "UTC".
 */
const SHAPE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?Z$/;

export type TimestampIssue =
  /** Not a string, or the overall shape is wrong. */
  | "TIMESTAMP_FORMAT_INVALID"
  /** Well-formed but the date or time does not exist. */
  | "TIMESTAMP_VALUE_INVALID"
  /** A real instant, but not expressed in UTC. */
  | "TIMESTAMP_TIMEZONE_NOT_UTC";

export interface TimestampValidationResult {
  valid: boolean;
  /** Present only when invalid. */
  issue?: TimestampIssue;
  message?: string;
  expectedFormat?: string;
}

const OK: TimestampValidationResult = { valid: true };

const fail = (issue: TimestampIssue, message: string): TimestampValidationResult => ({
  valid: false,
  issue,
  message,
  expectedFormat: UTC_TIMESTAMP_FORMAT,
});

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

/**
 * Validate one Canonical Input timestamp.
 *
 * Calendar checking is done by hand rather than through `Date.parse`, because
 * Date silently rolls 2026-02-30 over to 2026-03-02 and truncates fractional
 * seconds beyond milliseconds — both would let bad input through.
 */
export function validateIso8601UtcTimestamp(value: unknown): TimestampValidationResult {
  if (typeof value !== "string") {
    return fail("TIMESTAMP_FORMAT_INVALID", `문자열이어야 합니다 (받은 타입: ${value === null ? "null" : typeof value}).`);
  }
  if (value === "") {
    return fail("TIMESTAMP_FORMAT_INVALID", "빈 문자열은 타임스탬프가 아닙니다.");
  }

  const m = SHAPE.exec(value);
  if (!m) {
    // Distinguish "you gave a real instant in the wrong zone" from "this is
    // not a timestamp at all" — the fix is different for each.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:?\d{2}|z)$/.test(value)) {
      return fail("TIMESTAMP_TIMEZONE_NOT_UTC",
        "Canonical Input 은 UTC 만 허용합니다. 대문자 Z 로 끝나야 하며 +09:00 같은 offset 은 쓸 수 없습니다.");
    }
    return fail("TIMESTAMP_FORMAT_INVALID", `${UTC_TIMESTAMP_FORMAT} 형식이어야 합니다.`);
  }

  const [, ys, mo, d, h, mi, se] = m;
  const year = Number(ys), month = Number(mo), day = Number(d);
  const hour = Number(h), minute = Number(mi), second = Number(se);

  if (month < 1 || month > 12) return fail("TIMESTAMP_VALUE_INVALID", `존재하지 않는 월: ${mo}`);
  if (day < 1 || day > daysInMonth(year, month)) {
    return fail("TIMESTAMP_VALUE_INVALID", `${ys}-${mo} 에 존재하지 않는 일: ${d}`);
  }
  // 24:00:00 is a legal ISO 8601 "end of day", but it names the same instant as
  // the next 00:00:00. Allowing both spellings would make timestamps compare
  // unequal while meaning the same thing, so only one is accepted.
  if (hour > 23) return fail("TIMESTAMP_VALUE_INVALID", `시는 00~23 만 허용합니다 (받은 값: ${h}).`);
  if (minute > 59) return fail("TIMESTAMP_VALUE_INVALID", `분은 00~59 만 허용합니다 (받은 값: ${mi}).`);
  // Leap seconds are not accepted: no environment in this kit needs them, and
  // accepting :60 would break round-tripping through Date.
  if (second > 59) return fail("TIMESTAMP_VALUE_INVALID", `초는 00~59 만 허용합니다 (받은 값: ${se}).`);

  return OK;
}

/** Type guard form, for use as an AJV format and in participant code. */
export function isIso8601UtcTimestamp(value: unknown): value is string {
  return validateIso8601UtcTimestamp(value).valid;
}

/** The one correct way to produce a Canonical Input timestamp. */
export function nowIso8601Utc(): string {
  return new Date().toISOString();
}
