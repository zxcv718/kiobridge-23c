#!/usr/bin/env node
/**
 * Verifies the public environment contracts are reachable: two dedicated
 * endpoints, the extended fixture, and the SDK methods that fetch them.
 *
 *   node tools/verify-public-environment-api.mjs [projectRoot]
 *
 * These declare HOW compatibility is judged, so a team can self-check before
 * submitting. They are not the hidden recommendation answer.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf-8");

const errors = [];
const checks = [];
const check = (label, ok, detail = "") => { checks.push({ label, ok, detail }); if (!ok) errors.push(`${label}${detail ? ` — ${detail}` : ""}`); };

// --- server routes -----------------------------------------------------------
let server = "";
try { server = read("apps/simulation-api/src/server.ts"); }
catch { check("server.ts 존재", false); }

check("GET /environments/:id/compatibility-rules",
  /app\.get\(\s*"\/api\/v1\/environments\/:environmentId\/compatibility-rules"/.test(server));
check("GET /environments/:id/review-mapping",
  /app\.get\(\s*"\/api\/v1\/environments\/:environmentId\/review-mapping"/.test(server));
check("GET /environments/:id/fixture", /environments\/:(id|environmentId)\/fixture/.test(server));

// --- fixture carries both public contracts ----------------------------------
let loader = "";
try { loader = read("apps/simulation-api/src/loader.ts"); } catch { /* reported below */ }
check("fixture 에 compatibilityRules 포함", /compatibilityRules:\s*pack\.compatibilityRules/.test(loader));
check("fixture 에 reviewMapping 포함", /reviewMapping:\s*pack\.reviewMapping/.test(loader));

let contracts = "";
try { contracts = read("packages/contracts/src/index.ts"); } catch { /* reported below */ }
const fixtureBlock = contracts.slice(contracts.indexOf("export interface PublicFixture"), contracts.indexOf("export interface PublicFixture") + 900);
check("PublicFixture 타입에 compatibilityRules", fixtureBlock.includes("compatibilityRules"));
check("PublicFixture 타입에 reviewMapping", fixtureBlock.includes("reviewMapping"));

// --- SDK ---------------------------------------------------------------------
let sdk = "";
try { sdk = read("packages/participant-sdk/src/index.ts"); } catch { check("participant-sdk 존재", false); }
for (const m of ["getCompatibilityRules", "getReviewMapping", "getPublicFixture", "extractExecutionChoices",
  "evaluateCompatibility", "evaluateTwoStageCompatibility"]) {
  check(`SDK.${m}`, sdk.includes(m));
}
// The SDK must not build the team's answer for them.
for (const forbidden of ["buildExecutionPlan", "recommendCandidate", "autoFix", "repairSubmission"]) {
  check(`SDK 가 ${forbidden} 를 제공하지 않음`, !sdk.includes(forbidden));
}

// --- the answer must stay private -------------------------------------------
check("완성 제출 예제는 sandbox 만 공개",
  existsSync(path.join(ROOT, "examples/submission-format-example/sandbox.json"))
  && !["chicken-store", "hospital", "public-office"].some((e) =>
    existsSync(path.join(ROOT, `examples/submission-format-example/${e}.json`))));

console.log("PUBLIC ENVIRONMENT API VERIFICATION");
console.log("=".repeat(52));
const width = Math.max(...checks.map((c) => c.label.length)) + 2;
for (const c of checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.label.padEnd(width)}${c.detail}`);
console.log("");
if (errors.length > 0) { console.error(`실패 ${errors.length}건`); process.exit(1); }
console.log("공개 계약이 API 와 SDK 로 모두 조회 가능합니다.");
