#!/usr/bin/env node
/**
 * Runs `npm run dev` (API + web together) and waits for both services to answer
 * before printing the ready banner. If a service never comes up, it reports the
 * failing service, its port, the log location and what to check.
 *
 * Killing this process (Ctrl+C) terminates both children.
 */
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT, ".tmp");
const LOG_FILE = path.join(LOG_DIR, "dev.log");

const API_URL = process.env.KIOBRIDGE_API_URL ?? "http://localhost:4000";
const WEB_URL = process.env.KIOBRIDGE_WEB_URL ?? "http://localhost:3000";
const TIMEOUT_MS = Number(process.env.KIOBRIDGE_HEALTH_TIMEOUT_MS ?? 90_000);

mkdirSync(LOG_DIR, { recursive: true });
const logStream = createWriteStream(LOG_FILE, { flags: "w" });

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCmd, ["run", "dev"], {
  cwd: ROOT,
  stdio: ["inherit", "pipe", "pipe"],
  env: process.env,
  shell: process.platform === "win32",
});

const relay = (stream, sink) => {
  stream.on("data", (chunk) => {
    sink.write(chunk);
    logStream.write(chunk);
  });
};
relay(child.stdout, process.stdout);
relay(child.stderr, process.stderr);

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* already gone */ }
  }
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => { shutdown(sig); setTimeout(() => process.exit(0), 500); });
}
process.on("exit", () => shutdown("SIGTERM"));

child.on("exit", (code) => {
  logStream.end();
  process.exit(code ?? 0);
});

async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(name, url, port) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probe(url)) return true;
    if (child.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 800));
  }
  console.error(`\n[시작 실패] ${name}`);
  console.error(`  포트     : ${port}`);
  console.error(`  주소     : ${url}`);
  console.error(`  로그 위치: ${LOG_FILE}`);
  console.error("  점검 명령:");
  console.error(`    lsof -i :${port}        (Windows: netstat -ano | findstr :${port})`);
  console.error("    npm ci");
  console.error("    npm run typecheck");
  return false;
}

(async () => {
  const apiOk = await waitFor("Simulation API", `${API_URL}/health`, 4000);
  const webOk = await waitFor("Simulator Web", WEB_URL, 3000);

  if (apiOk && webOk) {
    console.log("\n================================================");
    console.log(" 준비 완료 — 브라우저에서 아래 주소를 여세요.");
    console.log(`   공식 시뮬레이터 : ${WEB_URL}`);
    console.log(`   Simulation API : ${API_URL}/health`);
    console.log(" 종료하려면 Ctrl+C 를 누르세요.");
    console.log("================================================\n");
  } else {
    console.error("\n일부 서비스가 시작되지 않았습니다. 위 안내를 확인하세요.\n");
  }
})();
