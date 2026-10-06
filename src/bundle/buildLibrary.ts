import type { DocumentRecord, Highlight, Note } from "../store/types";
import { tiptapToHtml } from "../export/tiptapToHtml";
import { BUNDLE_SCHEMA_VERSION, boardSvgPath, pdfPath, type BundleLibrary } from "./schema";

// DB 내용 → library.json. 보드 SVG 렌더링은 DOM 이 필요해 따로 하고(exportBundle.ts),
// 여기서는 SVG 가 있는 하이라이트 id 목록만 받는다.
export function buildLibrary(
  documents: DocumentRecord[],
  highlights: Highlight[],
  notes: Note[],
  boardIds: Set<string>,
  exportedAt: string,
  // PDF 원문을 함께 올린 문서 id (없으면 빈 집합)
  pdfIds: Set<string> = new Set(),
): BundleLibrary {
  const noteById = new Map(notes.map((n) => [n.highlightId, n]));
  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    app: "PaperBoard",
    exportedAt,
    documents: documents.map((d) => ({
      id: d.id,
      title: d.title,
      fileName: d.path.split(/[\\/]/).pop() ?? d.path,
      addedAt: d.addedAt,
      lastOpenedAt: d.lastOpenedAt,
      pdf: pdfIds.has(d.id) ? pdfPath(d.id) : null,
    })),
    highlights: highlights.map((h) => {
      const note = noteById.get(h.id);
      const html = note?.body ? tiptapToHtml(note.body) : "";
      return {
        id: h.id,
        documentId: h.documentId,
        pageIndex: h.pageIndex,
        text: h.text,
        prefix: h.prefix,
        suffix: h.suffix,
        color: h.color,
        createdAt: h.createdAt,
        note: note && note.body ? { html, json: note.body, updatedAt: note.updatedAt } : null,
        boardSvg: boardIds.has(h.id) ? boardSvgPath(h.id) : null,
        rects: h.rects,
      };
    }),
  };
}

// 보드에 지워지지 않은 요소가 하나라도 있으면 SVG 로 내보낸다.
export function boardHasContent(board: unknown): boolean {
  const els = (board as { elements?: { isDeleted?: boolean }[] } | null)?.elements;
  return !!els && els.some((e) => !e.isDeleted);
}
