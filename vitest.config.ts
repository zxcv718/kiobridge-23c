/**
 * `@kiobridge/*` 를 소스로 바로 물리는 별칭.
 *
 * 이 패키지들은 빌드 산출물(dist)이 없고 소스(src/index.ts)를 그대로 참조하는 방식이라
 * 별칭이 없으면 vitest 가 못 찾는다. workspace/23C/vitest.config.ts 가 이 resolve 를
 * 그대로 물려받고 include 만 좁힌다.
 *
 * 한때 키트가 주던 파일이라 아홉 개가 적혀 있었는데, 우리가 실제로 쓰는 것은 셋뿐이다
 * (참조: workspace/23C/tsconfig.json 의 paths). 저장소에서 나머지 키트를 걷어내면서
 * 쓰지 않는 별칭도 함께 지웠다 — 없는 경로를 가리키는 별칭은 «있는 줄 알았는데 없다»는
 * 오해만 남긴다.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@kiobridge/contracts": r("./packages/contracts/src/index.ts"),
      "@kiobridge/participant-sdk": r("./packages/participant-sdk/src/index.ts"),
      "@kiobridge/profile-contract": r("./packages/profile-contract/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["workspace/23C/tests/**/*.test.ts"],
    exclude: ["node_modules", "**/dist/**", "**/e2e/**"],
    reporters: ["default"],
  },
});
