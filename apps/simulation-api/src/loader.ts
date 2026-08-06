/**
 * Environment pack loader. Reads /environments/<id> and assembles a typed,
 * DRIVER-AGNOSTIC EnvironmentPack plus its driver bindings.
 *
 * Environments are discovered from the filesystem: dropping in a new pack with
 * a valid manifest makes it appear in the environment list — no code change.
 * `toPublicFixture` withholds evaluation material (profiles) and device data
 * (the UPRLite binding).
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type {
  Candidate, CompatibilityRule, CompatibilityRuleSet, EnvironmentManifest, EnvironmentPack,
  OptionGroup, PublicFixture, ReviewMapping, SafetyRuleDef, ScreenDef, SimulationBinding,
  Transition, UprliteBinding,
} from "@kiobridge/contracts";
import { VALIDATION_CODES } from "@kiobridge/contracts";
import { buildVocabularyRegistry, checkVocabularyMembership } from "@kiobridge/evaluator";

// apps/simulation-api/src -> repo root
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const ENVIRONMENTS_DIR = path.join(REPO_ROOT, "environments");

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf-8")) as T;

/** Discover environment ids from the filesystem (pluggable packs). */
export function discoverEnvironmentIds(): string[] {
  if (!existsSync(ENVIRONMENTS_DIR)) return [];
  return readdirSync(ENVIRONMENTS_DIR)
    .filter((d) => statSync(path.join(ENVIRONMENTS_DIR, d)).isDirectory())
    .filter((d) => existsSync(path.join(ENVIRONMENTS_DIR, d, "manifest.json")))
    .sort();
}

export function loadEnvironmentPack(environmentId: string): EnvironmentPack {
  const dir = path.join(ENVIRONMENTS_DIR, environmentId);
  if (!existsSync(dir)) throw new Error(`Unknown environment: ${environmentId}`);

  const manifest = readJson<EnvironmentManifest>(path.join(dir, "manifest.json"));
  const screens = readJson<ScreenDef[]>(path.join(dir, "screens.json"));
  const candidates = readJson<Candidate[]>(path.join(dir, "candidates.json"));
  const transitions = readJson<Transition[]>(path.join(dir, "transitions.json"));
  const safetyRules = readJson<SafetyRuleDef[]>(path.join(dir, "safety-rules.json"));

  const ogPath = path.join(dir, "option-groups.json");
  const optionGroups = existsSync(ogPath) ? readJson<OptionGroup[]>(ogPath) : [];

  const simPath = path.join(dir, "bindings", "simulation.binding.json");
  const uprPath = path.join(dir, "bindings", "uprlite.binding.json");
  const simulation = existsSync(simPath)
    ? readJson<SimulationBinding>(simPath)
    : ({ driver: "SIMULATION", screens: {} } as SimulationBinding);
  const uprlite = existsSync(uprPath)
    ? readJson<UprliteBinding>(uprPath)
    : ({ driver: "UPRLITE", status: "PENDING_REAL_DEVICE", controls: {} } as UprliteBinding);

  const compatibilityRules = readJson<CompatibilityRuleSet>(path.join(dir, "compatibility-rules.json"));
  const reviewMapping = readJson<ReviewMapping>(path.join(dir, "review-mapping.json"));

  // Environment packs contain NO profile data (see PRIVATE_EVALUATION_BOUNDARY.md).
  const pack: EnvironmentPack = {
    manifest, screens, candidates, optionGroups, transitions, safetyRules,
    compatibilityRules, reviewMapping, bindings: { simulation, uprlite },
  };

  // A malformed pack is a platform bug, not a participant's problem. Fail loudly
  // at load time rather than letting a broken rule silently never fire.
  const problems = validateEnvironmentPack(pack);

  // Spelling is not membership: "ANY" is UPPER_SNAKE_CASE and means nothing.
  const registry = buildVocabularyRegistry(environmentId, path.join(REPO_ROOT, "schemas"), pack);
  const vocabProblems = checkVocabularyMembership(pack, registry);
  if (vocabProblems.length > 0) {
    throw new Error(
      `[${VALIDATION_CODES.ENVIRONMENT_VOCABULARY_CONFLICT}] 환경팩 "${environmentId}" 어휘 오류 ${vocabProblems.length}건\n` +
        vocabProblems.map((v) => `  - [${VALIDATION_CODES.VOCABULARY_VALUE_UNKNOWN}] ${v.where} = "${v.value}" — ${v.reason}`).join("\n"),
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `[${VALIDATION_CODES.ENVIRONMENT_CANDIDATE_DATA_CONFLICT}] 환경팩 "${environmentId}" 오류 ${problems.length}건\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
  }
  return pack;
}

const SECTIONS = new Set(["facts", "preferences", "hardConstraints", "capabilities", "intent"]);
const CANDIDATE_SOURCES = new Set(["supportedOptions", "requirements", "attributes", "field"]);
const TARGET_SOURCES = new Set([
  "candidateSupportedOptions", "candidateRequirements", "candidateAttributes", "candidateField",
  "executionSelectedOption", "executionSelectedValue",
]);
const LEGACY_TARGET_MAP: Record<string, string> = {
  supportedOptions: "candidateSupportedOptions",
  requirements: "candidateRequirements",
  attributes: "candidateAttributes",
  field: "candidateField",
};
const OPERATORS = new Set(["IN", "INTERSECTS", "EQUALS", "CONTAINS", "MAX", "DISJOINT", "CONTAINS_SELECTED", "EQUALS_SELECTED"]);
const SEVERITIES = new Set(["BLOCK", "WARN"]);
const UNKNOWN_POLICIES = new Set(["ALLOW", "RECONFIRM", "BLOCK", "IGNORE"]);
const REVIEW_SOURCE_TYPES = new Set([
  "selectedOption", "selectedCandidateSupportedOption", "selectedCandidateAttribute",
  "selectedCandidateRequirement", "selectedCandidateField", "sessionContext",
  "profile", "uiState", "constant",
]);
/** Domain enum values are UPPER_SNAKE_CASE; a lowercase one is a legacy leftover. */
const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;
/** attributes keys whose value must agree with a supportedOptions group. */
const ATTRIBUTE_MIRRORS: Record<string, string> = {
  visitType: "VISIT_TYPE",
  appointmentStatus: "APPOINTMENT",
  departmentId: "DEPARTMENT",
  serviceCategory: "CATEGORY",
  serviceType: "SERVICE_TYPE",
};

/**
 * Structural + semantic integrity of one pack. Everything here would otherwise
 * fail silently: a rule pointing at a key no candidate declares simply never
 * fires, and a duplicated attribute that drifts out of sync misleads the review.
 */
export function validateEnvironmentPack(pack: EnvironmentPack): string[] {
  const problems: string[] = [];
  const envId = pack.manifest.environmentId;

  // --- candidates ----------------------------------------------------------
  const seenIds = new Set<string>();
  for (const c of pack.candidates) {
    if (seenIds.has(c.candidateId)) problems.push(`중복 후보 ID: ${c.candidateId}`);
    seenIds.add(c.candidateId);

    const attrs = (c.attributes ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(attrs)) {
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (typeof v === "string" && v && !UPPER_SNAKE.test(v)) {
          problems.push(`${c.candidateId}.attributes.${key} 가 공식 enum(UPPER_SNAKE_CASE)이 아닙니다: "${v}"`);
        }
      }
      // Single source of truth: a mirrored attribute must agree with the option list.
      const group = ATTRIBUTE_MIRRORS[key];
      if (group && typeof value === "string") {
        const supported = c.supportedOptions?.[group];
        if (Array.isArray(supported) && supported.length > 0) {
          const agrees = supported.length === 1 ? supported[0] === value : value === "ANY" || supported.includes(value);
          if (!agrees) {
            problems.push(
              `${c.candidateId}: attributes.${key}="${value}" 와 supportedOptions.${group}=${JSON.stringify(supported)} 가 충돌합니다.`,
            );
          }
        }
      }
    }

    for (const [group, values] of Object.entries(c.supportedOptions ?? {})) {
      for (const v of values ?? []) {
        if (typeof v === "string" && !UPPER_SNAKE.test(v)) {
          problems.push(`${c.candidateId}.supportedOptions.${group} 에 비공식 enum: "${v}"`);
        }
      }
    }
    const auth = (c.requirements as Record<string, unknown> | undefined)?.authenticationMethods;
    if (Array.isArray(auth)) {
      for (const m of auth) {
        if (typeof m !== "string" || !UPPER_SNAKE.test(m)) problems.push(`${c.candidateId}.requirements.authenticationMethods 에 비공식 값: ${JSON.stringify(m)}`);
      }
    }
  }

  // --- compatibility rules --------------------------------------------------
  const rules = pack.compatibilityRules?.rules;
  if (!Array.isArray(rules)) {
    problems.push("compatibility-rules.json 의 rules 가 배열이 아닙니다.");
  } else {
    if (pack.compatibilityRules.environmentId !== envId) {
      problems.push(`compatibility-rules.json 의 environmentId 불일치: ${pack.compatibilityRules.environmentId}`);
    }
    const seenRules = new Set<string>();
    for (const r of rules as CompatibilityRule[]) {
      if (seenRules.has(r.ruleId)) problems.push(`중복 ruleId: ${r.ruleId}`);
      seenRules.add(r.ruleId);
      if (!SECTIONS.has(r.source?.section)) problems.push(`${r.ruleId}: 알 수 없는 source.section "${r.source?.section}"`);
      if (!r.source?.path) problems.push(`${r.ruleId}: source.path 가 없습니다.`);
      // Either the legacy `candidate` form or the new `target` form.
      const t = r.target
        ? { source: r.target.source, key: r.target.key ?? r.target.path ?? "" }
        : r.candidate
          ? { source: LEGACY_TARGET_MAP[r.candidate.source], key: r.candidate.key }
          : null;
      if (!t) problems.push(`${r.ruleId}: candidate 또는 target 이 필요합니다.`);
      else {
        if (!TARGET_SOURCES.has(t.source)) problems.push(`${r.ruleId}: 알 수 없는 target.source "${t.source}"`);
        if (!t.key) problems.push(`${r.ruleId}: target.key 가 없습니다.`);
      }
      if (!OPERATORS.has(r.operator)) problems.push(`${r.ruleId}: 알 수 없는 operator "${r.operator}"`);
      if (!SEVERITIES.has(r.severity)) problems.push(`${r.ruleId}: 알 수 없는 severity "${r.severity}"`);
      if (!UNKNOWN_POLICIES.has(r.unknownPolicy)) problems.push(`${r.ruleId}: 알 수 없는 unknownPolicy "${r.unknownPolicy}"`);
      if (!r.errorCode || !UPPER_SNAKE.test(r.errorCode)) problems.push(`${r.ruleId}: errorCode 가 올바르지 않습니다 "${r.errorCode}"`);
      if (!(r.errorCode in VALIDATION_CODES)) problems.push(`${r.ruleId}: 공식 오류코드가 아닙니다 "${r.errorCode}"`);

      // A rule aimed at a key nothing can produce never fires — a dead rule
      // looks exactly like a passing check, which is worse than no rule.
      if (t && t.key) {
        let reachable = true;
        if (t.source === "candidateField") {
          reachable = pack.candidates.some((c) => t.key in (c as unknown as Record<string, unknown>));
        } else if (t.source === "candidateSupportedOptions" || t.source === "candidateRequirements" || t.source === "candidateAttributes") {
          const bagName = { candidateSupportedOptions: "supportedOptions", candidateRequirements: "requirements", candidateAttributes: "attributes" }[t.source]!;
          reachable = pack.candidates.some((c) => {
            const bag = (c as unknown as Record<string, Record<string, unknown> | undefined>)[bagName];
            return bag && t.key in bag;
          });
        } else if (t.source === "executionSelectedOption") {
          reachable = pack.optionGroups.some((g) => g.groupId === t.key);
          if (!reachable) problems.push(`${r.ruleId}: 존재하지 않는 옵션 그룹을 대상으로 합니다: ${t.key}`);
        } else if (t.source === "executionSelectedValue") {
          reachable = ["quantity", "candidateId"].includes(t.key);
          if (!reachable) problems.push(`${r.ruleId}: executionSelectedValue 는 quantity 또는 candidateId 만 지원합니다: ${t.key}`);
        }
        if (!reachable && t.source.startsWith("candidate")) {
          problems.push(`${r.ruleId}: 어떤 후보도 ${t.key} 를 선언하지 않아 규칙이 실행될 수 없습니다.`);
        }
      }
    }
  }

  // --- review mapping -------------------------------------------------------
  const fields = pack.reviewMapping?.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    problems.push("review-mapping.json 에 fields 가 없습니다.");
  } else {
    if (pack.reviewMapping.environmentId !== envId) {
      problems.push(`review-mapping.json 의 environmentId 불일치: ${pack.reviewMapping.environmentId}`);
    }
    const seenFields = new Set<string>();
    for (const f of fields) {
      if (seenFields.has(f.fieldId)) problems.push(`중복 review fieldId: ${f.fieldId}`);
      seenFields.add(f.fieldId);
      if (!f.label) problems.push(`${f.fieldId}: label 이 없습니다.`);
      if (!Array.isArray(f.sources) || f.sources.length === 0) problems.push(`${f.fieldId}: sources 가 비어 있습니다.`);
      for (const src of f.sources ?? []) {
        if (!REVIEW_SOURCE_TYPES.has(src.type)) problems.push(`${f.fieldId}: 알 수 없는 source type "${src.type}"`);
        if (src.type === "constant" && !src.value) problems.push(`${f.fieldId}: constant source 에 value 가 없습니다.`);
        if ((src.type === "sessionContext" || src.type === "profile" || src.type === "uiState") && !src.path) {
          problems.push(`${f.fieldId}: ${src.type} source 에 path 가 없습니다.`);
        }
        if (src.type === "selectedOption" && src.key && !pack.optionGroups.some((g) => g.groupId === src.key)) {
          problems.push(`${f.fieldId}: 존재하지 않는 옵션 그룹 참조 "${src.key}"`);
        }
        if (src.type === "selectedCandidateField" && src.key) {
          const declared = pack.candidates.some((c) => src.key! in (c as unknown as Record<string, unknown>));
          if (!declared) problems.push(`${f.fieldId}: 어떤 후보도 "${src.key}" 필드를 가지고 있지 않습니다.`);
        }
        if (src.type === "selectedCandidateRequirement" && src.key) {
          const declared = pack.candidates.some((c) => c.requirements && src.key! in (c.requirements as Record<string, unknown>));
          if (!declared) problems.push(`${f.fieldId}: 어떤 후보도 requirements.${src.key} 를 선언하지 않습니다.`);
        }
        if (src.type === "selectedCandidateSupportedOption" && src.key) {
          const declared = pack.candidates.some((c) => c.supportedOptions && src.key! in c.supportedOptions);
          if (!declared) problems.push(`${f.fieldId}: 어떤 후보도 supportedOptions.${src.key} 를 선언하지 않습니다.`);
        }
      }
    }
  }

  // --- simulation binding ---------------------------------------------------
  for (const [state, b] of Object.entries(pack.bindings.simulation.screens ?? {})) {
    if (b.template === "FOUR_CARD_GRID") {
      if (b.pageSize === undefined) problems.push(`${state}: FOUR_CARD_GRID 에 pageSize 가 없습니다.`);
      else if (!Number.isInteger(b.pageSize) || b.pageSize < 1) problems.push(`${state}: 잘못된 pageSize ${b.pageSize}`);
    }
    if (!pack.manifest.states.includes(state)) problems.push(`binding 이 존재하지 않는 상태를 참조합니다: ${state}`);
  }

  return problems;
}

export function loadAllPacks(): Record<string, EnvironmentPack> {
  const out: Record<string, EnvironmentPack> = {};
  for (const id of discoverEnvironmentIds()) {
    try {
      out[id] = loadEnvironmentPack(id);
    } catch (err) {
      // A broken pack must never be skipped quietly: the environment would
      // silently disappear, or worse, load with rules that never run.
      // eslint-disable-next-line no-console
      console.error(`[loader] 환경팩 로딩 실패: ${id}\n${(err as Error).message}`);
      throw err;
    }
  }
  return out;
}

export function candidatesById(pack: EnvironmentPack): Record<string, Candidate> {
  const map: Record<string, Candidate> = {};
  for (const c of pack.candidates) map[c.candidateId] = c;
  return map;
}

/**
 * Public fixture: everything a participant needs to build a semantic plan.
 * Excludes the UPRLite (device) binding. Packs carry no profile data at all.
 */
export function toPublicFixture(pack: EnvironmentPack): PublicFixture {
  return {
    manifest: pack.manifest,
    candidates: pack.candidates,
    optionGroups: pack.optionGroups,
    compatibilityRules: pack.compatibilityRules,
    reviewMapping: pack.reviewMapping,
    screens: pack.screens,
    transitions: pack.transitions,
    safetyRules: pack.safetyRules,
    simulationBinding: pack.bindings.simulation,
  };
}
