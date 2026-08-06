#!/usr/bin/env node
/**
 * Stops ONLY this project's dev processes on ports 3000 / 4000.
 *
 * Safety: before killing anything it checks that the listening process's working
 * directory (or command line) belongs to THIS project root. Unrelated processes
 * that happen to use the same ports are reported and left alone.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTS = [3000, 4000];

const sh = (cmd, args) => {
  try { return execFileSync(cmd, args, { encoding: "utf-8" }); } catch { return ""; }
};

/** PIDs listening on a port. */
function listenersOn(port) {
  if (process.platform === "win32") {
    const out = sh("netstat", ["-ano"]);
    return [...new Set(out.split(/\r?\n/)
      .filter((l) => l.includes(`:${port}`) && /LISTENING/i.test(l))
      .map((l) => l.trim().split(/\s+/).pop())
      .filter((p) => p && /^\d+$/.test(p)))];
  }
  const out = sh("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  return [...new Set(out.split(/\s+/).filter(Boolean))];
}

/** Does this PID belong to our project? */
function belongsToProject(pid) {
  if (process.platform === "win32") {
    const out = sh("wmic", ["process", "where", `ProcessId=${pid}`, "get", "CommandLine"]);
    return out.includes("kiobridge") || out.includes(path.basename(ROOT));
  }
  const cwd = sh("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"])
    .split("\n").find((l) => l.startsWith("n"))?.slice(1) ?? "";
  if (cwd && (cwd === ROOT || cwd.startsWith(ROOT + path.sep))) return true;
  const args = sh("ps", ["-o", "command=", "-p", pid]);
  return args.includes(ROOT) || args.includes(path.basename(ROOT));
}

let stopped = 0;
let skipped = 0;

for (const port of PORTS) {
  for (const pid of listenersOn(port)) {
    if (!belongsToProject(pid)) {
      console.log(`[건너뜀] 포트 ${port} PID ${pid} — 이 프로젝트의 프로세스가 아닙니다.`);
      skipped += 1;
      continue;
    }
    try {
      if (process.platform === "win32") sh("taskkill", ["/PID", pid, "/T", "/F"]);
      else process.kill(Number(pid), "SIGTERM");
      console.log(`[종료] 포트 ${port} PID ${pid}`);
      stopped += 1;
    } catch (err) {
      console.error(`[실패] PID ${pid}: ${err.message}`);
    }
  }
}

console.log(stopped === 0 && skipped === 0
  ? "실행 중인 KioBridge 개발 서버가 없습니다."
  : `종료 ${stopped}건, 건너뜀 ${skipped}건.`);
