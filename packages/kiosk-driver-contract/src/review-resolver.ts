/**
 * Review resolver.
 *
 * The review screen is the last thing a user sees before the boundary, so it
 * must not guess. Each environment declares, per field, an ORDERED list of
 * official sources; this resolver walks them and records WHICH one answered.
 * A required field that no source can answer is an error (REVIEW_FIELD_UNRESOLVED),
 * never a silent "-".
 */
import {
  VALIDATION_CODES,
  type Candidate,
  type EnvironmentPack,
  type ResolvedReviewField,
  type ReviewFieldDef,
  type ReviewFieldSource,
  type ValidationError,
} from "@kiobridge/contracts";

export interface ReviewResolverInput {
  pack: EnvironmentPack;
  /** Official value → label, used when a mapping declares no itemValueLabels. */
  vocabularyLabels?: Map<string, string>;
  selectedCandidate?: Candidate;
  selectedOptions: Record<string, string | number | boolean>;
  sessionContext: unknown;
  profile: unknown;
  /** Values the driver computed (totals, confirmation labels, …). */
  uiValues: Record<string, unknown>;
}

export interface ReviewResolution {
  fields: ResolvedReviewField[];
  unresolvedRequiredFields: string[];
  errors: ValidationError[];
  /** Values shown as raw enums because no label was declared. */
  warnings: ValidationError[];
}

function readPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Labels applied per ARRAY ITEM, so a JOIN never prints raw enums. */
function labelItems(
  items: unknown[],
  src: ReviewFieldSource,
  vocabularyLabels: Map<string, string> | undefined,
  unlabelled: string[],
): string[] {
  return items.map((raw) => {
    const key = String(raw);
    const declared = src.itemValueLabels?.[key];
    if (declared) return declared;
    const fromVocabulary = vocabularyLabels?.get(key);
    if (fromVocabulary) return fromVocabulary;
    // Fall back to the raw enum, but never silently: the caller records a
    // warning so a missing label is fixed rather than shipped to a user.
    unlabelled.push(key);
    return key;
  });
}

function collapse(
  value: unknown,
  src: ReviewFieldSource,
  vocabularyLabels: Map<string, string> | undefined,
  unlabelled: string[],
): string | null {
  if (isEmpty(value)) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (src.strategy === "JOIN") {
      return labelItems(value, src, vocabularyLabels, unlabelled).join(src.separator ?? ", ");
    }
    // FIRST (default) — an ordered list's first entry is the canonical one.
    return String(value[0]);
  }
  return String(value);
}

/** Resolve a single declared source. Returns null when it has nothing to say. */
function resolveSource(
  src: ReviewFieldSource,
  input: ReviewResolverInput,
  unlabelled: string[],
): { value: string; source: string; itemLabelled?: boolean } | null {
  const { selectedCandidate, selectedOptions, sessionContext, profile, uiValues } = input;
  const vocab = input.vocabularyLabels;
  const take = (v: unknown) => collapse(v, src, vocab, unlabelled);

  switch (src.type) {
    case "selectedOption": {
      const v = src.key ? selectedOptions[src.key] : undefined;
      const c = take(v);
      return c === null ? null : { value: c, source: `selectedOptions.${src.key}` };
    }
    case "selectedCandidateSupportedOption": {
      const v = src.key ? selectedCandidate?.supportedOptions?.[src.key] : undefined;
      const c = take(v);
      return c === null ? null : { value: c, source: `selectedCandidate.supportedOptions.${src.key}` };
    }
    case "selectedCandidateAttribute": {
      const v = src.key ? (selectedCandidate?.attributes as Record<string, unknown> | undefined)?.[src.key] : undefined;
      const c = take(v);
      return c === null ? null : { value: c, source: `selectedCandidate.attributes.${src.key}` };
    }
    case "selectedCandidateRequirement": {
      const req = src.key ? (selectedCandidate?.requirements as Record<string, unknown> | undefined)?.[src.key] : undefined;
      if (src.strategy === "INTERSECTION_SINGLE") {
        // Only report an auth method when the user's means and the candidate's
        // requirement leave exactly one option — otherwise the USER must pick.
        const available = readPath(sessionContext, "capabilities.availableAuthMethods");
        const reqList = Array.isArray(req) ? req.map(String) : [];
        const availList = Array.isArray(available) ? available.map(String) : [];
        const inter = reqList.filter((r) => availList.includes(r));
        if (inter.length === 1) return { value: inter[0], source: "intersection(capabilities.availableAuthMethods, candidate.requirements)" };
        if (inter.length === 0 && reqList.length === 1) {
          // Nothing in common — still show what the candidate demands so the
          // review explains WHY validation blocked it.
          return { value: reqList[0], source: "selectedCandidate.requirements (교집합 없음)" };
        }
        return null;
      }
      const c = take(req);
      return c === null ? null : { value: c, source: `selectedCandidate.requirements.${src.key}` };
    }
    case "selectedCandidateField": {
      const v = src.key ? (selectedCandidate as unknown as Record<string, unknown> | undefined)?.[src.key] : undefined;
      const c = take(v);
      return c === null ? null : { value: c, source: `selectedCandidate.${src.key}` };
    }
    case "sessionContext": {
      const v = src.path ? readPath(sessionContext, src.path) : undefined;
      const c = take(v);
      return c === null ? null : { value: c, source: `sessionContext.${src.path}` };
    }
    case "profile": {
      const v = src.path ? readPath(profile, src.path) : undefined;
      const c = take(v);
      return c === null ? null : { value: c, source: `profile.${src.path}` };
    }
    case "uiState": {
      const v = src.path ? uiValues[src.path] : undefined;
      const c = take(v);
      return c === null ? null : { value: c, source: `uiState.${src.path}` };
    }
    case "constant":
      return src.value ? { value: src.value, source: "constant" } : null;
    default:
      return null;
  }
}

function resolveField(field: ReviewFieldDef, input: ReviewResolverInput, unlabelled: string[]): ResolvedReviewField {
  for (const src of field.sources) {
    const hit = resolveSource(src, input, unlabelled);
    if (!hit) continue;
    const label = field.valueLabels?.[hit.value] ?? hit.value;
    return {
      fieldId: field.fieldId, label: field.label, value: hit.value,
      displayValue: label, source: hit.source, resolved: true, required: field.required === true,
    };
  }
  return {
    fieldId: field.fieldId, label: field.label, value: null,
    displayValue: field.fallbackLabel ?? "확인 필요",
    source: "unresolved", resolved: false, required: field.required === true,
  };
}

export function resolveReview(input: ReviewResolverInput): ReviewResolution {
  const mapping = input.pack.reviewMapping;
  const unlabelled: string[] = [];
  const fields = (mapping?.fields ?? []).map((f) => resolveField(f, input, unlabelled));
  const unresolvedRequiredFields = fields.filter((f) => f.required && !f.resolved).map((f) => f.fieldId);

  const warnings: ValidationError[] = [...new Set(unlabelled)].map((value) => ({
    path: "/reviewResolution/labels",
    code: VALIDATION_CODES.REVIEW_VALUE_LABEL_UNKNOWN,
    message: `검토화면에 표시할 한국어 라벨이 없어 원시 enum "${value}" 을 그대로 보여줍니다.`,
    receivedValue: value,
  }));

  const errors: ValidationError[] = unresolvedRequiredFields.map((fieldId) => ({
    path: `/reviewResolution/fields/${fieldId}`,
    code: VALIDATION_CODES.REVIEW_FIELD_UNRESOLVED,
    message: `필수 검토 항목 "${fieldId}" 를 어떤 공식 소스에서도 확인할 수 없습니다. 임의로 추론하지 않습니다.`,
    ruleId: `${mapping?.environmentId ?? "unknown"}:${fieldId}`,
  }));

  return { fields, unresolvedRequiredFields, errors, warnings };
}

/** Flat key/value map for the legacy reviewSnapshot consumers. */
export function reviewToSnapshot(resolution: ReviewResolution): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of resolution.fields) out[f.label] = f.displayValue;
  return out;
}
