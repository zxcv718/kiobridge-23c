/**
 * 팀 23C 테스트 설정 — 루트 설정의 alias를 재사용하고 include만 팀 폴더로 좁힌다.
 * 실행: npx vitest run -c workspace/23C/vitest.config.ts
 */
import { defineConfig, type UserConfig } from "vitest/config";
import base from "../../vitest.config";

const b = base as UserConfig;

export default defineConfig({
  resolve: b.resolve,
  test: {
    ...b.test,
    include: ["workspace/23C/tests/**/*.test.ts"],
    exclude: ["node_modules"],
  },
});
