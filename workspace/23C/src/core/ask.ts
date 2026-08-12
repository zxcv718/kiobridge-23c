/**
 * 질문 흐름 제어.
 *
 * **질문은 6개 고정이다. 시스템이 먼저 끝내지 않는다.**
 *
 * 한때 "추천 신뢰도가 충분하면 남은 질문을 생략한다"를 넣었다가 걷어냈다. 이유는
 * 전제가 틀렸기 때문이다 — confidence 가 재는 것은 «1위 메뉴가 더 안 바뀐다»이지
 * «남은 질문이 무의미하다»가 아니다. 실제로 남은 질문은 하나도 무의미하지 않다:
 *
 *   맵기·형태   필수 옵션 그룹이라, 안 물으면 그 메뉴의 값으로 대신 선택된다
 *   이용방식    select_service 액션이 supported[0](매장)로 확정된다
 *   수량        Q1 으로 확정된다 (게다가 수량은 WEIGHTS 에 없어 confidence 에 영향조차 없다)
 *   예산        상한 없음으로 처리된다
 *
 * 즉 "불필요한 질문을 생략한다"가 아니라 "우리가 답을 대신 정한다"였다. 그것도
 * 키오스크 앞에서 이미 통제권이 가장 적은 사용자에게서. 무엇을 주문할지는 사용자가 정한다.
 *
 * **컵은 7번째 질문이었다가 빠졌다(6개가 된 경위).** 위 목록에서 컵만은 "우리가 답을
 * 대신 정한다"에 해당하지 않았다 — 안 물으면 액션 자체가 만들어지지 않으니, 대신
 * 정해지는 값이 없었다. 즉 컵은 «묻지 않으면 사용자가 잃는 것»이 없는 유일한 축이라
 * 이 원칙을 깨지 않고 뺄 수 있었다. 뺀 이유는 질문 하나를 줄이는 것 자체가 이득이기
 * 때문이다 — 키오스크 앞에 선 시간이 그만큼 짧아진다.
 *
 * 여기 남은 것은 **안전 중단 판정**뿐이다(화면목록 S12).
 */
import type { Recommendation } from "@kiobridge/participant-sdk";
import type { EngineContext } from "./engine";

/**
 * 알레르기를 물었는가.
 *
 * 질문이 고정된 지금은 순서상 늘 참이지만, 그 사실 자체를 검사 가능한 형태로 남긴다.
 * 알레르기를 건너뛴 채로 흐름이 끝나면 `hardConstraints.allergenIds` 가 UNKNOWN 이 아니라
 * **미수집**이 되고, 그러면 안전 정지도 안 걸리고 스키마 검증도 통과하면서
 * 알레르기 후보 제외만 조용히 사라진다 — guide.txt §5 위반이 자동 검출 없이 통과한다.
 * (tests/ask.test.ts «조용한 실패» 절이 그 상태를 재현해 둔다)
 *
 * UI 의 답변 상태가 아니라 정규화된 하드제약을 본다. "알레르기 없음"(빈 배열)은 답변이고,
 * 미수집(undefined)은 답변이 아니다.
 */
export function allergensAnswered(ctx: EngineContext): boolean {
  return ctx.hardConstraints.allergenIds !== undefined;
}

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
