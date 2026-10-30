import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PdfViewer, type PdfViewerHandle } from "../pdf/PdfViewer";
import { loadPdf, type PDFDocumentProxy } from "../../services/pdf/pdfjs";
import { fitWidthScale, zoomIn, zoomOut } from "../../logic/pdf/zoom";
import type { BundleHighlight } from "../../logic/bundle/schema";
import type { Highlight } from "../../logic/types";
import { savedNotePanel, saveNotePanel } from "../../services/viewer/cache";
import { useMediaQuery } from "../hooks/useMediaQuery";

// 노트 패널을 옆에 띄울 만큼 넓은 화면(태블릿, 펼친 Fold). CSS px 기준
const WIDE_SCREEN = "(min-width: 700px)";
// 노트 패널 스위치 손잡이가 움직이는 시간(viewer.css 의 .panel-switch-knob transition 과 같게)
const SWITCH_MS = 200;

interface Props {
  pdfKey: string; // 어떤 PDF 인지(바뀌면 다시 읽는다). 번들 문서 id 또는 기기 파일 주소
  load(): Promise<Uint8Array>; // PDF 바이트 읽기(번들 원문: Drive 폴더·폰 캐시, 기기 파일: 그 파일)
  title?: string; // 위쪽 막대에 보일 이름(기기 파일)
  highlights: BundleHighlight[]; // 이 문서의 하이라이트(없으면 빈 배열)
  focusId?: string; // 처음 보여줄 하이라이트(없으면 첫 페이지)
  focusNonce?: number; // 바뀌면(이미 열린 원문으로 돌아올 때) focusId 위치로 다시 이동
  onBack(): void;
  onOpenNote(highlightId: string): void; // 노트 상세 화면으로(노트 패널이 꺼져 있을 때)
  renderNote?(highlightId: string): ReactNode; // 원문 옆 노트 패널에 보일 내용
}

// 폰 "원문 보기": 맥과 같은 PDF 뷰어(캔버스 + 텍스트 레이어 + 하이라이트 레이어)를 읽기 전용으로 쓴다.
// 번들 원문과 기기의 PDF 파일(PDF 리더)을 같은 화면으로 연다. 하이라이트를 누르면 그 노트로 간다.
// 넓은 화면에서는 [노트 패널] 버튼으로 원문 오른쪽에 노트 패널을 켜고 끈다. 켜 두면 하이라이트를 눌러도
// 화면이 바뀌지 않고 패널 내용만 바뀐다.
export default function PdfScreen({
  pdfKey,
  load,
  title,
  highlights,
  focusId,
  focusNonce,
  onBack,
  onOpenNote,
  renderNote,
}: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageWidth, setPageWidth] = useState<number | null>(null); // 첫 페이지 폭(배율 1, 너비 맞춤용)
  const mainRef = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery(WIDE_SCREEN);
  const [panelOpen, setPanelOpen] = useState(savedNotePanel);
  // 스위치 손잡이 위치. 패널은 손잡이가 다 움직인 뒤에 열고 닫는다(원문을 다시 맞추는 무거운 작업이
  // 애니메이션과 겹치면 손잡이가 움직이는 게 보이지 않는다).
  const [switchOn, setSwitchOn] = useState(panelOpen);
  const switchTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(switchTimer.current), []);
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? null);
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
        const w = first.getViewport({ scale: 1 }).width;
        setPageWidth(w);
        setScale(fitWidthScale(mainRef.current?.clientWidth ?? window.innerWidth, w, 16));
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

  // 노트 패널은 넓은 화면이고, 보여줄 노트(하이라이트)가 있을 때만
  const canSplit = wide && !!renderNote && hls.length > 0;
  const split = canSplit && panelOpen;
  const togglePanel = () => {
    const next = !switchOn;
    setSwitchOn(next);
    saveNotePanel(next);
    window.clearTimeout(switchTimer.current);
    switchTimer.current = window.setTimeout(() => setPanelOpen(next), SWITCH_MS);
  };
  // 패널을 켜고 끄면 원문 폭이 바뀌므로 너비에 맞춰 배율을 다시 잡는다.
  const splitRef = useRef(split);
  useEffect(() => {
    if (splitRef.current === split) return;
    splitRef.current = split;
    const w = mainRef.current?.clientWidth;
    if (pageWidth && w) setScale(fitWidthScale(w, pageWidth, 16));
  }, [split, pageWidth]);

  const onHighlightClick = (id: string | null) => {
    if (!id) return;
    if (split) setSelectedId(id);
    else onOpenNote(id);
  };

  // 이미 열린 원문으로 돌아올 때(focusNonce 가 바뀜) 새 하이라이트로 이동한다.
  // 처음 열 때의 이동은 PdfViewer 의 focusHighlightId 가 한다.
  const viewerRef = useRef<PdfViewerHandle>(null);
  useEffect(() => {
    if (focusNonce === undefined) return;
    const h = hls.find((x) => x.id === focusId);
    if (h) viewerRef.current?.scrollToHighlight(h);
    setSelectedId(focusId ?? null);
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
        {canSplit && (
          // 둥근 스위치: 손잡이가 왼쪽(꺼짐)·오른쪽(켜짐)으로 움직인다. 손잡이는 반투명이라 글씨가 비친다.
          <button
            className={switchOn ? "panel-switch on" : "panel-switch"}
            role="switch"
            aria-checked={switchOn}
            onClick={togglePanel}
          >
            <span className="panel-switch-label">노트 패널</span>
            <span className="panel-switch-knob" aria-hidden />
          </button>
        )}
        <button disabled={!scale} onClick={() => setScale((s) => (s ? zoomOut(s) : s))}>
          −
        </button>
        <button disabled={!scale} onClick={() => setScale((s) => (s ? zoomIn(s) : s))}>
          +
        </button>
      </header>
      <div className="pdf-screen-body">
        <div className="pdf-screen-main" ref={mainRef}>
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
              selectedHighlightId={split ? selectedId : (focusId ?? null)}
              focusHighlightId={focusId}
              onHighlightClick={onHighlightClick}
            />
          ) : (
            <div className="viewer-empty">원문 불러오는 중…</div>
          )}
        </div>
        {split && (
          <aside className="note-panel">
            {(selectedId && renderNote?.(selectedId)) || (
              <p className="viewer-hint">하이라이트를 누르면 노트가 여기에 보입니다.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
