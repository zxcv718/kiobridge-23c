#!/usr/bin/env node
/**
 * Structural check of every environments/<env>/review-mapping.json.
 *
 *   node tools/verify-review-mappings.mjs [projectRoot]
 *
 * A review screen that cannot resolve a required field must fail loudly, so the
 * mapping itself has to be well-formed and must actually cover the fields each
 * domain has to show a user before the boundary.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const ENV_DIR = path.join(ROOT, "environments");

const SOURCE_TYPES = new Set([
  "selectedOption", "selectedCandidateSupportedOption", "selectedCandidateAttribute",
  "selectedCandidateRequirement", "selectedCandidateField", "sessionContext",
  "profile", "uiState", "constant",
]);
const STRATEGIES = new Set(["FIRST", "JOIN", "INTERSECTION_SINGLE"]);

/** Fields each domain must surface before the review boundary. */
const REQUIRED_FIELDS = {
  hospital: ["visitType", "appointmentStatus", "checkInRoute", "departmentId", "guardianPresent", "supportModes", "userConfirmed"],
  "public-office": ["serviceCategory", "requestedTask", "selectedService", "authMethod", "availableAuthMethods", "guidanceMode", "accessibility", "notActualApplication"],
  "chicken-store": ["serviceType", "menuName", "quantity", "allergenCheck", "unitPrice", "totalPrice", "targetMatch", "paymentNotice"],
};

const errors = [];
const perEnv = [];
const envIds = existsSync(ENV_DIR)
  ? readdirSync(ENV_DIR).filter((d) => statSync(path.join(ENV_DIR, d)).isDirectory())
  : [];

for (const env of envIds) {
  const file = path.join(ENV_DIR, env, "review-mapping.json");
  if (!existsSync(file)) { errors.push({ env, message: "review-mapping.json 이 없습니다." }); continue; }
  let doc;
  try { doc = JSON.parse(readFileSync(file, "utf-8")); }
  catch (err) { errors.push({ env, message: `JSON 파싱 실패: ${err.message}` }); continue; }

  if (doc.environmentId !== env) errors.push({ env, message: `environmentId 불일치: ${doc.environmentId}` });
  if (!Array.isArray(doc.fields) || doc.fields.length === 0) { errors.push({ env, message: "fields 가 비어 있습니다." }); continue; }

  const seen = new Set();
  for (const f of doc.fields) {
    const at = `${env}/${f.fieldId ?? "(fieldId 없음)"}`;
    if (!f.fieldId) errors.push({ env, message: "fieldId 가 없습니다." });
    else if (seen.has(f.fieldId)) errors.push({ env, message: `중복 fieldId: ${f.fieldId}` });
    seen.add(f.fieldId);
    if (!f.label) errors.push({ env, message: `${at}: label 이 없습니다.` });
    if (!Array.isArray(f.sources) || f.sources.length === 0) { errors.push({ env, message: `${at}: sources 가 비어 있습니다.` }); continue; }
    for (const src of f.sources) {
      if (!SOURCE_TYPES.has(src.type)) errors.push({ env, message: `${at}: 잘못된 source type "${src.type}"` });
      if (src.strategy && !STRATEGIES.has(src.strategy)) errors.push({ env, message: `${at}: 잘못된 strategy "${src.strategy}"` });
      if (src.type === "constant" && !src.value) errors.push({ env, message: `${at}: constant 에 value 가 없습니다.` });
      if (["sessionContext", "profile", "uiState"].includes(src.type) && !src.path) errors.push({ env, message: `${at}: ${src.type} 에 path 가 없습니다.` });
      if (["selectedOption", "selectedCandidateSupportedOption", "selectedCandidateAttribute", "selectedCandidateRequirement", "selectedCandidateField"].includes(src.type) && !src.key) {
        errors.push({ env, message: `${at}: ${src.type} 에 key 가 없습니다.` });
      }
    }
    // A required field with no source that can ever answer is a guaranteed stop.
    if (f.required && f.sources.every((s) => s.type === "constant" && !s.value)) {
      errors.push({ env, message: `${at}: 필수인데 값을 만들 수 있는 source 가 없습니다.` });
    }
  }

  for (const need of REQUIRED_FIELDS[env] ?? []) {
    if (!seen.has(need)) errors.push({ env, message: `필수 검토 항목 누락: ${need}` });
  }
  perEnv.push({ env, fields: doc.fields.length, required: doc.fields.filter((f) => f.required).length });
}

// Domain-specific promises the platform makes to users.
const hospitalDept = envIds.includes("hospital")
  && JSON.parse(readFileSync(path.join(ENV_DIR, "hospital", "review-mapping.json"), "utf-8"))
    .fields.find((f) => f.fieldId === "departmentId");
if (hospitalDept) {
  const types = hospitalDept.sources.map((s) => s.type);
  for (const need of ["selectedOption", "selectedCandidateSupportedOption", "sessionContext"]) {
    if (!types.includes(need)) errors.push({ env: "hospital", message: `departmentId 에 ${need} 소스가 없습니다 (조회 순서 요구사항).` });
  }
}
const officeAuth = envIds.includes("public-office")
  && JSON.parse(readFileSync(path.join(ENV_DIR, "public-office", "review-mapping.json"), "utf-8"))
    .fields.find((f) => f.fieldId === "authMethod");
if (officeAuth && !officeAuth.sources.some((s) => s.strategy === "INTERSECTION_SINGLE")) {
  errors.push({ env: "public-office", message: "authMethod 가 사용자 수단과 후보 요구의 교집합을 쓰지 않습니다." });
}

console.log("REVIEW MAPPING VERIFICATION");
console.log("=".repeat(52));
for (const e of perEnv) console.log(`  ${e.env.padEnd(16)} 필드 ${e.fields}개 (필수 ${e.required})`);
console.log("");

if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) console.error(`  [${e.env}] ${e.message}`);
  process.exit(1);
}
console.log("모든 검토화면 매핑이 유효하며 도메인 필수 항목을 포함합니다.");
