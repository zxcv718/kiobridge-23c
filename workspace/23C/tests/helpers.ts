/** 테스트 헬퍼 — 서버 없이 environments/ 의 공개 데이터로 fixture를 구성한다. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PublicFixture } from "@kiobridge/participant-sdk";

const load = (rel: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../environments/chicken-store/${rel}`, import.meta.url)), "utf-8"));

export function loadChickenFixture(): PublicFixture {
  return {
    manifest: load("manifest.json"),
    candidates: load("candidates.json"),
    optionGroups: load("option-groups.json"),
    screens: load("screens.json"),
    transitions: load("transitions.json"),
    safetyRules: load("safety-rules.json"),
    compatibilityRules: load("compatibility-rules.json"),
    // 서버의 toPublicFixture 와 동일한 9개 키를 맞춘다
    reviewMapping: load("review-mapping.json"),
    simulationBinding: load("bindings/simulation.binding.json"),
  } as PublicFixture;
}

/** 상황신호·엔진 테스트가 공유하는 후보 목록 */
export const CANDIDATES = loadChickenFixture().candidates;

/** 공개 canonical 입력 예제 로더 */
export const loadPublicExample = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../examples/public-canonical-input/chicken-store/${name}.json`, import.meta.url)), "utf-8"));
