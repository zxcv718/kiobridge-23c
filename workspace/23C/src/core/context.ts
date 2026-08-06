/**
 * 상황신호(contextSignals) — `docs/CONTEXT_AWARE_RECOMMENDATION_GUIDE.md` 계약 구현.
 *
 * 외부 API를 쓰지 않는다. 가이드가 지목한 두 소스만 쓴다:
 *   시간대 → 기기 시계 (DEVICE_CLOCK)
 *   재고   → fixture 의 candidates[].available
 *
 * 지켜야 할 경계 (가이드 §"절대 하면 안 되는 것"):
 *   - 외부 맥락은 **정렬 순서만** 바꾼다. 후보를 걸러내는 기준이 아니다.
 *   - 우선순위 사다리: hardConstraints > facts > preferences > 외부맥락.
 *     사용자가 직접 고른 값이 있으면 상황신호는 개입하지 않는다.
 *   - 만료된 신호는 없는 것으로 취급하고, 추천 이유에서도 언급하지 않는다.
 *   - 순서만 바꾸고 이유를 숨기지 않는다 — 반영했으면 반드시 문장으로 말한다.
 *
 * Core 계약은 건드리지 않는다. 팀 namespace 아래 extensions 로만 들어간다:
 *   sessionContext.extensions["23C.contextSignals"]
 */
import type { Candidate } from "@kiobridge/participant-sdk";

/**
 * sessionContext.extensions 의 키.
 *
 * 주의 — 확장 namespace 규칙이 두 곳에서 다르다:
 *   제출 최상위 `extensions`  → 키가 teamId 와 **정확히 일치**해야 한다 ("23C")
 *   `sessionContext.extensions` → `/^[A-Z][A-Z0-9_]*\.[A-Za-z][A-Za-z0-9_]*$/`
 *
 * 우리 팀 ID("23C")는 숫자로 시작해 두 번째 규칙을 통과하지 못한다.
 * 그래서 세션맥락 쪽만 TEAM_ 접두사를 붙인다. (창업팀에 제보 예정)
 */
export const CONTEXT_NAMESPACE = "TEAM_23C.contextSignals";

/** 신호 1건 — 가이드의 필드 규칙 그대로 (namespace/type/key/value/source/observedAt/expiresAt/confidence) */
export interface ContextSignal {
  type: "TIME_OF_DAY" | "STOCK";
  key: string;
  value: string;
  source: "DEVICE_CLOCK" | "FIXTURE";
  observedAt: string;
  expiresAt: string;
  confidence: number;
}

export type TimeSlot = "LUNCH_PEAK" | "DINNER_PEAK" | "OFF_PEAK" | "LATE_NIGHT";

export const TIME_SLOT_KO: Record<TimeSlot, string> = {
  LUNCH_PEAK: "점심 붐빔",
  DINNER_PEAK: "저녁 붐빔",
  OFF_PEAK: "한산한 시간",
  LATE_NIGHT: "늦은 시간",
};

/** 기기 시계만으로 판정. 로컬 시각 기준이며 추론하지 않는다. */
export function timeSlotOf(now: Date): TimeSlot {
  const h = now.getHours();
  if (h >= 11 && h < 14) return "LUNCH_PEAK";
  if (h >= 17 && h < 20) return "DINNER_PEAK";
  if (h >= 22 || h < 6) return "LATE_NIGHT";
  return "OFF_PEAK";
}

/** 신호는 1시간만 유효하다 — "어제 날씨로 오늘을 정하지 마세요"(가이드). */
const TTL_MS = 60 * 60 * 1000;

export function buildContextSignals(candidates: Candidate[], now: Date = new Date()): ContextSignal[] {
  const observedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + TTL_MS).toISOString();
  const soldOut = candidates.filter((c) => c.available === false).length;

  return [
    {
      type: "TIME_OF_DAY",
      key: "slot",
      value: timeSlotOf(now),
      source: "DEVICE_CLOCK",
      observedAt,
      expiresAt,
      confidence: 1,
    },
    {
      type: "STOCK",
      key: "soldOutCount",
      value: String(soldOut),
      source: "FIXTURE",
      observedAt,
      expiresAt,
      confidence: 1,
    },
  ];
}

/** 만료된 신호는 없는 것으로 취급한다. */
export function activeSignals(signals: ContextSignal[] | undefined, now: Date = new Date()): ContextSignal[] {
  if (!signals) return [];
  return signals.filter((s) => {
    const exp = Date.parse(s.expiresAt);
    return Number.isFinite(exp) ? exp > now.getTime() : true;
  });
}

export function timeSlotFromSignals(signals: ContextSignal[] | undefined, now: Date = new Date()): TimeSlot | undefined {
  const hit = activeSignals(signals, now).find((s) => s.type === "TIME_OF_DAY");
  return hit ? (hit.value as TimeSlot) : undefined;
}

/**
 * 붐비는 시간대에는 포장 가능한 메뉴를 앞에 둔다.
 *
 * 이 판단의 한계를 분명히 한다:
 *  - "빨리 나온다"고 말하지 않는다. fixture 에 조리시간 데이터가 없으므로 근거 없는 주장이다.
 *  - 말할 수 있는 것은 "앉을 자리를 기다리지 않아도 된다" 뿐이고, 그건 supportedOptions 로 확인된다.
 *  - 사용자가 이용방식을 직접 골랐으면 개입하지 않는다(선호가 맥락을 이긴다).
 */
export const CONTEXT_BONUS = 8;

export function isBusySlot(slot: TimeSlot | undefined): boolean {
  return slot === "LUNCH_PEAK" || slot === "DINNER_PEAK";
}

export function contextBonusFor(candidate: Candidate, slot: TimeSlot | undefined, serviceTypeChosen: boolean): number {
  if (serviceTypeChosen || !isBusySlot(slot)) return 0;
  const takeOut = (candidate.supportedOptions?.SERVICE_TYPE ?? []).includes("TAKE_OUT");
  return takeOut ? CONTEXT_BONUS : 0;
}
