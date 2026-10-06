import { cpSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// pdf.js가 런타임에 불러오는 정적 리소스(CJK cmap, 표준 폰트, wasm 디코더).
// 개발 중에는 Vite가 /node_modules/pdfjs-dist/ 경로를 그대로 서빙하고,
// 빌드 시에는 dist/pdfjs/ 로 복사한다. (src/pdf/pdfjs.ts 의 PDFJS_ASSET_BASE 참고)
const PDFJS_ASSET_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];

function copyPdfjsAssets(): Plugin {
  let root = process.cwd();
  let outDir = "dist";
  return {
    name: "copy-pdfjs-assets",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const dir of PDFJS_ASSET_DIRS) {
        cpSync(
          resolve(root, "node_modules/pdfjs-dist", dir),
          resolve(outDir, "pdfjs", dir),
          { recursive: true },
        );
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), copyPdfjsAssets()],

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
