import { useCallback, useRef, useState } from "react";
import { Toolbar } from "./Toolbar";
import { HighlightList } from "./HighlightList";
import { RecentList } from "./RecentList";
import { BundlePanel } from "./BundlePanel";
import { UpdateBanner } from "./UpdateBanner";
import { NotePanel } from "./note/NotePanel";
import { dropFilesOnBoard } from "./note/boardDrop";
import { PdfViewer, type PdfViewerHandle } from "../pdf/PdfViewer";
import { useStatus } from "../hooks/useStatus";
import { useDocument } from "../hooks/useDocument";
import { useHighlights } from "../hooks/useHighlights";
import { useShortcuts } from "../hooks/useShortcuts";
import { useFileDrop } from "../hooks/useFileDrop";
import { useBundleExport } from "../hooks/useBundleExport";
import { useSync } from "../hooks/useSync";
import { fitWidthScale, zoomIn, zoomOut } from "../../logic/pdf/zoom";
import { readImageFile } from "../../services/files/openPdf";
import { exportNotesToFile } from "../../services/export/exportNotes";
import type { OpenedDocument } from "../../services/documents";
import type { MergeResult } from "../../services/sync/syncFiles";
import { useDesktopDevHooks } from "../../dev/useDesktopDevHooks";
import "./App.css";

// 데스크톱 편집기 화면 배치. 상태와 동작은 훅(ui/hooks)과 서비스(services)에 있다.
export default function App() {
  const status = useStatus();
  const [scale, setScale] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [listOpen, setListOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<PdfViewerHandle>(null);

  const bundle = useBundleExport();

  const fitWidth = useCallback((pageWidth: number) => {
    setScale(fitWidthScale(mainRef.current?.clientWidth ?? 800, pageWidth));
  }, []);

  const hlRef = useRef<ReturnType<typeof useHighlights> | null>(null);
  const onOpened = useCallback(
    (d: OpenedDocument) => {
      hlRef.current?.reset(d.highlights);
      setPageIndex(0);
      setRecentOpen(false);
      fitWidth(d.firstPageWidth);
    },
    [fitWidth],
  );
  const docs = useDocument(status, bundle.state.dir, onOpened);
  const { doc } = docs;
  const hl = useHighlights(doc?.id ?? null, status);
  hlRef.current = hl;

  // PC 간 동기화: 다른 PC 내용을 합쳐 DB 가 바뀌면 화면을 다시 읽는다.
  const onRemoteApplied = useCallback(
    (results: MergeResult[]) => {
      void hlRef.current?.applyRemote(results);
      void docs.refreshRecent();
      status.showNotice(results.map((r) => r.message).join(" / "));
    },
    [docs, status],
  );
  const sync = useSync(bundle.state.dir, onRemoteApplied);

  const createHighlight = () => void hl.create(viewerRef.current?.draftFromSelection());

  const exportMarkdown = async () => {
    if (!doc) return;
    try {
      const saved = await exportNotesToFile(doc, hl.ordered);
      if (saved) status.showNotice(`내보냈습니다: ${saved}`);
    } catch (e) {
      status.showError("내보내지 못했습니다", e);
    }
  };

  useShortcuts({
    hasDocument: !!doc,
    onHighlight: createHighlight,
    onCloseNote: () => hl.select(null),
    onDeleteSelected: hl.selected ? () => void hl.requestDelete(hl.selected!) : undefined,
    onOpen: () => void docs.openDialog(),
    onZoomIn: () => setScale(zoomIn),
    onZoomOut: () => setScale(zoomOut),
    onFitWidth: () => doc && fitWidth(doc.firstPageWidth),
  });

  const dragTarget = useFileDrop({
    onPdf: (path) => void docs.openPath(path),
    onImages: (paths, x, y) => {
      Promise.all(paths.map(readImageFile))
        .then((files) => dropFilesOnBoard(files, x, y))
        .catch((e) => status.showError("이미지를 읽을 수 없습니다", e));
    },
  });

  useDesktopDevHooks({
    doc,
    hl,
    openPath: docs.openPath,
    setScale,
    viewerRef,
    bundleDir: bundle.state.dir,
    exportBundleNow: bundle.exportNow,
  });

  const selected = hl.selected;
  return (
    <div className="app">
      <Toolbar
        title={doc?.title ?? null}
        pageIndex={pageIndex}
        numPages={doc?.pdf.numPages ?? 0}
        scale={scale}
        onOpen={() => void docs.openDialog()}
        onGoToPage={(i) => viewerRef.current?.scrollToPage(i)}
        onZoomIn={() => setScale(zoomIn)}
        onZoomOut={() => setScale(zoomOut)}
        onFitWidth={() => doc && fitWidth(doc.firstPageWidth)}
        onHighlight={createHighlight}
        listOpen={listOpen}
        onToggleList={() => setListOpen((v) => !v)}
        recentOpen={recentOpen}
        onToggleRecent={() => {
          if (!recentOpen) void docs.refreshRecent();
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
          sync={sync.state}
          onSetSync={(v) => void sync.setEnabled(v)}
          onSyncNow={() => void sync.syncNow()}
          onClose={() => setBundleOpen(false)}
        />
      )}
      {recentOpen && (
        <div className="recent-popover" onMouseLeave={() => setRecentOpen(false)}>
          <RecentList docs={docs.recentDocs} onOpen={(d) => void docs.openRecent(d)} />
        </div>
      )}
      <div className="workspace">
        {doc && listOpen && (
          <HighlightList
            highlights={hl.ordered}
            selectedId={hl.selectedId}
            onSelect={(h) => {
              hl.select(h.id);
              viewerRef.current?.scrollToHighlight(h);
            }}
            onDelete={(h) => void hl.requestDelete(h)}
          />
        )}
        <main className="main" ref={mainRef}>
          {doc ? (
            <PdfViewer
              ref={viewerRef}
              doc={doc.pdf}
              scale={scale}
              onPageChange={setPageIndex}
              onZoom={setScale}
              highlights={hl.highlights}
              selectedHighlightId={hl.selectedId}
              onHighlightClick={hl.select}
            />
          ) : (
            <div className="empty">
              <p>PDF 파일을 열거나 이 창에 끌어다 놓으세요.</p>
              <button onClick={() => void docs.openDialog()}>PDF 열기</button>
              {docs.recentDocs.length > 0 && (
                <section className="recent-home">
                  <h2>최근 문서</h2>
                  <RecentList docs={docs.recentDocs} onOpen={(d) => void docs.openRecent(d)} />
                </section>
              )}
            </div>
          )}
          {docs.loading && <div className="status">불러오는 중…</div>}
          {status.notice && !docs.loading && <div className="status">{status.notice}</div>}
          {status.error && (
            <div className="status error" onClick={status.clearError}>
              {status.error}
            </div>
          )}
          {dragTarget === "pdf" && <div className="drop-overlay">여기에 놓아서 열기</div>}
          <UpdateBanner />
        </main>
        {selected && (
          <NotePanel
            key={`${selected.id}:${hl.panelVersion}`}
            highlight={selected}
            autoFocus={hl.focusNoteId === selected.id}
            tab={hl.noteTab}
            onTabChange={hl.setNoteTab}
            onClose={() => hl.select(null)}
            onJump={() => viewerRef.current?.scrollToHighlight(selected)}
            onColorChange={(color) => void hl.changeColor(selected.id, color)}
            onDelete={() => void hl.requestDelete(selected)}
          />
        )}
      </div>
    </div>
  );
}
