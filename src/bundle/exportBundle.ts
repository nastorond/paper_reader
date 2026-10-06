import { join } from "@tauri-apps/api/path";
import { exists, mkdir, readFile, rename, writeFile } from "@tauri-apps/plugin-fs";
import { sha256Hex } from "../file/hash";
import { getDb } from "../store/tauriDb";
import { listLibrary } from "../store/db";
import { boardHasContent, buildLibrary } from "./buildLibrary";
import { writeBundle } from "./bundleZip";
import { BUNDLE_FILE_NAME, PDF_DIR, boardSvgPath } from "./schema";
import type { DocumentRecord } from "../store/types";

export interface BundleExportResult {
  path: string;
  bytes: number;
  highlights: number;
  boards: number;
  pdfsCopied: number; // 이번에 새로 복사한 PDF
  pdfsMissing: string[]; // 원본을 찾지 못했거나 내용이 바뀐 문서 제목
}

// 라이브러리 전체를 dir/paperboard-library.zip 으로 쓴다.
// 임시 파일에 다 쓴 뒤 이름을 바꿔서, Drive 동기화가 반쯤 쓰인 파일을 올리지 않게 한다.
export async function exportBundleTo(dir: string, includePdfs = false): Promise<BundleExportResult> {
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

  // PDF 원문: 하이라이트가 있는 문서만, 폴더에 아직 없을 때 한 번 복사
  const pdf = includePdfs
    ? await copyPdfs(dir, lib.documents.filter((d) => lib.highlights.some((h) => h.documentId === d.id)))
    : { present: new Set<string>(), copied: 0, missing: [] as string[] };

  const library = buildLibrary(
    lib.documents,
    lib.highlights,
    lib.notes,
    new Set(withBoard.map((n) => n.highlightId)),
    new Date().toISOString(),
    pdf.present,
  );
  const zip = writeBundle(library, boards);
  const target = await join(dir, BUNDLE_FILE_NAME);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, zip);
  await rename(tmp, target);
  return {
    path: target,
    bytes: zip.byteLength,
    highlights: library.highlights.length,
    boards: boards.size,
    pdfsCopied: pdf.copied,
    pdfsMissing: pdf.missing,
  };
}

// dir/pdfs/<문서 id>.pdf 로 복사. 이미 있으면 건너뛴다(내용 해시가 이름이라 바뀔 일이 없다).
// 원본 경로의 파일 내용이 문서 id(해시)와 다르면 다른 파일이므로 복사하지 않는다.
async function copyPdfs(dir: string, docs: DocumentRecord[]) {
  const present = new Set<string>();
  const missing: string[] = [];
  let copied = 0;
  const pdfDir = await join(dir, PDF_DIR);
  for (const d of docs) {
    const dest = await join(pdfDir, `${d.id}.pdf`);
    if (await exists(dest)) {
      present.add(d.id);
      continue;
    }
    try {
      if (!(await exists(d.path))) throw new Error("not found");
      const data = await readFile(d.path);
      if ((await sha256Hex(data)) !== d.id) throw new Error("content changed");
      await mkdir(pdfDir, { recursive: true });
      await writeFile(dest, data);
      present.add(d.id);
      copied++;
    } catch (e) {
      console.warn("pdf copy skipped", d.title, e);
      missing.push(d.title);
    }
  }
  return { present, copied, missing };
}
