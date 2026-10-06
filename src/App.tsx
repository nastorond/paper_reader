import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { Toolbar } from "./Toolbar";
import { PdfViewer, type PdfViewerHandle } from "./pdf/PdfViewer";
import { loadPdf, type PDFDocumentProxy } from "./pdf/pdfjs";
import { clampZoom, fitWidthScale, zoomIn, zoomOut } from "./pdf/zoom";
import { pickPdfPath, readImageFile, readPdfFile } from "./file/openPdf";
import { useFileDrop } from "./file/useFileDrop";
import { dropFilesOnBoard } from "./note/boardDrop";
import { sha256Hex } from "./file/hash";
import { getDb } from "./store/tauriDb";
import {
  deleteHighlight,
  insertHighlight,
  listHighlights,
  listRecentDocuments,
  updateHighlightColor,
  upsertDocument,
  type RecentDocument,
} from "./store/db";
import { DEFAULT_HIGHLIGHT_COLOR, type Highlight } from "./store/types";
import { devLog } from "./dev/devLog";
import { NotePanel, type NoteTab } from "./note/NotePanel";
import { HighlightList } from "./sidebar/HighlightList";
import { readingOrder } from "./sidebar/order";
import { RecentList } from "./recent/RecentList";
import { buildNotesMarkdown, exportNotesToFile } from "./export/exportNotes";
import { safeFileName } from "./export/notesMarkdown";
import { useBundleExport } from "./bundle/useBundleExport";
import { BundlePanel } from "./bundle/BundlePanel";
import { notifyLibraryChanged } from "./bundle/libraryEvents";
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
  // 방금 만든 하이라이트면 노트 편집기에 바로 포커스(핵심 흐름 3번)
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  // 노트/보드 탭. 다른 하이라이트로 바꿔도 마지막 탭을 유지한다.
  const [noteTab, setNoteTab] = useState<NoteTab>(
    import.meta.env.DEV && import.meta.env.VITE_DEV_OPEN_BOARD ? "board" : "note",
  );
  const [listOpen, setListOpen] = useState(true);
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);
  const bundle = useBundleExport();
  // 개발 자가 테스트: 번들 폴더가 정해지면 한 번 바로 내보낸다
  const devBundleDone = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || !import.meta.env.VITE_DEV_BUNDLE_DIR || !bundle.state.dir || devBundleDone.current) return;
    devBundleDone.current = true;
    void bundle.exportNow();
  }, [bundle]);

  const refreshRecent = useCallback(async () => {
    try {
      const docs = await listRecentDocuments(await getDb());
      setRecentDocs(docs);
      devLog(`recent: ${docs.map((d) => `${d.title}(${d.highlightCount})`).join(", ")}`);
    } catch (e) {
      console.error(e);
    }
  }, []);
  useEffect(() => void refreshRecent(), [refreshRecent]);
  const orderedHighlights = useMemo(() => readingOrder(highlights), [highlights]);
  const selectedHighlight = highlights.find((h) => h.id === selectedHighlightId) ?? null;
  const mainRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<PdfViewerHandle>(null);

  const fitWidth = useCallback((pageWidth: number) => {
    const width = mainRef.current?.clientWidth ?? 800;
    setScale(fitWidthScale(width, pageWidth));
  }, []);

  // expectId: 최근 문서를 다른 위치에서 다시 고른 경우, 원래 문서와 같은 파일인지(내용 해시) 확인한다.
  const openPath = useCallback(
    async (path: string, expectId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const file = await readPdfFile(path);
        // loadPdf 가 데이터를 워커로 넘기면(transfer) 원본 버퍼가 비므로 해시를 먼저 구한다.
        const id = await sha256Hex(file.data);
        if (expectId && id !== expectId) {
          setNotice("고른 파일이 원래 문서와 내용이 달라 새 문서로 열었습니다.");
        }
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
        setRecentOpen(false);
        void refreshRecent();
        fitWidth(firstPageWidth);
      } catch (e) {
        console.error(e);
        setError(`PDF를 열 수 없습니다: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    },
    [fitWidth, refreshRecent],
  );

  // 최근 문서 열기. 파일이 옮겨졌거나 지워졌으면 다시 고르게 하고, 내용 해시로 같은 문서인지 확인한다.
  const openRecent = useCallback(
    async (d: RecentDocument) => {
      setRecentOpen(false);
      const found = await exists(d.path).catch(() => false);
      if (found) return openPath(d.path);
      const again = await confirm(`파일을 찾을 수 없습니다.\n${d.path}\n\n옮긴 위치에서 다시 고를까요?`, {
        title: d.title,
        kind: "warning",
        okLabel: "다시 고르기",
        cancelLabel: "취소",
      });
      if (!again) return;
      const path = await pickPdfPath();
      if (path) await openPath(path, d.id);
    },
    [openPath],
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
    if (!import.meta.env.DEV || !import.meta.env.VITE_DEV_OPEN_NOTE || !doc || highlights.length === 0) return;
    const t = setTimeout(() => setSelectedHighlightId((cur) => cur ?? highlights[0].id), 800);
    return () => clearTimeout(t);
  }, [doc, highlights]);

  // 개발 자가 테스트: 보드에 이미지 넣기(드롭 경로 또는 붙여넣기 경로)
  useEffect(() => {
    const path = import.meta.env.DEV ? import.meta.env.VITE_DEV_BOARD_IMAGE : undefined;
    if (!path || noteTab !== "board" || !selectedHighlightId) return;
    const t = setTimeout(async () => {
      const host = document.querySelector(".board-host canvas.interactive") ?? document.querySelector(".board-host");
      if (!host) return devLog("dev board image: board not found");
      const r = host.getBoundingClientRect();
      const file = await readImageFile(path);
      if (import.meta.env.VITE_DEV_BOARD_IMAGE_MODE === "paste") {
        // 실제 사용처럼: 보드에 포커스, 마우스가 캔버스 위에 있는 상태에서 붙여넣기
        document.querySelector<HTMLElement>(".board-host .excalidraw")?.focus();
        const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true };
        host.dispatchEvent(new PointerEvent("pointermove", at));
        const dt = new DataTransfer();
        dt.items.add(file);
        document.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
        devLog("dev board image: pasted");
      } else {
        devLog(`dev board image: dropped=${dropFilesOnBoard([file], r.left + r.width / 2, r.top + r.height / 2)}`);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [noteTab, selectedHighlightId]);

  useEffect(() => {
    const page = import.meta.env.DEV ? Number(import.meta.env.VITE_DEV_GOTO_PAGE) : NaN;
    if (!doc || !Number.isInteger(page)) return;
    const t = setTimeout(() => viewerRef.current?.scrollToPage(page - 1), 500);
    return () => clearTimeout(t);
  }, [doc]);

  const dragTarget = useFileDrop({
    onPdf: (path) => void openPath(path),
    onImages: (paths, x, y) => {
      Promise.all(paths.map(readImageFile))
        .then((files) => dropFilesOnBoard(files, x, y))
        .catch((e) => {
          console.error(e);
          setError(`이미지를 읽을 수 없습니다: ${e instanceof Error ? e.message : String(e)}`);
        });
    },
  });

  const exportMarkdown = useCallback(async () => {
    if (!doc) return;
    try {
      const saved = await exportNotesToFile(doc, readingOrder(highlights));
      if (saved) setNotice(`내보냈습니다: ${saved}`);
    } catch (e) {
      console.error(e);
      setError(`내보내지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [doc, highlights]);

  // 개발 자가 테스트: 저장 창 없이 마크다운을 만들어 개발 서버가 .dev-data/export/ 에 쓰게 한다.
  useEffect(() => {
    if (!import.meta.env.DEV || !import.meta.env.VITE_DEV_EXPORT_MD || !doc || highlights.length === 0) return;
    const t = setTimeout(async () => {
      const md = await buildNotesMarkdown(doc, readingOrder(highlights));
      await fetch(`/__devexport?name=${encodeURIComponent(safeFileName(doc.title))}.md`, { method: "POST", body: md });
      devLog(`dev export: ${md.length} chars`);
    }, 1500);
    return () => clearTimeout(t);
  }, [doc, highlights]);

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
    notifyLibraryChanged();
    setSelectedHighlightId(h.id);
    setFocusNoteId(h.id);
    setNoteTab("note");
  }, [doc, showNotice]);

  // 목록에서 고르기: 본문 위치로 이동 + 노트 열기
  const openHighlight = useCallback((h: Highlight) => {
    setSelectedHighlightId(h.id);
    setFocusNoteId(null);
    viewerRef.current?.scrollToHighlight(h);
  }, []);

  const changeColor = useCallback(async (id: string, color: string) => {
    setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, color } : h)));
    try {
      await updateHighlightColor(await getDb(), id, color);
      notifyLibraryChanged();
    } catch (e) {
      console.error(e);
      setError(`색상을 저장하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // 확인 없이 삭제(확인창은 requestDelete). 열려 있던 노트 패널은 먼저 닫아서
  // 남은 노트 변경이 저장된 뒤 지워지게 한다(노트는 외래 키로 함께 삭제).
  const removeHighlight = useCallback(async (h: Highlight) => {
    setSelectedHighlightId((cur) => (cur === h.id ? null : cur));
    await new Promise((r) => setTimeout(r, 0));
    try {
      await deleteHighlight(await getDb(), h.id);
      setHighlights((prev) => prev.filter((x) => x.id !== h.id));
      notifyLibraryChanged();
      devLog(`highlight deleted ${h.id} "${h.text}"`);
    } catch (e) {
      console.error(e);
      setError(`삭제하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const requestDelete = useCallback(
    async (h: Highlight) => {
      const short = h.text.length > 60 ? `${h.text.slice(0, 60)}…` : h.text;
      const ok = await confirm(`“${short}”\n\n이 하이라이트와 노트(보드 포함)를 삭제할까요? 되돌릴 수 없습니다.`, {
        title: "하이라이트 삭제",
        kind: "warning",
        okLabel: "삭제",
        cancelLabel: "취소",
      });
      if (ok) await removeHighlight(h);
    },
    [removeHighlight],
  );

  // 개발 자가 테스트: 첫 하이라이트(목록 순) 색 바꾸기 / 확인창 없이 삭제
  const devEditedRef = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || !doc || orderedHighlights.length === 0 || devEditedRef.current) return;
    const color = import.meta.env.VITE_DEV_COLOR_FIRST;
    const del = import.meta.env.VITE_DEV_DELETE_FIRST;
    if (!color && !del) return;
    devEditedRef.current = true;
    const first = orderedHighlights[0];
    const t = setTimeout(() => void (del ? removeHighlight(first) : changeColor(first.id, color!)), 1000);
    return () => clearTimeout(t);
  }, [doc, orderedHighlights, removeHighlight, changeColor]);

  // H: 하이라이트, Esc: 노트 패널 닫기(노트 입력 중에도 동작)
  // e.code 를 쓰는 이유: 한글 입력 상태에서는 e.key 가 "ㅗ" 가 된다.
  // 보드(Excalidraw) 안의 키 입력은 Excalidraw 단축키(H=손 도구, Esc=선택 해제 등)라 건드리지 않는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || inBoard(e.target)) return;
      if (e.key === "Escape") {
        setSelectedHighlightId(null);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "KeyH") {
        e.preventDefault();
        void createHighlight();
      } else if ((e.key === "Backspace" || e.key === "Delete") && selectedHighlight) {
        // 하이라이트가 선택된 상태에서 Delete/Backspace → 삭제 확인
        e.preventDefault();
        void requestDelete(selectedHighlight);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createHighlight, requestDelete, selectedHighlight]);

  const goToPage = useCallback((index: number) => viewerRef.current?.scrollToPage(index), []);

  // 단축키: ⌘O 열기, ⌘= / ⌘- 확대/축소, ⌘0 폭 맞춤
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || inBoard(e.target)) return;
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
        listOpen={listOpen}
        onToggleList={() => setListOpen((v) => !v)}
        recentOpen={recentOpen}
        onToggleRecent={() => {
          if (!recentOpen) void refreshRecent();
          setRecentOpen((v) => !v);
        }}
        onExport={() => void exportMarkdown()}
        bundleOpen={bundleOpen}
        onToggleBundle={() => setBundleOpen((v) => !v)}
      />
      {bundleOpen && (
        <BundlePanel
          state={bundle.state}
          onSetDir={(d) => void bundle.setDir(d)}
          onSetAuto={(a) => void bundle.setAuto(a)}
          onSetIncludePdfs={(v) => void bundle.setIncludePdfs(v)}
          onExportNow={() => void bundle.exportNow()}
          onClose={() => setBundleOpen(false)}
        />
      )}
      {recentOpen && (
        <div className="recent-popover" onMouseLeave={() => setRecentOpen(false)}>
          <RecentList docs={recentDocs} onOpen={(d) => void openRecent(d)} />
        </div>
      )}
      <div className="workspace">
      {doc && listOpen && (
        <HighlightList
          highlights={orderedHighlights}
          selectedId={selectedHighlightId}
          onSelect={openHighlight}
          onDelete={(h) => void requestDelete(h)}
        />
      )}
      <main className="main" ref={mainRef}>
        {doc ? (
          <PdfViewer
            ref={viewerRef}
            doc={doc.pdf}
            scale={scale}
            onPageChange={setPageIndex}
            highlights={highlights}
            selectedHighlightId={selectedHighlightId}
            onHighlightClick={(id) => {
              setSelectedHighlightId(id);
              setFocusNoteId(null);
            }}
          />
        ) : (
          <div className="empty">
            <p>PDF 파일을 열거나 이 창에 끌어다 놓으세요.</p>
            <button onClick={() => void openDialog()}>PDF 열기</button>
            {recentDocs.length > 0 && (
              <section className="recent-home">
                <h2>최근 문서</h2>
                <RecentList docs={recentDocs} onOpen={(d) => void openRecent(d)} />
              </section>
            )}
          </div>
        )}
        {loading && <div className="status">불러오는 중…</div>}
        {notice && !loading && <div className="status">{notice}</div>}
        {error && (
          <div className="status error" onClick={() => setError(null)}>
            {error}
          </div>
        )}
        {dragTarget === "pdf" && <div className="drop-overlay">여기에 놓아서 열기</div>}
      </main>
      {selectedHighlight && (
        <NotePanel
          key={selectedHighlight.id}
          highlight={selectedHighlight}
          autoFocus={focusNoteId === selectedHighlight.id}
          tab={noteTab}
          onTabChange={setNoteTab}
          onClose={() => setSelectedHighlightId(null)}
          onJump={() => viewerRef.current?.scrollToHighlight(selectedHighlight)}
          onColorChange={(color) => void changeColor(selectedHighlight.id, color)}
          onDelete={() => void requestDelete(selectedHighlight)}
        />
      )}
      </div>
    </div>
  );
}

function inBoard(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".board-host") !== null;
}
