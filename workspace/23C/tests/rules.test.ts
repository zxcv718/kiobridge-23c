/**
 * 키트가 규칙을 바꾸면 **먼저 알려주는** 검사.
 *
 * 우리 엔진은 `compatibility-rules.json` 을 읽지 않는다. 데이터로 번들에 싣기만 하고
 * 규칙은 `src/core/engine.ts` 와 `src/core/plan.ts` 가 독립적으로 구현한다 — 참가팀이
 * 자기 추천 로직을 만드는 구조라 그게 맞다. 다만 그 대가로 **키트가 규칙을 추가해도
 * 우리 엔진은 따라가지 않고, 아무것도 그 어긋남을 알려주지 않는다.**
 *
 * 실제로 v5.1.6 RC5 가 chicken-store 에 규칙 둘을 더했다(BONE_TYPE / CUP_OPTION 선호를
 * 후보 단계에서도 보게 됨). 이번에는 우리가 이미 같은 판단을 하고 있어 통과했지만,
 * 그건 운이지 설계가 아니었다.
 *
 * 그래서 규칙 목록을 여기 못 박는다. 키트가 규칙을 더하거나 빼면 이 검사가 실패하고,
 * 그때 사람이 «우리는 이것을 어떻게 다루는가» 를 정해 아래 표에 적는다. 표를 고치는
 * 것이 곧 «검토했다» 는 기록이 된다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rulesPath = fileURLToPath(
  new URL("../../../environments/chicken-store/compatibility-rules.json", import.meta.url),
);

/**
 * 우리가 확인한 규칙과 우리 처리.
 *
 * `제외` 는 후보를 아예 뺀다는 뜻이고, `감점` 은 순위만 낮춘다는 뜻이다.
 * **BLOCK 을 감점으로 다루면 안 된다** — 계약을 어긴 계획이 만들어진다.
 * 반대로 WARN 을 제외로 다루는 것은 허용된다. 우리가 더 엄격한 쪽이고, 실제로 그렇게
 * 하는 자리가 있다: 포장을 지원하지 않는 메뉴를 «포장하겠다» 는 분께 권할 수는 없다.
 */
const 확인한규칙: Record<string, { 처리: "제외" | "감점" | "계획이지킴"; 어디: string }> = {
  CHICKEN_ALLERGEN_HARD_CONSTRAINT: { 처리: "제외", 어디: "engine.ts filterCandidatesCore — 점수를 깎지 않고 후보에서 뺀다" },
  CHICKEN_PRICE_LIMIT: { 처리: "제외", 어디: "engine.ts filterCandidatesCore — 예산 초과" },
  CHICKEN_SERVICE_TYPE_PREFERENCE: { 처리: "제외", 어디: "engine.ts:87 — 키트는 WARN 이지만 우리는 뺀다(못 하는 일을 권하지 않는다)" },
  CHICKEN_SPICY_LEVEL_PREFERENCE: { 처리: "감점", 어디: "engine.ts matchScore(spicy)" },
  CHICKEN_BONE_TYPE_PREFERENCE: { 처리: "감점", 어디: "engine.ts matchScore(bone) · 대체 시 SUBSTITUTED 표시 (RC5 추가)" },
  /* 컵 질문을 뺐다(ui/src/model.ts QUESTIONS) — 화면에서 컵 선호를 말할 길이 없어
     점수로 다룰 것도 없어졌다(engine.ts WEIGHTS 에서 제거). 코어는 여전히 이 필드를
     읽을 수 있어(canonical.ts) CLI raw input 으로 들어오면 실행계획이 존중하고,
     못 맞추면 대체를 밝힌다. 그래서 «감점»이 아니라 «계획이지킴»이다. */
  CHICKEN_CUP_OPTION_PREFERENCE: { 처리: "계획이지킴", 어디: "plan.ts 옵션 선택 + 대체 안내 — 화면은 묻지 않는다" },
  CHICKEN_SELECTED_SERVICE_TYPE: { 처리: "계획이지킴", 어디: "plan.ts select_service" },
  CHICKEN_SELECTED_SPICY_LEVEL: { 처리: "계획이지킴", 어디: "plan.ts 옵션 선택" },
  CHICKEN_SELECTED_BONE_TYPE: { 처리: "계획이지킴", 어디: "plan.ts 옵션 선택" },
  CHICKEN_SELECTED_CUP_OPTION: { 처리: "계획이지킴", 어디: "plan.ts 옵션 선택" },
  CHICKEN_SELECTED_QUANTITY: { 처리: "계획이지킴", 어디: "plan.ts — BLOCK 이라 요청 수량을 그대로 쓴다" },
};

describe("환경 호환성 규칙", () => {
  const raw = JSON.parse(readFileSync(rulesPath, "utf8")) as {
    rules: { ruleId: string; severity?: string; evaluationScope?: string }[];
  };

  it("파일을 실제로 읽고 있다", () => {
    expect(raw.rules.length, "규칙을 하나도 못 읽었습니다 — 경로가 바뀌었을 수 있습니다")
      .toBeGreaterThan(5);
  });

  it("키트의 규칙 목록이 우리가 검토한 것과 같다", () => {
    const 키트 = new Set(raw.rules.map((r) => r.ruleId));
    const 우리 = new Set(Object.keys(확인한규칙));

    const 새로생김 = [...키트].filter((r) => !우리.has(r));
    expect(새로생김,
      `키트에 규칙이 생겼습니다: ${새로생김.join(", ")}\n` +
      "  → engine.ts / plan.ts 가 이것을 어떻게 다루는지 정하고 이 파일의 표에 적으세요.\n" +
      "     BLOCK 이면 반드시 막아야 하고, WARN 이면 감점·표시로 충분합니다(더 엄격해도 됩니다).",
    ).toEqual([]);

    const 사라짐 = [...우리].filter((r) => !키트.has(r));
    expect(사라짐,
      `우리 표에는 있는데 키트에는 없는 규칙: ${사라짐.join(", ")} — 표에서 지우세요`,
    ).toEqual([]);
  });

  it("BLOCK 규칙을 감점으로 다루지 않는다", () => {
    /* 비대칭이 요점이다. WARN 을 제외로 다루는 것은 우리가 더 엄격한 것이라 괜찮지만,
       BLOCK 을 감점으로만 다루면 계약을 어긴 계획이 만들어진다. 한 방향만 막는다. */
    const 느슨한것 = raw.rules
      .filter((r) => r.severity === "BLOCK")
      .filter((r) => 확인한규칙[r.ruleId]?.처리 === "감점")
      .map((r) => `${r.ruleId} (${확인한규칙[r.ruleId].어디})`);
    expect(느슨한것,
      `BLOCK 인데 감점으로만 다루고 있습니다:\n  ${느슨한것.join("\n  ")}`,
    ).toEqual([]);
  });

  it("실행계획 단계 규칙은 계획이 지킨다고 적혀 있다", () => {
    const 어긋남 = raw.rules
      .filter((r) => r.evaluationScope === "EXECUTION_CHOICE")
      .filter((r) => 확인한규칙[r.ruleId]?.처리 !== "계획이지킴")
      .map((r) => r.ruleId);
    expect(어긋남,
      `실행계획 단계 규칙인데 후보 단계 처리로 적혀 있습니다: ${어긋남.join(", ")}`,
    ).toEqual([]);
  });
});
