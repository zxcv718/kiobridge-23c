/**
 * STEP 4~7 코어 — 필터링·랭킹·설명·대안. 전부 결정론 순수 함수.
 *
 * 원칙: "LLM은 표현만, 결정은 엔진만" — 이 파일에는 추론·외부 호출이 없다.
 * 가중치는 팀 튜닝 대상(심사 대상)이며 WEIGHTS 한 곳에서만 바꾼다.
 */
import type { Candidate, Recommendation } from "@kiobridge/participant-sdk";
import { SENTINEL } from "@kiobridge/profile-contract";
import {
  contextBonusFor, isBusySlot, timeSlotFromSignals, TIME_SLOT_KO,
  type ContextSignal, type TimeSlot,
} from "./context";

export interface ChickenPrefs {
  serviceType?: string;
  spicyLevel?: string;
  boneType?: string;
  cupOption?: string;
  quantity?: number;
}
export interface ChickenHard {
  allergenIds?: string[];
  maxPriceKrw?: number;
}
export interface EngineContext {
  preferences: ChickenPrefs;
  hardConstraints: ChickenHard;
  /** 값별 출처·신뢰도 — 재질문 판정에 쓴다 (서버의 LOW_CONFIDENCE 규칙과 동일 기준). */
  fieldMetadata?: Record<string, { confidence: number; confirmedByUser: boolean }>;
  /** 외부 맥락 — 정렬 순서만 바꾼다. 없으면 맥락 없이 추천한다(가이드 권장 fallback). */
  contextSignals?: ContextSignal[];
  /** 만료 판정 기준 시각. 테스트에서 고정하기 위해 주입 가능하게 둔다. */
  now?: Date;
}

/** 지금 유효한 시간대 신호. 만료됐거나 없으면 undefined — 그 경우 이유에서도 언급하지 않는다. */
export function activeTimeSlot(ctx: EngineContext): TimeSlot | undefined {
  return timeSlotFromSignals(ctx.contextSignals, ctx.now ?? new Date());
}

export interface Excluded {
  candidateId: string;
  reasonCode: string;
  explanation: string;
}

export interface FilterResult {
  survivors: Candidate[];
  excluded: Excluded[];
  /** 하드 제약에 UNKNOWN이 있어 임의 판단이 금지된 상태 — 재확인 필요. */
  hardConstraintUnknown: boolean;
}

/* 표기는 시안 99:1246 을 따른다 — 「콩(대두)」가 아니라 「대두」다.
   같은 표가 ui/src/screens/CartReview.tsx 에도 있다. 한쪽만 고치면 제외 사유와
   장바구니가 서로 다른 이름으로 같은 알레르겐을 부른다. 둘을 함께 고친다. */
const ALLERGEN_KO: Record<string, string> = {
  PEANUT: "땅콩", SOY: "대두", MILK: "우유", EGG: "계란", WHEAT: "밀", SHRIMP: "새우",
};
const definite = (v: string | undefined): v is string =>
  v !== undefined && v !== SENTINEL.NO_PREFERENCE && v !== SENTINEL.UNKNOWN && v !== SENTINEL.NOT_APPLICABLE;

/* ───────────────────────── STEP 4: 필터 ───────────────────────── */

export function filterCandidatesCore(candidates: Candidate[], ctx: EngineContext): FilterResult {
  const { allergenIds = [], maxPriceKrw } = ctx.hardConstraints;
  const hardConstraintUnknown = allergenIds.includes(SENTINEL.UNKNOWN);
  const userAllergens = allergenIds.filter((a) => a !== SENTINEL.UNKNOWN);
  const svc = ctx.preferences.serviceType;

  const survivors: Candidate[] = [];
  const excluded: Excluded[] = [];

  for (const c of candidates) {
    const attrs = (c as { attributes?: { allergenIds?: string[] } }).attributes ?? {};
    const price = (c as { price?: number }).price;
    const candAllergens: string[] = attrs.allergenIds ?? [];
    const hit = candAllergens.filter((a) => userAllergens.includes(a));

    if (c.available === false) {
      excluded.push({ candidateId: c.candidateId, reasonCode: "CANDIDATE_UNAVAILABLE", explanation: `${c.name}은(는) 품절이라 제외했습니다.` });
    } else if (hit.length > 0) {
      const names = hit.map((a) => ALLERGEN_KO[a] ?? a).join("·");
      excluded.push({ candidateId: c.candidateId, reasonCode: "ALLERGEN_CONFLICT", explanation: `등록하신 ${names} 알레르기와 겹치는 재료가 있어 제외했습니다.` });
    } else if (maxPriceKrw !== undefined && price !== undefined && price > maxPriceKrw) {
      excluded.push({ candidateId: c.candidateId, reasonCode: "PRICE_LIMIT_EXCEEDED", explanation: `가격(${price.toLocaleString()}원)이 예산 상한(${maxPriceKrw.toLocaleString()}원)을 넘어 제외했습니다.` });
    } else if (definite(svc) && !(c.supportedOptions?.SERVICE_TYPE ?? []).includes(svc)) {
      const label = svc === "TAKE_OUT" ? "포장" : "매장 이용";
      excluded.push({ candidateId: c.candidateId, reasonCode: "SERVICE_TYPE_UNSUPPORTED", explanation: `${label}을 원하셨는데 이 메뉴는 ${label}이 불가능해 제외했습니다.` });
    } else {
      survivors.push(c);
    }
  }
  return { survivors, excluded, hardConstraintUnknown };
}

/* ───────────────────────── STEP 5: 랭킹 ─────────────────────────
 * 가중치 (합 100) — 팀 킥오프에서 튜닝한다. 산정 근거:
 *  - 하드 제약은 이미 STEP 4에서 제거됐으므로 여기서는 "선호 일치"만 다룬다.
 *  - **네 축을 25씩 똑같이 둔다.** 컵을 질문에서 뺀 뒤로 남은 축 사이에 우열을
 *    둘 근거가 없다. 옛 배분(맛 45 > 이용방식 25 > 가격 20 > 컵 10)은 «컵이
 *    가장 덜 중요한 축»이라는 전제 위에 세운 순서였고, 그 축이 사라지면서
 *    전제도 같이 사라졌다. 근거 없이 남은 순서를 유지하는 것보다 균등이 정직하다.
 *  - **컵은 점수에 넣지 않는다.** 묻지 않는 것을 점수로 다루면, 모든 후보가
 *    같은 중립점(weight*0.5)을 받아 순위에 아무 영향도 못 주면서 총점만 부풀린다.
 *    다만 실행계획이 외부 입력(CLI raw input)으로 들어온 cupOption 을 존중하는
 *    능력은 그대로다 — core/plan.ts 의 선택 그룹 처리. */
export const WEIGHTS = { spicy: 25, bone: 25, service: 25, price: 25 } as const;

export interface Scored {
  candidate: Candidate;
  total: number;
  parts: Record<string, number>;
}

export function scoreCandidates(survivors: Candidate[], ctx: EngineContext): Scored[] {
  const prices = survivors
    .map((c) => (c as { price?: number }).price)
    .filter((p): p is number => p !== undefined);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);

  const matchScore = (weight: number, pref: string | undefined, supported: string[] | undefined, attr?: string): number => {
    if (!definite(pref)) return weight * 0.5; // 선호 없음 → 중립(가점도 감점도 없음)
    const pool = attr !== undefined ? [attr] : (supported ?? []);
    return pool.includes(pref) ? weight : 0;
  };

  // 맥락은 선호가 없을 때만 개입한다 — 우선순위 사다리 preferences > 외부맥락.
  const slot = activeTimeSlot(ctx);
  const serviceTypeChosen = definite(ctx.preferences.serviceType);

  const out = survivors.map((c) => {
    const attrs = (c as { attributes?: { spicyLevel?: string; boneType?: string } }).attributes ?? {};
    const price = (c as { price?: number }).price;
    const parts: Record<string, number> = {
      spicy: matchScore(WEIGHTS.spicy, ctx.preferences.spicyLevel, c.supportedOptions?.SPICY_LEVEL, attrs.spicyLevel),
      bone: matchScore(WEIGHTS.bone, ctx.preferences.boneType, c.supportedOptions?.BONE_TYPE, attrs.boneType),
      service: matchScore(WEIGHTS.service, ctx.preferences.serviceType, c.supportedOptions?.SERVICE_TYPE),
      price:
        price === undefined || maxP === minP
          ? WEIGHTS.price * 0.5
          : WEIGHTS.price * (1 - (price - minP) / (maxP - minP)),
      // 가중치 100 밖의 순서 조정분. 후보를 제거하지 않으며, 0이면 맥락 미반영을 뜻한다.
      context: contextBonusFor(c, slot, serviceTypeChosen),
    };
    const total = Math.round(Object.values(parts).reduce((a, b) => a + b, 0) * 10) / 10;
    return { candidate: c, total, parts };
  });
  return out.sort((a, b) => b.total - a.total || a.candidate.candidateId.localeCompare(b.candidate.candidateId));
}

/**
 * 재질문(reconfirmation)의 의미론 — 키트 UNKNOWN_POLICY와 동일 기준:
 *  - 하드 제약이 UNKNOWN → 임의 추론 금지, 반드시 재확인 (confidence 0.4)
 *  - 입력 신뢰 낮음(confidence<0.6 && 미확인) → 재확인 (confidence 0.5)
 *  - 점수 동점은 재질문 사유가 아니다 — "동점은 이유와 대안 제시"로 해결한다 (confidence 하한 0.6)
 */
export function computeConfidence(ranked: Scored[], hardConstraintUnknown: boolean, lowTrustInput: boolean): number {
  if (ranked.length === 0) return 0;
  if (hardConstraintUnknown) return 0.4;
  if (lowTrustInput) return 0.5;
  if (ranked.length === 1) return 0.9;
  const [top, second] = ranked;
  // 선호를 말하지 않은 축은 모든 후보에 같은 중립점을 얹는다. 그 공통분이 분모에 들어가면
  // 실제 격차가 희석되므로, 후보 간 점수 "폭"을 기준으로 1·2위 격차를 잰다.
  const spread = top.total - ranked[ranked.length - 1].total;
  const margin = spread <= 0 ? 0 : (top.total - second.total) / spread;
  return Math.round(Math.min(0.95, 0.6 + margin * 0.35) * 100) / 100;
}

export const RECONFIRM_THRESHOLD = 0.6;

export function hasLowTrustInput(ctx: EngineContext): boolean {
  return Object.values(ctx.fieldMetadata ?? {}).some(
    (m) => typeof m?.confidence === "number" && m.confidence < RECONFIRM_THRESHOLD && m.confirmedByUser === false,
  );
}

export function buildRecommendation(candidates: Candidate[], ctx: EngineContext): Recommendation {
  const { survivors, excluded, hardConstraintUnknown } = filterCandidatesCore(candidates, ctx);
  const ranked = scoreCandidates(survivors, ctx);
  const confidence = computeConfidence(ranked, hardConstraintUnknown, hasLowTrustInput(ctx));
  const top = ranked[0];
  return {
    recommendedCandidateId: top ? top.candidate.candidateId : null,
    alternativeCandidateIds: ranked.slice(1, 3).map((s) => s.candidate.candidateId),
    excludedCandidates: excluded,
    scoreBreakdown: Object.fromEntries(ranked.map((s) => [s.candidate.candidateId, s.total])),
    recommendationReasons: [], // STEP 6에서 채운다 (buildSubmission 조립 순서와 동일)
    unmetConditions: unmetConditions(top, ctx),
    confidence,
    requiresReconfirmation: confidence < RECONFIRM_THRESHOLD,
  };
}

function unmetConditions(top: Scored | undefined, ctx: EngineContext): string[] {
  if (!top) return [];
  const out: string[] = [];
  const attrs = (top.candidate as { attributes?: { spicyLevel?: string; boneType?: string } }).attributes ?? {};
  if (definite(ctx.preferences.spicyLevel) && attrs.spicyLevel !== ctx.preferences.spicyLevel)
    out.push(`선호하신 맵기(${ctx.preferences.spicyLevel})와 다른 맵기입니다`);
  if (definite(ctx.preferences.boneType) && attrs.boneType !== ctx.preferences.boneType)
    out.push(`선호하신 형태(${ctx.preferences.boneType})와 다른 형태입니다`);
  if (definite(ctx.preferences.cupOption) && !(top.candidate.supportedOptions?.CUP ?? []).includes(ctx.preferences.cupOption!))
    out.push(`선호하신 컵 옵션을 이 메뉴에서는 선택할 수 없습니다`);
  return out;
}

/* ───────────────────────── STEP 6: 설명 ─────────────────────────
 * 문장 공식: [무엇을 근거로] + [무엇을 했는지]. 단정형 금지, "AI가 추천" 금지. */

const SPICY_KO: Record<string, string> = { MILD: "순한맛", MEDIUM: "보통맛", HOT: "매운맛" };
const BONE_KO: Record<string, string> = { BONE: "뼈", BONELESS: "순살" };

/** 사용자가 선호를 하나도 말하지 않았는가 (전부 "상관없어요"/미입력) */
function noStatedPreference(p: ChickenPrefs): boolean {
  return !definite(p.serviceType) && !definite(p.spicyLevel) && !definite(p.boneType) && !definite(p.cupOption);
}

export function explainCore(rec: Recommendation, ctx: EngineContext): string[] {
  const reasons: string[] = [];
  const p = ctx.preferences;
  const h = ctx.hardConstraints;

  if (rec.recommendedCandidateId === null) {
    reasons.push("입력하신 조건을 모두 만족하는 메뉴가 없어 추천을 만들지 않았습니다. 조건을 수정하시거나 직원 도움을 요청해 주세요.");
  } else {
    if (definite(p.serviceType))
      reasons.push(`${p.serviceType === "TAKE_OUT" ? "포장" : "매장 이용"}을 원하셔서 ${p.serviceType === "TAKE_OUT" ? "포장" : "매장 이용"}이 가능한 메뉴 중에서 골랐습니다.`);
    if (definite(p.spicyLevel))
      reasons.push(`${SPICY_KO[p.spicyLevel] ?? p.spicyLevel}을 선호하셔서 ${SPICY_KO[p.spicyLevel] ?? p.spicyLevel} 메뉴를 먼저 보여드립니다.`);
    if (definite(p.boneType))
      reasons.push(`${BONE_KO[p.boneType] ?? p.boneType}을 선호하셔서 ${BONE_KO[p.boneType] ?? p.boneType} 메뉴를 골랐습니다.`);
    if (h.maxPriceKrw !== undefined)
      reasons.push(`예산 ${h.maxPriceKrw.toLocaleString()}원 이내의 메뉴만 추천 대상에 두었습니다.`);

    // 무엇이 순위를 갈랐는지 밝힌다 — 근거를 말하지 않는 추천은 설명이 아니다.
    if (noStatedPreference(p)) {
      reasons.push(
        "맵기·형태·이용 방식을 모두 '상관없어요'로 답해 주셔서, 그 항목들은 순위에 반영하지 않았습니다. " +
          "남은 기준이 가격뿐이라 가장 저렴한 메뉴를 먼저 보여드립니다.",
      );
    }
  }

  const byReason = new Map<string, number>();
  for (const e of rec.excludedCandidates) byReason.set(e.reasonCode, (byReason.get(e.reasonCode) ?? 0) + 1);
  if (byReason.get("ALLERGEN_CONFLICT"))
    reasons.push(`등록하신 알레르기와 겹치는 메뉴 ${byReason.get("ALLERGEN_CONFLICT")}개를 제외했습니다.`);
  if (byReason.get("CANDIDATE_UNAVAILABLE"))
    reasons.push(`품절된 메뉴 ${byReason.get("CANDIDATE_UNAVAILABLE")}개를 제외했습니다.`);
  if (byReason.get("PRICE_LIMIT_EXCEEDED"))
    reasons.push(`예산을 넘는 메뉴 ${byReason.get("PRICE_LIMIT_EXCEEDED")}개를 제외했습니다.`);
  if (byReason.get("SERVICE_TYPE_UNSUPPORTED"))
    reasons.push(`원하시는 이용 방식이 불가능한 메뉴 ${byReason.get("SERVICE_TYPE_UNSUPPORTED")}개를 제외했습니다.`);

  /* 재확인 안내는 «추천은 있는데 확신이 부족할 때»의 말이다. 조건에 맞는 메뉴가
     아예 없을 때 이 문장을 붙이면 거짓말이 된다 — 알레르기를 «없어요»라고 확실히
     답한 사람에게 «확실하지 않은 정보가 있다»고 말하는 꼴이고, 실제 원인(예산이
     최저가보다 낮음)은 바로 위 문장이 이미 정확히 말하고 있다. */
  if (rec.requiresReconfirmation && rec.recommendedCandidateId !== null)
    reasons.push("확실하지 않은 정보가 있어, 진행 전에 한 번 더 확인을 요청드립니다.");

  // 사용한 정보의 범위를 정직하게 고지한다.
  // 맥락을 반영했으면 반드시 말하고("이유를 숨기고 순서만 바꾸기" 금지),
  // 반영하지 않았으면 왜 안 했는지까지 밝힌다.
  if (rec.recommendedCandidateId !== null) {
    const slot = activeTimeSlot(ctx);
    const serviceTypeChosen = definite(p.serviceType);
    if (slot === undefined) {
      reasons.push("이 추천은 입력해 주신 선호·알레르기·예산만 사용했습니다. 시간대 정보는 사용하지 않았습니다.");
    } else if (isBusySlot(slot) && !serviceTypeChosen) {
      reasons.push(
        `지금은 ${TIME_SLOT_KO[slot]} 시간대라, 자리를 기다리지 않아도 되는 포장 가능한 메뉴를 앞에 두었습니다. ` +
          "메뉴를 걸러낸 것이 아니라 보여드리는 순서만 바꿨습니다.",
      );
    } else if (serviceTypeChosen) {
      reasons.push(`이용 방식을 직접 골라 주셔서, 시간대(${TIME_SLOT_KO[slot]})는 순서에 반영하지 않았습니다.`);
    } else {
      reasons.push(`지금은 ${TIME_SLOT_KO[slot]}이라 시간대로 순서를 바꾸지 않았습니다.`);
    }
  }

  return reasons.length > 0 ? reasons : ["입력하신 조건에 맞는 항목입니다."];
}

/* ───────────────────────── STEP 7: 대안 ─────────────────────────
 * 대안도 하드 제약을 지킨다: scoreBreakdown 에는 STEP 4를 통과한 생존 후보만 들어 있으므로
 * 그 점수 순서를 그대로 쓴다 — 제외된 후보를 대안으로 되살리지 않는다. */

export function alternativesFromRecommendation(candidates: Candidate[], rec: Recommendation): string[] {
  const ids = new Set(candidates.map((c) => c.candidateId));
  return Object.entries(rec.scoreBreakdown ?? {})
    .filter(([id]) => id !== rec.recommendedCandidateId && ids.has(id))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([id]) => id);
}
