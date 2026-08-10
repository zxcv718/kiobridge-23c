/**
 * 질문 흐름 제어 — "더 물어봐야 하는가".
 *
 * 기획(화면목록 S06~S10 «추천 신뢰도 낮을 경우 다음 질문 진행», S11 «기준보다 높을 경우
 * 즉시 추천 결과 화면으로»)의 구현이자, 그 기획이 계약을 깨지 않도록 막는 안전장치다.
 *
 * 판정을 UI 조건문에 두지 않고 여기 순수 함수로 모은 이유:
 *   조기 종료가 알레르기 질문을 건너뛰면 `hardConstraints.allergenIds` 가 UNKNOWN 이 아니라
 *   **미수집(undefined)** 이 된다. 그러면 안전 정지도 안 걸리고 스키마 검증도 통과하면서
 *   알레르기 후보 제외만 조용히 사라진다 — guide.txt §5 위반이 자동 검출 없이 통과한다.
 *   그 조건을 테스트가 지킬 수 있는 곳에 둔다. (tests/ask.test.ts)
 */
import type { Recommendation } from "@kiobridge/participant-sdk";
import type { EngineContext } from "./engine";

/**
 * 조기 종료 기준.
 *
 * 0.80 은 추측이 아니라 이 환경의 실측값이다. `computeConfidence` 는 다수 후보일 때
 * `0.6 + margin*0.35` 이고 chicken-store 후보 8개에서는 **0.82 를 넘지 못한다**
 * (0.90 은 생존 후보가 1개로 줄었을 때만 나온다). 기준을 그 위로 올리면 조기 종료는
 * 후보가 이미 하나로 좁혀진 자명한 경우에만 발동해 기능이 죽는다.
 *
 * 0.80 은 margin ≥ 0.571 — 1·2위 격차가 후보 간 점수 폭의 57% 이상일 때만 멈춘다는 뜻이다.
 * 환경이나 가중치(WEIGHTS)를 바꾸면 이 값도 다시 재야 한다. 테스트가 상한을 고정하고 있다.
 */
export const EARLY_STOP_CONFIDENCE = 0.8;

/**
 * 알레르기를 물었는가.
 *
 * UI 의 답변 상태가 아니라 **정규화된 하드제약**을 본다. 화면이 "물어봤다"고 잘못
 * 넘겨도 실제로 값이 안 들어왔으면 false 가 되도록, 판단 근거를 한 겹 아래에 둔다.
 * "알레르기 없음"(빈 배열)은 답변이고, 미수집(undefined)은 답변이 아니다.
 */
export function allergensAnswered(ctx: EngineContext): boolean {
  return ctx.hardConstraints.allergenIds !== undefined;
}

/** 후보를 실제로 갈라내는 선호 축. 수량·컵은 순위를 거의 바꾸지 않아 제외한다. */
const PREFERENCE_AXES = ["serviceType", "spicyLevel", "boneType"] as const;

/**
 * 변별력 있는 선호를 하나라도 **물어봤는가**.
 *
 * confidence 만으로 종료를 판정하면 안 되는 이유가 여기 있다. `scoreCandidates` 는 선호를
 * 말하지 않은 축에 `weight * 0.5` 중립점을 **모든 후보에 똑같이** 얹는다. 그러면 변별 축이
 * 전부 상쇄되고 가격만 남아 1·2위 격차가 점수 폭을 지배해 **confidence 가 오히려 최대(0.95)가
 * 된다**. 실측(chicken-store):
 *
 *   알레르기 땅콩·콩만 (선호 0개)      → 0.95   ← 아무것도 안 물어서 생긴 확신
 *   알레르기 땅콩·콩 + 맵기            → 0.76   ← 물어보니 오히려 내려간다
 *   알레르기 땅콩·콩 + 맵기 + 형태      → 0.82
 *
 * 즉 confidence 는 "점수 분리도"이지 "선호 파악도"가 아니다. 이 가드가 없으면 알레르기만 답한
 * 사용자에게 맵기·형태를 한 번도 묻지 않고 "매운 뼈 닭강정"을 확정한다.
 *
 * "상관없어요"도 물어본 것으로 친다 — 그건 정보가 없는 게 아니라 «양보 가능»이라는 정보다.
 * 그래서 UI 는 "상관없어요"를 지우지 않고 NO_PREFERENCE 로 넘긴다(누락 ≠ 선호 없음).
 */
export function preferenceAxisAsked(ctx: EngineContext): boolean {
  const p = ctx.preferences as Record<string, unknown>;
  return PREFERENCE_AXES.some((k) => p[k] !== undefined);
}

/** 후보를 실제로 가르지 못하는 답 — 엔진의 definite() 와 같은 기준. */
const NON_COMMITTAL = new Set(["NO_PREFERENCE", "UNKNOWN", "NOT_APPLICABLE"]);

/**
 * 후보를 실제로 **가르는** 답을 하나라도 했는가.
 *
 * "물어봤다"와 "갈랐다"는 다르다. 맵기를 "상관없어요"로 답하면 물어보긴 했지만 그 축은
 * 모든 후보에 같은 중립점을 주므로 아무것도 가르지 못한다. 그러면 다시 가격만 남아
 * confidence 가 0.95 까지 올라간다 — 앞서 막은 "안 물어서 생긴 확신"과 같은 메커니즘이
 * "상관없다고 해서 생긴 확신"으로 되살아나는 것이다.
 *
 * 실측(chicken-store): 알레르기 땅콩·콩 + 맵기 "상관없어요" → 0.95.
 * 이 상태로 멈추면 형태(뼈/순살)를 한 번도 묻지 않고 "매운 뼈 닭강정"을 확정한다.
 */
export function hasDefinitePreference(ctx: EngineContext): boolean {
  const p = ctx.preferences as Record<string, unknown>;
  return PREFERENCE_AXES.some((k) => typeof p[k] === "string" && !NON_COMMITTAL.has(p[k] as string));
}

/**
 * 변별 축을 전부 물어봤는가.
 *
 * 전부 물었는데 답이 모두 "상관없어요"라면 그건 정보가 없는 게 아니라 **양보 가능하다는
 * 정보**이고, 더 물어봐야 새로 알 것이 없다. 그때는 멈춰도 된다.
 */
export function allPreferenceAxesAsked(ctx: EngineContext): boolean {
  const p = ctx.preferences as Record<string, unknown>;
  return PREFERENCE_AXES.every((k) => p[k] !== undefined);
}

/**
 * 남은 질문을 생략하고 추천으로 넘어가도 되는가.
 *
 * 생략된 항목은 실행계획에서 후보가 지원하는 값으로 채워지며, 그 사실은 최종 확인 화면이
 * `origin=AUTO` 로 밝힌다(plan.ts `explainSelections`). 그래서 «추천 이유와 대안을
 * 설명해야» 하는 의무는 생략과 무관하게 지켜진다 — 단, 그 고지를 끄면 이 전제가 무너진다.
 */
/** 재확인을 몇 번까지 시도하는가 — 화면목록 S12 «재확인 질문 2회째도 확정 안 됨». */
export const MAX_RECONFIRM_ATTEMPTS = 2;

/**
 * 확정되지 않은 추천인가 — 재확인이 걸렸거나, 조건에 맞는 후보가 아예 없거나.
 * 화면목록 S12 가 두 경우를 같은 종착지로 묶는다.
 */
export function isUnresolved(rec: Recommendation): boolean {
  return rec.requiresReconfirmation || rec.recommendedCandidateId === null;
}

/**
 * 안전 중단으로 보내야 하는가 (화면목록 S12).
 *
 * 첫 번째 미확정에서 바로 막다른 길로 보내지 않는다 — 그건 «막다른 길을 만들지 않는다»는
 * 원칙과 충돌한다. 조건을 고쳐 다시 시도할 기회를 한 번 주고, 그러고도 확정되지 않으면 멈춘다.
 *
 * 멈춘 상태에서는 아무 준비도 시작되지 않는다 — 승인이 없으므로 buildExecutionPlanCore 가
 * 빈 actions 를 돌려주고, 그건 이 함수와 무관하게 계약으로 이미 보장된다.
 */
export function shouldSafetyStop(rec: Recommendation, attempts: number): boolean {
  return isUnresolved(rec) && attempts >= MAX_RECONFIRM_ATTEMPTS;
}

export function canStopAsking(rec: Recommendation, ctx: EngineContext): boolean {
  if (!allergensAnswered(ctx)) return false;    // 하드제약 미확인 상태로는 절대 확정하지 않는다
  // 후보를 가르는 답이 하나도 없으면, 남은 축을 전부 물어보기 전에는 끝내지 않는다.
  // (안 물어서 생긴 확신 · 상관없다고 해서 생긴 확신 — 둘 다 여기서 막힌다)
  if (!hasDefinitePreference(ctx) && !allPreferenceAxesAsked(ctx)) return false;
  if (rec.requiresReconfirmation) return false; // 재확인이 걸린 추천으로 흐름을 끝내지 않는다
  return (rec.confidence ?? 0) >= EARLY_STOP_CONFIDENCE;
}
