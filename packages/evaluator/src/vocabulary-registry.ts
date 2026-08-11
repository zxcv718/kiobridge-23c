/**
 * Vocabulary registry.
 *
 * UPPER_SNAKE_CASE is a spelling rule, not a membership rule: "ANY", "AUTO" and
 * "DEFAULT" all look official and mean nothing. This registry collects the
 * values that ARE official for an environment so every enum-ish value in a pack
 * can be checked against a real list.
 *
 * Sources, in order:
 *   1. common vocabulary   (sentinels + profile enums)
 *   2. environment vocabulary (facts / preferences / hardConstraints / capabilities)
 *   3. option-groups.json  (what the kiosk can actually offer)
 *   4. accessibility vocabulary
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { EnvironmentPack } from "@kiobridge/contracts";

export interface VocabularyRegistry {
  environmentId: string;
  /** Every legal value, regardless of which field it belongs to. */
  all: Set<string>;
  /** field name (e.g. "visitType", "allergenIds") → legal values. */
  byField: Map<string, Set<string>>;
  /** option group id → legal option ids. */
  byOptionGroup: Map<string, Set<string>>;
  /** Human labels where the vocabulary provides them. */
  labels: Map<string, string>;
}

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;

/** Pull the string values out of a vocabulary section, ignoring type schemas. */
function collectSection(section: unknown, field: string, reg: VocabularyRegistry): void {
  if (Array.isArray(section)) {
    const set = reg.byField.get(field) ?? new Set<string>();
    for (const v of section) {
      if (typeof v === "string") { set.add(v); reg.all.add(v); }
    }
    reg.byField.set(field, set);
    return;
  }
  if (section && typeof section === "object") {
    const obj = section as Record<string, unknown>;
    // `{ "type": "integer" }` describes a shape, not an enum.
    if (typeof obj.type === "string") return;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") {
        // sentinels: { UNKNOWN: "UNKNOWN" }
        reg.all.add(v);
        const set = reg.byField.get(field) ?? new Set<string>();
        set.add(v);
        reg.byField.set(field, set);
      } else {
        collectSection(v, k, reg);
      }
    }
  }
}

export function buildVocabularyRegistry(environmentId: string, schemasDir: string, pack?: EnvironmentPack): VocabularyRegistry {
  const reg: VocabularyRegistry = {
    environmentId,
    all: new Set<string>(),
    byField: new Map(),
    byOptionGroup: new Map(),
    labels: new Map(),
  };

  const vocabDir = path.join(schemasDir, "vocabularies");
  for (const file of ["common.vocabulary.json", "accessibility.vocabulary.json", `${environmentId}.vocabulary.json`]) {
    const full = path.join(vocabDir, file);
    if (!existsSync(full)) continue;
    const doc = readJson(full);
    for (const [key, value] of Object.entries(doc)) {
      if (key === "vocabularyVersion" || key === "environmentId" || key === "description" || key === "languagePattern") continue;
      collectSection(value, key, reg);
    }
  }

  // Option groups are the values a kiosk screen can actually offer.
  for (const g of pack?.optionGroups ?? []) {
    const set = new Set<string>();
    for (const o of g.options) {
      set.add(o.id);
      reg.all.add(o.id);
      if (o.label) reg.labels.set(o.id, o.label);
    }
    reg.byOptionGroup.set(g.groupId, set);
  }

  return reg;
}

/** Values that look official but belong to no vocabulary. */
export const FORBIDDEN_PSEUDO_VALUES = new Set(["ANY", "ALL", "DEFAULT", "AUTO", "UNKNOWN_VALUE", "NA", "N_A", "NONE_OF_THESE"]);

export interface MembershipProblem {
  where: string;
  value: string;
  reason: string;
}

const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Every enum-ish value in a pack must exist in the registry. Booleans, numbers
 * and free text (names, labels) are not enum values and are left alone.
 */
export function checkVocabularyMembership(pack: EnvironmentPack, reg: VocabularyRegistry): MembershipProblem[] {
  const problems: MembershipProblem[] = [];

  const check = (value: unknown, where: string, groupId?: string) => {
    if (typeof value !== "string" || !value) return;
    if (!UPPER_SNAKE.test(value)) {
      problems.push({ where, value, reason: "공식 enum 형식(UPPER_SNAKE_CASE)이 아닙니다." });
      return;
    }
    if (FORBIDDEN_PSEUDO_VALUES.has(value)) {
      problems.push({ where, value, reason: "어떤 Vocabulary 에도 없는 임의 sentinel 입니다." });
      return;
    }
    if (groupId) {
      const allowed = reg.byOptionGroup.get(groupId);
      if (allowed && !allowed.has(value)) {
        problems.push({ where, value, reason: `옵션 그룹 ${groupId} 에 없는 값입니다.` });
        return;
      }
      if (allowed) return;
    }
    if (!reg.all.has(value)) {
      problems.push({ where, value, reason: "공식 Vocabulary 에 없는 값입니다." });
    }
  };

  for (const c of pack.candidates) {
    for (const [k, v] of Object.entries(c.attributes ?? {})) {
      for (const one of Array.isArray(v) ? v : [v]) check(one, `${c.candidateId}.attributes.${k}`);
    }
    for (const [groupId, values] of Object.entries(c.supportedOptions ?? {})) {
      if (!reg.byOptionGroup.has(groupId)) {
        problems.push({ where: `${c.candidateId}.supportedOptions`, value: groupId, reason: "존재하지 않는 옵션 그룹입니다." });
        continue;
      }
      for (const one of values ?? []) check(one, `${c.candidateId}.supportedOptions.${groupId}`, groupId);
    }
    for (const [k, v] of Object.entries((c.requirements ?? {}) as Record<string, unknown>)) {
      for (const one of Array.isArray(v) ? v : [v]) check(one, `${c.candidateId}.requirements.${k}`);
    }
  }

  // Rule vocabularies: neutral/wildcard values must be real too.
  for (const r of pack.compatibilityRules?.rules ?? []) {
    for (const v of r.neutralValues ?? []) check(v, `rule ${r.ruleId}.neutralValues`);
    for (const v of r.wildcardCandidateValues ?? []) check(v, `rule ${r.ruleId}.wildcardCandidateValues`);
  }

  // Review labels: a label key that is not a real value can never be shown.
  for (const f of pack.reviewMapping?.fields ?? []) {
    for (const key of Object.keys(f.valueLabels ?? {})) {
      // booleans are rendered as "true"/"false", not enum values
      if (key === "true" || key === "false") continue;
      check(key, `review ${f.fieldId}.valueLabels`);
    }
    for (const src of f.sources ?? []) {
      for (const key of Object.keys(src.itemValueLabels ?? {})) check(key, `review ${f.fieldId}.itemValueLabels`);
      if (src.type === "selectedOption" && src.key && !reg.byOptionGroup.has(src.key)) {
        problems.push({ where: `review ${f.fieldId}`, value: src.key, reason: "존재하지 않는 옵션 그룹을 참조합니다." });
      }
    }
  }

  return problems;
}
