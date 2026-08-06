import { describe, it, expect, vi, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createContractAjv, isIso8601UtcTimestamp, nowIso8601Utc,
  UTC_TIMESTAMP_FORMAT, UTC_TIMESTAMP_FORMAT_NAME,
  validateCanonicalInput, validateIso8601UtcTimestamp, validateUserDecisionTimestamps,
} from "@kiobridge/profile-contract";
import { REPO_ROOT, loadEnvironmentPack, loadExample, processSubmission, validateSubmission } from "../../shared";

/**
 * Canonical Input timestamps.
 *
 * The bug this guards against: AJV had no format handlers, so every
 * `format` keyword was ignored and "not-a-date" validated cleanly through the
 * API, the CLI and the SDK alike.
 */

/* ─────────────────── 정책 (1–23) ─────────────────── */

describe("UTC ISO 8601 정책", () => {
  const ACCEPT = [
    "2026-08-03T00:11:00Z",
    "2026-08-03T00:11:00.1Z",
    "2026-08-03T00:11:00.123Z",
    "2026-08-03T00:11:00.123456Z",
    "2024-02-29T23:59:59Z", // 윤년
  ];

  const REJECT: [unknown, string][] = [
    ["not-a-date", "문자열이지만 형식 아님"],
    ["", "빈 문자열"],
    ["2026-08-03", "날짜만"],
    ["2026-08-03T00:11:00", "시간대 없음"],
    ["2026-08-03 00:11:00Z", "T 대신 공백"],
    ["2026-08-03T09:11:00+09:00", "UTC offset"],
    ["2026-08-03T00:11:00z", "소문자 z"],
    ["2026-02-30T00:00:00Z", "존재하지 않는 날짜"],
    ["2026-13-01T00:00:00Z", "13월"],
    ["2026-00-01T00:00:00Z", "0월"],
    ["2026-08-00T00:00:00Z", "0일"],
    ["2026-08-03T24:00:01Z", "24시"],
    ["2026-08-03T00:60:00Z", "60분"],
    ["2026-08-03T00:00:60Z", "60초 (윤초 불허)"],
    ["2025-02-29T00:00:00Z", "평년 2월 29일"],
    [null, "null"],
    [undefined, "undefined"],
    [123456, "숫자"],
    [{}, "객체"],
    [[], "배열"],
    [true, "불리언"],
  ];

  for (const v of ACCEPT) {
    it(`허용: ${v}`, () => {
      expect(validateIso8601UtcTimestamp(v).valid, v).toBe(true);
      expect(isIso8601UtcTimestamp(v)).toBe(true);
    });
  }

  for (const [v, why] of REJECT) {
    it(`거부: ${JSON.stringify(v)} (${why})`, () => {
      const r = validateIso8601UtcTimestamp(v);
      expect(r.valid, why).toBe(false);
      expect(r.issue).toBeTruthy();
      expect(r.expectedFormat).toBe(UTC_TIMESTAMP_FORMAT);
      expect(isIso8601UtcTimestamp(v)).toBe(false);
    });
  }

  it("24:00:00Z 는 명시적으로 거부한다 (다음날 00:00:00Z 와 같은 순간의 두 표기)", () => {
    const r = validateIso8601UtcTimestamp("2026-08-03T24:00:00Z");
    expect(r.valid).toBe(false);
    expect(r.issue).toBe("TIMESTAMP_VALUE_INVALID");
  });

  it("offset 값은 시간대 문제로 분류된다 (형식 오류와 구분)", () => {
    expect(validateIso8601UtcTimestamp("2026-08-03T09:11:00+09:00").issue).toBe("TIMESTAMP_TIMEZONE_NOT_UTC");
    expect(validateIso8601UtcTimestamp("2026-08-03T00:11:00z").issue).toBe("TIMESTAMP_TIMEZONE_NOT_UTC");
  });

  it("nowIso8601Utc 는 정책을 만족하는 값을 만든다", () => {
    expect(isIso8601UtcTimestamp(nowIso8601Utc())).toBe(true);
  });

  it("Date.parse 만으로는 막지 못하는 값을 실제로 막는다", () => {
    // 이 값들은 Date.parse 를 통과하지만 Canonical Input 에서는 허용되지 않는다.
    for (const v of ["2026-08-03", "2026-08-03T09:11:00+09:00"]) {
      expect(Number.isNaN(Date.parse(v)), v).toBe(false);
      expect(isIso8601UtcTimestamp(v), v).toBe(false);
    }
    // 반대로 Date 는 2026-02-30 을 3월 2일로 굴려버린다.
    expect(Number.isNaN(Date.parse("2026-02-30T00:00:00Z"))).toBe(false);
    expect(isIso8601UtcTimestamp("2026-02-30T00:00:00Z")).toBe(false);
  });
});

/* ─────────────────── AJV format 등록 (17) ─────────────────── */

describe("AJV — unknown format 경고가 없어야 한다", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => { warn.mockClear(); error.mockClear(); });

  it("공통 factory 로 계약 스키마를 컴파일해도 경고가 없다", () => {
    const ajv = createContractAjv();
    const dir = path.join(REPO_ROOT, "schemas", "core");
    const files = require("node:fs").readdirSync(dir).filter((f: string) => f.endsWith(".json"));
    for (const f of files) {
      const schema = JSON.parse(readFileSync(path.join(dir, f), "utf-8"));
      if (schema.$id && !ajv.getSchema(schema.$id)) ajv.addSchema(schema);
    }
    for (const f of files) {
      const schema = JSON.parse(readFileSync(path.join(dir, f), "utf-8"));
      expect(() => ajv.getSchema(schema.$id) ?? ajv.compile(schema), f).not.toThrow();
    }
    const messages = [...warn.mock.calls, ...error.mock.calls].flat().map(String);
    expect(messages.filter((m) => /unknown format/i.test(m)), messages.join("\n")).toEqual([]);
  });

  it("iso-8601-utc format 이 실제로 동작한다", () => {
    const ajv = createContractAjv();
    const validate = ajv.compile({ type: "string", format: UTC_TIMESTAMP_FORMAT_NAME });
    expect(validate("2026-08-03T00:11:00Z")).toBe(true);
    expect(validate("not-a-date")).toBe(false);
    expect(validate("2026-08-03T09:11:00+09:00")).toBe(false);
  });

  it("date-time format 도 무시되지 않는다 (ajv-formats 등록 확인)", () => {
    const ajv = createContractAjv();
    const validate = ajv.compile({ type: "string", format: "date-time" });
    expect(validate("not-a-date")).toBe(false);
  });

  it("서버 시작 로그에 unknown format 경고가 없다", () => {
    const out = execFileSync(process.execPath, [
      path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
      "--eval", 'import("./apps/simulation-api/src/validate.ts").then(() => console.log("loaded"));',
    ], { cwd: REPO_ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    expect(out).not.toMatch(/unknown format/i);
  });
});

/* ─────────────────── 필드별 회귀 (15) ─────────────────── */

describe("필드별 — 잘못된 타임스탬프 차단", () => {
  const pack = () => loadEnvironmentPack("sandbox");
  const good = () => {
    const doc = loadExample("valid", "sandbox.json") as unknown as Record<string, never>;
    return JSON.parse(JSON.stringify(doc));
  };

  it("정상 제출은 통과한다 (회귀 방지)", () => {
    expect(validateSubmission(pack(), good()).valid).toBe(true);
  });

  const cases: [string, string, (s: Record<string, never>) => void][] = [
    ["/profile/source/collectedAt", "collectedAt",
      (s) => { (s as never as { profile: { source: { collectedAt: string } } }).profile.source.collectedAt = "not-a-date"; }],
    ["/sessionContext/fieldMetadata/~1preferences~1size/capturedAt", "capturedAt",
      (s) => {
        (s as never as { sessionContext: { fieldMetadata: unknown } }).sessionContext.fieldMetadata = {
          "/preferences/size": { source: "WEB_FORM", confidence: 1, confirmedByUser: true, capturedAt: "not-a-date" },
        };
      }],
    ["/userDecision/confirmedAt", "confirmedAt",
      (s) => { (s as never as { userDecision: { confirmedAt: string } }).userDecision.confirmedAt = "not-a-date"; }],
  ];

  for (const [pointer, label, mutate] of cases) {
    it(`${label} 이 잘못되면 ${pointer} 에서 INVALID_UTC_TIMESTAMP`, () => {
      const s = good();
      mutate(s);
      const r = validateSubmission(pack(), s);
      expect(r.valid).toBe(false);
      expect(r.errors).toContainEqual(expect.objectContaining({
        code: "INVALID_UTC_TIMESTAMP", path: pointer, receivedValue: "not-a-date",
      }));
    });

    it(`${label} 이 정상 UTC 값이면 통과한다`, () => {
      const s = good();
      mutate(s);
      const json = JSON.stringify(s).replace(/"not-a-date"/g, '"2026-08-03T00:11:00.123Z"');
      const r = validateSubmission(pack(), JSON.parse(json));
      expect(r.errors.filter((e) => e.code === "INVALID_UTC_TIMESTAMP")).toEqual([]);
    });
  }

  it("같은 문제가 AJV 와 직접 검증에서 두 번 보고되지 않는다", () => {
    const s = good();
    (s as never as { profile: { source: { collectedAt: string } } }).profile.source.collectedAt = "not-a-date";
    const r = validateSubmission(pack(), s);
    const same = r.errors.filter((e) => e.code === "INVALID_UTC_TIMESTAMP" && e.path === "/profile/source/collectedAt");
    expect(same.length).toBe(1);
  });

  it("offset 과 존재하지 않는 날짜도 각 필드에서 차단된다", () => {
    for (const bad of ["2026-08-03T09:11:00+09:00", "2026-02-30T00:00:00Z", "2026-08-03"]) {
      const s = good();
      (s as never as { profile: { source: { collectedAt: string } } }).profile.source.collectedAt = bad;
      const r = validateSubmission(pack(), s);
      expect(r.valid, bad).toBe(false);
      expect(r.errors.some((e) => e.code === "INVALID_UTC_TIMESTAMP"), bad).toBe(true);
    }
  });

  it("userDecision 전용 검증기가 confirmedAt 을 직접 잡는다", () => {
    expect(validateUserDecisionTimestamps({ approved: true, decision: "APPROVE", confirmedAt: "not-a-date" }))
      .toContainEqual(expect.objectContaining({ code: "INVALID_UTC_TIMESTAMP", path: "/userDecision/confirmedAt" }));
    expect(validateUserDecisionTimestamps({ approved: true, decision: "APPROVE" })).toEqual([]);
    expect(validateUserDecisionTimestamps({ approved: true, decision: "APPROVE", confirmedAt: "2026-08-03T00:11:00Z" })).toEqual([]);
  });
});

/* ─────────────────── 교차 채널 (16) ─────────────────── */

describe("교차 채널 — 모든 검증기가 같은 결과를 낸다", () => {
  const badInput = () => ({
    inputContractVersion: "1.0.0", environmentId: "sandbox", teamId: "TEAM-TS",
    profile: {
      profileId: "TS-1", dataClassification: "SYNTHETIC_PROFILE",
      source: { collectionChannel: "WEB_FORM", providerId: "T", collectedAt: "not-a-date" },
      accessibility: { largeText: false, simpleSteps: false, visualGuidance: false, hearingSupport: false, mobilitySupport: false, highContrast: false, staffAssistancePreferred: false },
      interaction: { preferredInput: "TOUCH", language: "ko-KR", confirmationRequired: true },
      consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
    },
    sessionContext: { intent: { task: "PRACTICE" }, facts: {}, preferences: {}, hardConstraints: {}, capabilities: {}, fieldMetadata: {} },
  });

  it("Canonical Validator (SDK 와 동일 함수)", () => {
    const r = validateCanonicalInput(badInput());
    expect(r.valid).toBe(false);
    expect(r.errors).toContainEqual(expect.objectContaining({
      code: "INVALID_UTC_TIMESTAMP", path: "/profile/source/collectedAt",
    }));
  });

  it("JSON Schema (AJV)", () => {
    const ajv = createContractAjv();
    const schema = JSON.parse(readFileSync(path.join(REPO_ROOT, "schemas/core/iso-8601-utc.schema.json"), "utf-8"));
    const validate = ajv.compile(schema);
    expect(validate("not-a-date")).toBe(false);
  });

  it("세션 submission validate", () => {
    const s = JSON.parse(JSON.stringify(loadExample("valid", "sandbox.json")));
    s.profile.source.collectedAt = "not-a-date";
    const r = validateSubmission(loadEnvironmentPack("sandbox"), s);
    expect(r.valid).toBe(false);
    expect(r.errors).toContainEqual(expect.objectContaining({
      code: "INVALID_UTC_TIMESTAMP", path: "/profile/source/collectedAt", receivedValue: "not-a-date",
    }));
  });

  it("CLI check:submission", () => {
    const s = JSON.parse(JSON.stringify(loadExample("valid", "sandbox.json")));
    delete s._note;
    s.userDecision.confirmedAt = "not-a-date";
    const dir = mkdtempSync(path.join(tmpdir(), "kio-ts-"));
    const file = path.join(dir, "submission.json");
    writeFileSync(file, JSON.stringify(s));
    let failed = false;
    try {
      execFileSync(process.execPath, [path.join(REPO_ROOT, "tools", "check-submission.mjs"), "--file", file],
        { encoding: "utf-8", stdio: "pipe" });
    } catch (err) {
      failed = true;
      const out = `${(err as { stdout?: Buffer }).stdout ?? ""}${(err as { stderr?: Buffer }).stderr ?? ""}`;
      expect(out).toMatch(/INVALID_UTC_TIMESTAMP/);
      expect(out).toMatch(/\/userDecision\/confirmedAt/);
    }
    expect(failed, "CLI 가 통과시키면 안 됨").toBe(true);
  });

  it("실행까지 도달하지 못한다 (Evidence 가 생성되지 않음)", async () => {
    const s = JSON.parse(JSON.stringify(loadExample("valid", "sandbox.json")));
    s.profile.source.collectedAt = "not-a-date";
    const out = await processSubmission(s);
    expect(out.validation.valid).toBe(false);
  });
});
