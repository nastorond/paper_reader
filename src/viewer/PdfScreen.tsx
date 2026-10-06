import { useEffect, useMemo, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { PdfViewer } from "../pdf/PdfViewer";
import { loadPdf, type PDFDocumentProxy } from "../pdf/pdfjs";
import { fitWidthScale, zoomIn, zoomOut } from "../pdf/zoom";
import type { BundleDocument, BundleHighlight } from "../bundle/schema";
import type { Highlight } from "../store/types";
import { loadCachedPdf, saveCachedPdf } from "./cache";

interface Props {
  document: BundleDocument;
  highlights: BundleHighlight[]; // 이 문서의 하이라이트
  focusId?: string; // 처음 보여줄 하이라이트(없으면 첫 페이지)
  pdfUri: string | undefined; // 폴더의 pdfs/<id>.pdf 주소(없으면 캐시만 시도)
  onBack(): void;
  onOpenNote(highlightId: string): void;
}

// 폰 "원문 보기": 맥과 같은 PDF 뷰어(캔버스 + 텍스트 레이어 + 하이라이트 레이어)를 읽기 전용으로 쓴다.
// 한 번 연 PDF 는 폰에 저장해 두고(오프라인), 하이라이트를 누르면 그 노트로 간다.
export default function PdfScreen({ document: doc, highlights, focusId, pdfUri, onBack, onOpenNote }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loadedPdf: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        let data = await loadCachedPdf(doc.id).catch(() => null);
        if (!data) {
          if (!pdfUri) throw new Error("폴더에 이 논문의 PDF 가 없습니다. 맥에서 \"PDF 원문도 함께 올리기\"를 켜고 내보내 주세요.");
          data = await readFile(pdfUri);
          await saveCachedPdf(doc.id, data);
        }
        // loadPdf 는 데이터를 워커로 넘기므로(transfer) 캐시에 넣은 뒤 사본을 넘긴다.
        const p = await loadPdf(data.slice());
        if (cancelled) return void p.loadingTask.destroy();
        loadedPdf = p;
        const first = await p.getPage(1);
        setScale(fitWidthScale(window.innerWidth, first.getViewport({ scale: 1 }).width, 16));
        setPdf(p);
      } catch (e) {
        console.error("pdf open failed", e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      void loadedPdf?.loadingTask.destroy();
    };
  }, [doc.id, pdfUri]);

  // 번들 하이라이트 → 뷰어가 쓰는 Highlight 모양
  const hls = useMemo<Highlight[]>(
    () =>
      highlights
        .filter((h) => h.rects && h.rects.length > 0)
        .map((h) => ({
          id: h.id,
          documentId: h.documentId,
          pageIndex: h.pageIndex,
          rects: h.rects!,
          text: h.text,
          prefix: h.prefix,
          suffix: h.suffix,
          color: h.color,
          createdAt: h.createdAt,
        })),
    [highlights],
  );

  return (
    <div className="pdf-screen">
      <header className="viewer-bar">
        <button onClick={onBack}>← 뒤로</button>
        <span className="viewer-read">
          {pdf ? `${page + 1} / ${pdf.numPages}` : ""}
        </span>
        <button disabled={!scale} onClick={() => setScale((s) => (s ? zoomOut(s) : s))}>
          −
        </button>
        <button disabled={!scale} onClick={() => setScale((s) => (s ? zoomIn(s) : s))}>
          +
        </button>
      </header>
      <div className="pdf-screen-body">
        {error ? (
          <div className="viewer-message">{error}</div>
        ) : pdf && scale ? (
          <PdfViewer
            doc={pdf}
            scale={scale}
            onPageChange={setPage}
            highlights={hls}
            selectedHighlightId={focusId ?? null}
            focusHighlightId={focusId}
            onHighlightClick={(id) => id && onOpenNote(id)}
          />
        ) : (
          <div className="viewer-empty">원문 불러오는 중…</div>
        )}
      </div>
    </div>
  );
}
