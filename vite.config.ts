import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import process from "node:process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// 런타임에 불러오는 라이브러리 정적 리소스. 외부 CDN 대신 앱에 포함한다.
// 개발 중에는 Vite 가 /node_modules/... 경로를 그대로 서빙하고, 빌드 시에는 dist/ 아래로 복사한다.
// - pdf.js: CJK cmap, 표준 폰트, wasm 디코더 → dist/pdfjs/ (src/pdf/pdfjs.ts 의 PDFJS_ASSET_BASE)
// - Excalidraw: 손글씨 등 글꼴 → dist/excalidraw/fonts/ (src/note/BoardEditor.tsx 의 EXCALIDRAW_ASSET_PATH)
const COPIED_ASSETS: [from: string, to: string][] = [
  ...["cmaps", "standard_fonts", "wasm", "iccs"].map((d): [string, string] => [`pdfjs-dist/${d}`, `pdfjs/${d}`]),
  ["@excalidraw/excalidraw/dist/prod/fonts", "excalidraw/fonts"],
];

function copyLibraryAssets(): Plugin {
  let root = process.cwd();
  let outDir = "dist";
  return {
    name: "copy-library-assets",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const [from, to] of COPIED_ASSETS) {
        cpSync(resolve(root, "node_modules", from), resolve(outDir, to), { recursive: true });
      }
    },
  };
}

// 개발 전용: 웹뷰에서 POST /__devlog 로 보낸 로그를 터미널에 찍는다(src/dev/devLog.ts).
// Tauri 웹뷰 콘솔은 터미널에 안 보여서, 오류·진단 정보를 확인하려고 둔다.
function devLogEndpoint(): Plugin {
  return {
    name: "dev-log-endpoint",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__devlog", (req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          console.log(`[webview] ${body}`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

// 개발 전용: 노트 내보내기 자가 테스트. 저장 창 없이 .dev-data/export/ 에 쓴다(프로젝트 밖에는 쓰지 않음).
function devExportEndpoint(): Plugin {
  return {
    name: "dev-export-endpoint",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__devexport", (req, res) => {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "export.md";
        const dir = resolve(server.config.root, ".dev-data/export");
        const file = resolve(dir, basename(name));
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          mkdirSync(dir, { recursive: true });
          writeFileSync(file, body);
          console.log(`[webview] dev export written: ${file}`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), copyLibraryAssets(), devLogEndpoint(), devExportEndpoint()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**", "**/.dev-data/**"],
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
