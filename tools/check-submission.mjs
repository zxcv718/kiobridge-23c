#!/usr/bin/env node
/**
 * Public submission checker.
 *
 *   npm run check:submission -- --environment chicken-store --file ./my-submission.json
 *
 * It VALIDATES a submission you produced. It never generates one:
 *   - no candidate is chosen for you
 *   - no option is inserted
 *   - no verifier is appended
 *   - no missing action is repaired
 *   - no state transition is corrected
 *
 * A missing --file is an error, not an invitation to build a plan.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--environment" || a === "-e") out.environment = argv[++i];
    else if (a === "--file" || a === "-f") out.file = argv[++i];
    else if (a === "--execute") out.execute = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`사용법:
  npm run check:submission -- --environment <id> --file <submission.json> [--execute]

옵션:
  -e, --environment  환경 id (chicken-store | hospital | public-office | sandbox)
  -f, --file         참가팀이 만든 제출 JSON 경로
      --execute      검증 통과 시 Simulation Driver 로 재생까지 수행

이 도구는 제출물을 검증만 합니다. 추천이나 실행계획을 생성하지 않습니다.`);
  process.exit(0);
}

if (!args.file) {
  console.error("[오류] --file <submission.json> 이 필요합니다.");
  console.error("       이 도구는 제출물을 대신 생성하지 않습니다. 참가팀이 만든 파일을 지정하세요.");
  console.error("       도움말: npm run check:submission -- --help");
  process.exit(2);
}

const filePath = path.resolve(args.file);
if (!existsSync(filePath)) {
  console.error(`[오류] 파일을 찾을 수 없습니다: ${filePath}`);
  process.exit(2);
}

let submission;
try {
  submission = JSON.parse(readFileSync(filePath, "utf-8"));
} catch (err) {
  console.error(`[오류] JSON 파싱 실패: ${err.message}`);
  process.exit(2);
}

const environmentId = args.environment ?? submission.environmentId;
if (!environmentId) {
  console.error("[오류] --environment 또는 제출물의 environmentId 가 필요합니다.");
  process.exit(2);
}

// Run the check inside the workspace so TS path aliases resolve.
const runner = path.join(ROOT, "tools", "check-submission.impl.ts");
try {
  execFileSync(process.execPath, [
    path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
    runner, environmentId, filePath, args.execute ? "--execute" : "",
  ].filter(Boolean), { cwd: ROOT, stdio: "inherit" });
} catch (err) {
  process.exit(err.status ?? 1);
}
