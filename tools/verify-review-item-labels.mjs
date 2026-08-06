#!/usr/bin/env node
/**
 * Verifies array-valued review fields declare a Korean label for every item.
 *
 *   node tools/verify-review-item-labels.mjs [projectRoot]
 *
 * A JOIN without itemValueLabels prints raw enums ("LARGE_TEXT, STAFF_HELP") on
 * the last screen a user sees before the boundary.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const ENV_DIR = path.join(ROOT, "environments");
const VOCAB_DIR = path.join(ROOT, "schemas", "vocabularies");

/** Fields that must carry per-item labels. */
const REQUIRED_ITEM_LABELS = {
  hospital: ["supportModes"],
  "public-office": ["availableAuthMethods"],
};

/** Pull the array of values a vocabulary declares at a dotted path. */
function vocabularyValues(env, dotted) {
  const file = path.join(VOCAB_DIR, `${env}.vocabulary.json`);
  if (!existsSync(file)) return null;
  let cur = JSON.parse(readFileSync(file, "utf-8"));
  for (const seg of dotted.split(".")) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[seg];
  }
  return Array.isArray(cur) ? cur : null;
}

const errors = [];
const perEnv = [];
const envIds = existsSync(ENV_DIR)
  ? readdirSync(ENV_DIR).filter((d) => statSync(path.join(ENV_DIR, d)).isDirectory())
  : [];

for (const env of envIds) {
  const file = path.join(ENV_DIR, env, "review-mapping.json");
  if (!existsSync(file)) { errors.push({ env, message: "review-mapping.json 이 없습니다." }); continue; }
  const doc = JSON.parse(readFileSync(file, "utf-8"));
  let labelled = 0;

  for (const f of doc.fields ?? []) {
    for (const src of f.sources ?? []) {
      if (src.strategy !== "JOIN") continue;
      labelled += 1;
      if (!src.itemValueLabels || Object.keys(src.itemValueLabels).length === 0) {
        errors.push({ env, message: `${f.fieldId}: JOIN 인데 itemValueLabels 가 없어 원시 enum 이 노출됩니다.` });
        continue;
      }
      // Every value the vocabulary allows must have a label.
      if (src.type === "sessionContext" && src.path) {
        const values = vocabularyValues(env, src.path);
        for (const v of values ?? []) {
          if (!(v in src.itemValueLabels)) {
            errors.push({ env, message: `${f.fieldId}: "${v}" 에 대한 한국어 라벨이 없습니다.` });
          }
        }
      }
      for (const [k, v] of Object.entries(src.itemValueLabels)) {
        if (!v || typeof v !== "string") errors.push({ env, message: `${f.fieldId}: "${k}" 라벨이 비어 있습니다.` });
        if (v === k) errors.push({ env, message: `${f.fieldId}: "${k}" 라벨이 원시 enum 과 같습니다.` });
      }
    }
  }

  for (const need of REQUIRED_ITEM_LABELS[env] ?? []) {
    const f = (doc.fields ?? []).find((x) => x.fieldId === need);
    if (!f) { errors.push({ env, message: `필수 배열 필드 누락: ${need}` }); continue; }
    if (!f.sources.some((s) => s.itemValueLabels)) errors.push({ env, message: `${need}: itemValueLabels 가 필요합니다.` });
  }
  perEnv.push({ env, joins: labelled });
}

// The resolver must actually apply them.
const resolver = path.join(ROOT, "packages/kiosk-driver-contract/src/review-resolver.ts");
if (!existsSync(resolver)) errors.push({ env: "-", message: "review-resolver.ts 가 없습니다." });
else {
  const src = readFileSync(resolver, "utf-8");
  if (!src.includes("itemValueLabels")) errors.push({ env: "-", message: "resolver 가 itemValueLabels 를 적용하지 않습니다." });
  if (!src.includes("REVIEW_VALUE_LABEL_UNKNOWN")) errors.push({ env: "-", message: "라벨 누락 시 경고를 남기지 않습니다." });
}

console.log("REVIEW ITEM LABEL VERIFICATION");
console.log("=".repeat(52));
for (const e of perEnv) console.log(`  ${e.env.padEnd(16)} JOIN 필드 ${e.joins}개`);
console.log("");
if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) console.error(`  [${e.env}] ${e.message}`);
  process.exit(1);
}
console.log("배열형 검토값이 모두 한국어 라벨을 가집니다.");
