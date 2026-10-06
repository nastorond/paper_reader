import { join } from "@tauri-apps/api/path";
import { rename, writeFile } from "@tauri-apps/plugin-fs";
import { getDb } from "../store/tauriDb";
import { listLibrary } from "../store/db";
import { boardHasContent, buildLibrary } from "./buildLibrary";
import { writeBundle } from "./bundleZip";
import { BUNDLE_FILE_NAME, boardSvgPath } from "./schema";

export interface BundleExportResult {
  path: string;
  bytes: number;
  highlights: number;
  boards: number;
}

// 라이브러리 전체를 dir/paperboard-library.zip 으로 쓴다.
// 임시 파일에 다 쓴 뒤 이름을 바꿔서, Drive 동기화가 반쯤 쓰인 파일을 올리지 않게 한다.
export async function exportBundleTo(dir: string): Promise<BundleExportResult> {
  const db = await getDb();
  const lib = await listLibrary(db);

  // 보드 → SVG (폰에서 Excalidraw 없이 보이도록). Excalidraw 는 필요할 때만 불러온다.
  const boards = new Map<string, string>();
  const withBoard = lib.notes.filter((n) => boardHasContent(n.board));
  if (withBoard.length > 0) {
    await import("../note/excalidrawAssets");
    const { exportToSvg } = await import("@excalidraw/excalidraw");
    for (const n of withBoard) {
      const scene = n.board as { elements: { isDeleted?: boolean }[]; appState?: Record<string, unknown>; files?: unknown };
      const svg = await exportToSvg({
        elements: scene.elements.filter((e) => !e.isDeleted) as never,
        appState: { ...(scene.appState ?? {}), exportBackground: true, exportWithDarkMode: false },
        files: (scene.files ?? null) as never,
        exportPadding: 16,
      });
      boards.set(boardSvgPath(n.highlightId), svg.outerHTML);
    }
  }

  const library = buildLibrary(
    lib.documents,
    lib.highlights,
    lib.notes,
    new Set(withBoard.map((n) => n.highlightId)),
    new Date().toISOString(),
  );
  const zip = writeBundle(library, boards);
  const target = await join(dir, BUNDLE_FILE_NAME);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, zip);
  await rename(tmp, target);
  return { path: target, bytes: zip.byteLength, highlights: library.highlights.length, boards: boards.size };
}
