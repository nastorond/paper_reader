import { useCallback, useEffect, useRef, useState } from "react";
import { Toolbar } from "./Toolbar";
import { PdfViewer, type PdfViewerHandle } from "./pdf/PdfViewer";
import { loadPdf, type PDFDocumentProxy } from "./pdf/pdfjs";
import { clampZoom, fitWidthScale, zoomIn, zoomOut } from "./pdf/zoom";
import { pickPdfPath, readPdfFile } from "./file/openPdf";
import { useDropPdf } from "./file/useDropPdf";
import { sha256Hex } from "./file/hash";
import { getDb } from "./store/tauriDb";
import { insertHighlight, listHighlights, upsertDocument } from "./store/db";
import { DEFAULT_HIGHLIGHT_COLOR, type Highlight } from "./store/types";
import { devLog } from "./dev/devLog";
import "./App.css";

interface OpenDoc {
  id: string; // 내용 SHA-256
  path: string;
  title: string;
  pdf: PDFDocumentProxy;
  firstPageWidth: number;
}

export default function App() {
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [scale, setScale] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<PdfViewerHandle>(null);

  const fitWidth = useCallback((pageWidth: number) => {
    const width = mainRef.current?.clientWidth ?? 800;
    setScale(fitWidthScale(width, pageWidth));
  }, []);

  const openPath = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const file = await readPdfFile(path);
        // loadPdf 가 데이터를 워커로 넘기면(transfer) 원본 버퍼가 비므로 해시를 먼저 구한다.
        const id = await sha256Hex(file.data);
        const pdf = await loadPdf(file.data);
        const first = await pdf.getPage(1);
        const firstPageWidth = first.getViewport({ scale: 1 }).width;
        const meta = await pdf.getMetadata().catch(() => null);
        const infoTitle = (meta?.info as { Title?: string } | undefined)?.Title?.trim();
        const db = await getDb();
        const record = await upsertDocument(db, { id, path, title: infoTitle || file.name }, new Date().toISOString());
        const saved = await listHighlights(db, id);
        devLog(`opened ${record.title}: ${saved.length} highlights`);
        setDoc({ id, path, title: record.title, pdf, firstPageWidth });
        setHighlights(saved);
        setSelectedHighlightId(null);
        setPageIndex(0);
        fitWidth(firstPageWidth);
      } catch (e) {
        console.error(e);
        setError(`PDF를 열 수 없습니다: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    },
    [fitWidth],
  );

  const openDialog = useCallback(async () => {
    const path = await pickPdfPath();
    if (path) await openPath(path);
  }, [openPath]);

  // 개발 편의: VITE_DEV_OPEN_PDF 가 있으면 시작 시 자동으로 연다(프로덕션 빌드에선 제거됨).
  // StrictMode 는 개발 중 effect 를 두 번 실행하므로 한 번만 열도록 ref 로 막는다.
  const devOpenedRef = useRef(false);
  useEffect(() => {
    const devPdf = import.meta.env.DEV ? import.meta.env.VITE_DEV_OPEN_PDF : undefined;
    if (!devPdf || devOpenedRef.current) return;
    devOpenedRef.current = true;
    void openPath(devPdf);
  }, [openPath]);

  useEffect(() => {
    const raw = import.meta.env.DEV ? import.meta.env.VITE_DEV_ZOOM : undefined;
    const devZoom = raw ? Number(raw) : NaN;
    if (!doc || !Number.isFinite(devZoom)) return;
    const t = setTimeout(() => setScale(clampZoom(devZoom)), 1500);
    return () => clearTimeout(t);
  }, [doc]);

  useEffect(() => {
    const page = import.meta.env.DEV ? Number(import.meta.env.VITE_DEV_GOTO_PAGE) : NaN;
    if (!doc || !Number.isInteger(page)) return;
    const t = setTimeout(() => viewerRef.current?.scrollToPage(page - 1), 500);
    return () => clearTimeout(t);
  }, [doc]);

  const dragging = useDropPdf((path) => void openPath(path));

  const showNotice = useCallback((msg: string) => setNotice(msg), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  // 선택 영역 → 하이라이트 저장
  const createHighlight = useCallback(async () => {
    if (!doc) return;
    const result = viewerRef.current?.draftFromSelection();
    if (!result) return;
    if (!result.ok) {
      showNotice(
        result.reason === "cross-page" ? "한 페이지 안에서만 하이라이트할 수 있습니다." : "하이라이트할 문구를 먼저 선택하세요.",
      );
      return;
    }
    const h: Highlight = {
      id: crypto.randomUUID(),
      documentId: doc.id,
      ...result.draft,
      color: DEFAULT_HIGHLIGHT_COLOR,
      createdAt: new Date().toISOString(),
    };
    try {
      await insertHighlight(await getDb(), h);
    } catch (e) {
      console.error(e);
      setError(`하이라이트를 저장하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    devLog(`highlight saved p${h.pageIndex + 1} "${h.text}" rects=${JSON.stringify(h.rects)}`);
    window.getSelection()?.removeAllRanges();
    setHighlights((prev) => [...prev, h]);
    setSelectedHighlightId(h.id);
  }, [doc, showNotice]);

  // H: 하이라이트, Esc: 선택 해제 (M2 에서 노트 패널 닫기로 확장)
  // e.code 를 쓰는 이유: 한글 입력 상태에서는 e.key 가 "ㅗ" 가 된다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "KeyH") {
        e.preventDefault();
        void createHighlight();
      } else if (e.key === "Escape") {
        setSelectedHighlightId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createHighlight]);

  const goToPage = useCallback((index: number) => viewerRef.current?.scrollToPage(index), []);

  // 단축키: ⌘O 열기, ⌘= / ⌘- 확대/축소, ⌘0 폭 맞춤
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === "o") {
        e.preventDefault();
        void openDialog();
      } else if (!doc) {
        return;
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setScale(zoomIn);
      } else if (e.key === "-") {
        e.preventDefault();
        setScale(zoomOut);
      } else if (e.key === "0") {
        e.preventDefault();
        fitWidth(doc.firstPageWidth);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, openDialog, fitWidth]);

  // 다른 PDF로 바뀌거나 앱이 닫힐 때 이전 문서의 워커 자원을 해제한다.
  useEffect(() => {
    return () => void doc?.pdf.loadingTask.destroy();
  }, [doc]);

  useEffect(() => {
    document.title = doc ? `${doc.title} — PaperBoard` : "PaperBoard";
  }, [doc]);

  return (
    <div className="app">
      <Toolbar
        title={doc?.title ?? null}
        pageIndex={pageIndex}
        numPages={doc?.pdf.numPages ?? 0}
        scale={scale}
        onOpen={() => void openDialog()}
        onGoToPage={goToPage}
        onZoomIn={() => setScale(zoomIn)}
        onZoomOut={() => setScale(zoomOut)}
        onFitWidth={() => doc && fitWidth(doc.firstPageWidth)}
        onHighlight={() => void createHighlight()}
      />
      <main className="main" ref={mainRef}>
        {doc ? (
          <PdfViewer
            ref={viewerRef}
            doc={doc.pdf}
            scale={scale}
            onPageChange={setPageIndex}
            highlights={highlights}
            selectedHighlightId={selectedHighlightId}
            onHighlightClick={setSelectedHighlightId}
          />
        ) : (
          <div className="empty">
            <p>PDF 파일을 열거나 이 창에 끌어다 놓으세요.</p>
            <button onClick={() => void openDialog()}>PDF 열기</button>
          </div>
        )}
        {loading && <div className="status">불러오는 중…</div>}
        {notice && !loading && <div className="status">{notice}</div>}
        {error && (
          <div className="status error" onClick={() => setError(null)}>
            {error}
          </div>
        )}
        {dragging && <div className="drop-overlay">여기에 놓아서 열기</div>}
      </main>
    </div>
  );
}
