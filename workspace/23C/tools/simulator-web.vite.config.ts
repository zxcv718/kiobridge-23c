/**
 * 공식 시뮬레이터(:3000) 실행용 설정 — 문서 바로가기 버그 우회.
 *
 * 문제: 첫 화면의 바로가기 8개 중 7개(`/docs/*.md` 등)가 문서 대신 앱을 다시 연다.
 *   apps/simulator-web/vite.config.ts 에 root/publicDir 이 없어 dev root 가
 *   apps/simulator-web/ 이 되는데, 문서는 저장소 루트의 docs/ 에 있다.
 *   없는 경로는 Vite 의 SPA fallback 이 index.html 로 흡수해 HTTP 200 을 준다.
 *
 * 해결: 플랫폼 파일은 그대로 두고(DO_NOT_EDIT), 원본 설정을 import 해서
 *   저장소 루트의 문서만 읽기 전용으로 내려주는 미들웨어를 얹는다.
 *   공식 판정은 어차피 깨끗한 키트에서 제출 JSON 을 재실행하므로 영향 없다.
 *
 * 실행: npx vite --config workspace/23C/tools/simulator-web.vite.config.ts
 */
import { defineConfig, type Plugin, type UserConfig } from "vite";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import baseConfig from "../../../apps/simulator-web/vite.config";

/** workspace/23C/tools -> 저장소 루트 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** 내려줄 수 있는 영역. 공개 문서·계약·예제만 — 소스와 node_modules 는 제외한다. */
const ALLOWED_DIRS = [
  "/docs/",
  "/participant-deliverables/",
  "/examples/",
  "/schemas/",
  "/environments/",
];
const ALLOWED_FILES = new Set([
  "/README.md",
  "/README_FIRST.md",
  "/00_START_HERE.md",
  "/PARTICIPANT_CHECKLIST.md",
  "/FINAL_SUBMISSION_CHECKLIST.md",
  "/WINDOWS_FINAL_CHECKLIST.md",
  "/DO_NOT_EDIT_PLATFORM_FILES.md",
  "/official-package-manifest.json",
]);

const MIME: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".jsonc": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * 마크다운은 그대로 내리면 브라우저가 다운로드하거나 한 줄로 뭉갠다.
 * 읽으라고 만든 링크이므로 최소한의 읽기 가능한 형태로 감싼다(변환 아님, 원문 보존).
 */
function wrapMarkdown(source: string, title: string): string {
  const escaped = source.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${title}</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;background:Canvas;color:CanvasText}
  main{max-width:100ch;margin:0 auto;padding:40px 28px}
  pre{margin:0;white-space:pre-wrap;word-break:break-word;
      font:14px/1.75 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .src{font:12px/1.6 system-ui,sans-serif;opacity:.6;margin-bottom:20px;
       padding-bottom:12px;border-bottom:1px solid color-mix(in srgb, CanvasText 20%, transparent)}
</style></head><body><main>
<div class="src">${title} · 키트 원문 (팀 23C 로컬 서빙 — 공식 시뮬레이터의 문서 링크 버그 우회)</div>
<pre>${escaped}</pre></main></body></html>`;
}

function serveKitDocs(): Plugin {
  return {
    name: "kb23c:serve-kit-docs",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let url: string;
        try {
          url = decodeURIComponent((req.url ?? "").split("?")[0]);
        } catch {
          return next();
        }
        // 정규화를 먼저 하고 그 결과로 허용 여부를 판단한다.
        // 순서를 뒤집으면 "/docs/../<루트의 아무 파일>" 이 디렉터리 제한을 우회한다.
        const full = path.resolve(ROOT, "." + url);
        if (!full.startsWith(ROOT)) return next(); // 저장소 밖 차단
        const rel = "/" + path.relative(ROOT, full).split(path.sep).join("/");
        const allowed = ALLOWED_FILES.has(rel) || ALLOWED_DIRS.some((d) => rel.startsWith(d));
        if (!allowed) return next();
        if (!existsSync(full) || !statSync(full).isFile()) return next();

        const ext = path.extname(full).toLowerCase();
        if (ext === ".md") {
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(wrapMarkdown(readFileSync(full, "utf-8"), path.basename(full)));
          return;
        }
        res.setHeader("content-type", MIME[ext] ?? "text/plain; charset=utf-8");
        createReadStream(full).pipe(res);
      });
    },
  };
}

const base = baseConfig as UserConfig;

export default defineConfig({
  ...base,
  server: {
    ...(base.server ?? {}),
    proxy: {
      ...((base.server?.proxy ?? {}) as Record<string, unknown>),
      // 키트 버그 우회 — 헤더의 "API 연결 실패" 배지가 항상 켜지는 원인.
      //   apps/simulator-web/src/api.ts 의 health() 는 `/health` 를 부르는데
      //   원본 프록시는 `/api` 만 걸려 있어 그 요청이 :4000 에 닿지 못한다.
      //   (원본: 404 → throw / 우리: SPA fallback HTML → JSON 파싱 실패 → throw. 결과는 동일)
      // 실제 기능은 전부 정상인데 배지만 빨갛게 떠서 "안 되는 것처럼" 보인다.
      "/health": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
  // 원본은 root 를 지정하지 않아 "설정 파일이 있는 디렉터리"가 root 가 된다.
  // 이 파일이 workspace/23C/tools 로 옮겨왔으므로 원래 root 를 명시해야
  // index.html 을 찾는다 (미지정 시 앱 전체가 404).
  root: fileURLToPath(new URL("../../../apps/simulator-web/", import.meta.url)),
  // 원본 플러그인(react 등)을 유지한 채 문서 서빙만 추가한다.
  plugins: [...(base.plugins ?? []), serveKitDocs()],
});
