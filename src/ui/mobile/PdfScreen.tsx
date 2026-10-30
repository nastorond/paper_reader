import { useEffect, useMemo, useRef, useState } from "react";
import { PdfViewer, type PdfViewerHandle } from "../pdf/PdfViewer";
import { loadPdf, type PDFDocumentProxy } from "../../services/pdf/pdfjs";
import { fitWidthScale, zoomIn, zoomOut } from "../../logic/pdf/zoom";
import type { BundleHighlight } from "../../logic/bundle/schema";
import type { Highlight } from "../../logic/types";

interface Props {
  pdfKey: string; // 어떤 PDF 인지(바뀌면 다시 읽는다). 번들 문서 id 또는 기기 파일 주소
  load(): Promise<Uint8Array>; // PDF 바이트 읽기(번들 원문: Drive 폴더·폰 캐시, 기기 파일: 그 파일)
  title?: string; // 위쪽 막대에 보일 이름(기기 파일)
  highlights: BundleHighlight[]; // 이 문서의 하이라이트(없으면 빈 배열)
  focusId?: string; // 처음 보여줄 하이라이트(없으면 첫 페이지)
  focusNonce?: number; // 바뀌면(이미 열린 원문으로 돌아올 때) focusId 위치로 다시 이동
  onBack(): void;
  onOpenNote(highlightId: string): void;
}

// 폰 "원문 보기": 맥과 같은 PDF 뷰어(캔버스 + 텍스트 레이어 + 하이라이트 레이어)를 읽기 전용으로 쓴다.
// 번들 원문과 기기의 PDF 파일(PDF 리더)을 같은 화면으로 연다. 하이라이트를 누르면 그 노트로 간다.
export default function PdfScreen({ pdfKey, load, title, highlights, focusId, focusNonce, onBack, onOpenNote }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  // load 는 렌더마다 새로 만들어지므로 ref 로 읽는다(pdfKey 가 바뀔 때만 다시 읽기).
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    let loadedPdf: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        const data = await loadRef.current();
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
  }, [pdfKey]);

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

  // 이미 열린 원문으로 돌아올 때(focusNonce 가 바뀜) 새 하이라이트로 이동한다.
  // 처음 열 때의 이동은 PdfViewer 의 focusHighlightId 가 한다.
  const viewerRef = useRef<PdfViewerHandle>(null);
  useEffect(() => {
    if (focusNonce === undefined) return;
    const h = hls.find((x) => x.id === focusId);
    if (h) viewerRef.current?.scrollToHighlight(h);
    // hls 가 바뀔 때(번들 새로고침)는 다시 이동하지 않는다
  }, [focusNonce]);

  return (
    <div className="pdf-screen">
      <header className="viewer-bar">
        <button onClick={onBack}>← 뒤로</button>
        <span className="viewer-read">
          {title ? `${title} · ` : ""}
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
            ref={viewerRef}
            doc={pdf}
            scale={scale}
            onPageChange={setPage}
            onZoom={setScale}
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
