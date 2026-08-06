import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { EVALUATED_ENVIRONMENTS, REPO_ROOT, loadEnvironmentPack } from "../../shared";

const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf-8");
const STARTER = "examples/minimal-participant-client/src";

/** The nine functions the participant must implement — all must stay stubs. */
const PARTICIPANT_FUNCTIONS = [
  "collectProfile", "mapToCanonicalInput", "createSessionContext",
  "filterCandidates", "recommend", "explainRecommendation",
  "buildAlternatives", "collectUserDecision", "buildExecutionPlan",
];

describe("Participant Starter — 참가팀 몫은 전부 TODO 로 남는다", () => {
  const src = read(`${STARTER}/participant.ts`);

  for (const fn of PARTICIPANT_FUNCTIONS) {
    it(`${fn}() 가 존재하고 미구현 상태다`, () => {
      expect(src, `${fn} 선언`).toMatch(new RegExp(`function ${fn}\\b`));
      const body = src.slice(src.indexOf(`function ${fn}`));
      const end = body.indexOf("\n}");
      expect(body.slice(0, end), `${fn} 본문`).toMatch(new RegExp(`todo\\("${fn}"`));
    });
  }

  it("Starter 에 추천 가중치나 점수 계산이 없다", () => {
    expect(src).not.toMatch(/weight|score\s*[+*]=|sort\(\(/i);
  });

  it("Starter 에 공식 환경의 후보 ID 가 하드코딩되어 있지 않다", () => {
    const all = readdirSync(path.join(REPO_ROOT, STARTER))
      .map((f) => read(`${STARTER}/${f}`)).join("\n");
    for (const env of EVALUATED_ENVIRONMENTS) {
      for (const c of loadEnvironmentPack(env).candidates) {
        expect(all, `${env}/${c.candidateId}`).not.toContain(c.candidateId);
      }
    }
  });

  it("RUN_EXAMPLE 정적 예제는 sandbox 로 제한된다", () => {
    const idx = read(`${STARTER}/index.ts`);
    expect(idx).toMatch(/sandbox 에서만 쓸 수 있습니다/);
    expect(idx).not.toMatch(/\$\{envId\}\.json|chicken-store\.json/);
  });

  it("연결 코드(세션·제출·검증·실행·Evidence)는 실제로 구현되어 있다", () => {
    const idx = read(`${STARTER}/index.ts`);
    for (const call of ["client.fixture", "client.createSession", "client.submit", "client.validate", "client.execute", "client.getEvidence"]) {
      expect(idx, call).toContain(call);
    }
    // 연결 코드 자체에는 미구현 표시가 없어야 한다 (TODO 는 participant.ts 에만).
    expect(idx).not.toMatch(/TODO\(참가팀\)|NOT_IMPLEMENTED:/);
  });

  it("검증 실패를 대신 고쳐주지 않는다고 명시한다", () => {
    expect(read(`${STARTER}/index.ts`)).toMatch(/대신 고치지 않습니다/);
  });

  it("PASS 범위를 계약 검증으로 한정해 출력한다", () => {
    const idx = read(`${STARTER}/index.ts`);
    expect(idx).toMatch(/계약·안전·상태 전환 검증만 의미합니다/);
    expect(idx).toMatch(/추천 품질, 접근성 UX, 창의성/);
  });
});

describe("공개 트리 전체 — 공식 후보 ID 하드코딩 금지", () => {
  it("fixture 밖 어디에도 공식 환경 후보 ID 가 등장하지 않는다", () => {
    const ids = EVALUATED_ENVIRONMENTS.flatMap((e) =>
      loadEnvironmentPack(e).candidates.map((c) => [e, c.candidateId] as const));
    const skip = new Set(["node_modules", "dist", "release", ".git", ".turbo", "environments"]);
    const hits: string[] = [];

    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(ent.name)) continue;
        const fp = path.join(dir, ent.name);
        if (ent.isDirectory()) { walk(fp); continue; }
        if (!/\.(ts|tsx|mjs|js|md|json)$/.test(ent.name)) continue;
        const src = readFileSync(fp, "utf-8");
        for (const [env, id] of ids) {
          if (new RegExp(`(^|[^A-Za-z0-9-])${id}([^A-Za-z0-9-]|$)`).test(src)) {
            hits.push(`${path.relative(REPO_ROOT, fp)} <- ${id} (${env})`);
          }
        }
      }
    };
    walk(REPO_ROOT);
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

describe("공개/비공개 경계 문서", () => {
  it("docs/PRIVATE_EVALUATION_BOUNDARY.md 가 존재한다", () => {
    expect(existsSync(path.join(REPO_ROOT, "docs", "PRIVATE_EVALUATION_BOUNDARY.md"))).toBe(true);
  });

  it("경계 문서가 공개/비공개 항목을 모두 명시한다", () => {
    const d = read("docs/PRIVATE_EVALUATION_BOUNDARY.md");
    for (const kw of ["공개", "비공개", "SIMULATION_VALIDATION_ONLY", "hidden-profiles", "expected-results"]) {
      expect(d, kw).toContain(kw);
    }
  });
});
