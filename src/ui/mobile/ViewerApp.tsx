import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { filterVocab, paperItems, paperSummaries, vocabItems, type VocabItem } from "../../logic/viewer/vocab";
import type { LocalPdf } from "../../logic/viewer/localPdfs";
import { loadDocumentPdf } from "../../services/viewer/pdfSource";
import { useBundleSource } from "../hooks/useBundleSource";
import { useLocalPdfs } from "../hooks/useLocalPdfs";
import { LocalPdfList } from "./LocalPdfList";
import "./viewer.css";

// 원문 보기는 pdf.js 를 쓰므로 필요할 때만 불러온다.
const PdfScreen = lazy(() => import("./PdfScreen"));

// 화면 쌓기: (단어장|논문|PDF) → 논문 → 노트 상세 → 원문. Android 뒤로 가기(popstate)로 한 단계씩 돌아간다.
// local: 기기의 PDF 파일(PDF 리더). 번들에 같은 논문(내용 해시)이 있으면 그 하이라이트를 함께 보여준다.
type View =
  | { kind: "paper"; documentId: string }
  | { kind: "detail"; item: VocabItem }
  | { kind: "pdf"; documentId: string; focusId?: string; focusNonce?: number }
  | { kind: "local"; pdf: LocalPdf };

// Android 뷰어(읽기 전용 단어장 + PDF 리더) 화면. 번들 읽기·새로고침은 useBundleSource, 기기 PDF 는 useLocalPdfs 에 있다.
export default function ViewerApp() {
  const { loaded, source, busy, message, notice, connectFolder, pickFile, refresh } = useBundleSource();
  const local = useLocalPdfs();
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState<string | null>(null);
  const [stack, setStack] = useState<View[]>([]);
  const [tab, setTab] = useState<"vocab" | "papers" | "local">("vocab");

  // 화면 쌓기 + Android 뒤로 가기. 히스토리 항목마다 스택 깊이를 넣어 두어, 여러 단계를
  // 한 번에 돌아가도(history.go(-n)) popstate 한 번으로 그 깊이에 맞춘다.
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const push = useCallback((v: View) => {
    history.pushState({ depth: stackRef.current.length + 1 }, "");
    setStack((s) => [...s, v]);
  }, []);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const depth = (e.state as { depth?: number } | null)?.depth ?? 0;
      setStack((s) => s.slice(0, depth));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // 원문 보기: 같은 논문의 원문 화면이 이미 쌓여 있으면 새로 쌓지 않고 그 화면으로 돌아가
  // 새 하이라이트로 이동한다. 없으면 새로 쌓는다.
  const openOriginal = (documentId: string, focusId?: string) => {
    const s = stackRef.current;
    const i = s.findIndex((v) => v.kind === "pdf" && v.documentId === documentId);
    if (i < 0) return push({ kind: "pdf", documentId, focusId });
    setStack((prev) => prev.map((v, j) => (j === i && v.kind === "pdf" ? { ...v, focusId, focusNonce: Date.now() } : v)));
    history.go(-(s.length - 1 - i));
  };

  const items = useMemo(() => (loaded ? vocabItems(loaded.library) : []), [loaded]);
  const visible = useMemo(() => filterVocab(items, docFilter, query), [items, docFilter, query]);
  const papers = useMemo(() => (loaded ? paperSummaries(loaded.library) : []), [loaded]);
  const highlightCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of loaded?.library.highlights ?? []) m.set(h.documentId, (m.get(h.documentId) ?? 0) + 1);
    return m;
  }, [loaded]);

  const openLocal = async (p: LocalPdf) => {
    const opened = await local.open(p.uri, p.name);
    if (opened) push({ kind: "local", pdf: opened });
  };
  const pickLocal = async () => {
    const opened = await local.pick();
    if (opened) push({ kind: "local", pdf: opened });
  };
  const openNote = (id: string) => {
    const it = items.find((x) => x.highlight.id === id);
    if (it) push({ kind: "detail", item: it });
  };
  const localList = (
    <LocalPdfList
      list={local.list}
      highlightCounts={highlightCounts}
      onPick={() => void pickLocal()}
      onOpen={(p) => void openLocal(p)}
      onRemove={(p) => local.remove(p.uri)}
    />
  );

  // 원문을 볼 수 있는지: 번들에 PDF 가 있고 폴더가 연결돼 있어야 한다.
  const originalFor = (documentId: string, focusId?: string, needRects = false): Original => {
    const doc = loaded?.library.documents.find((d) => d.id === documentId);
    if (!doc?.pdf || needRects) return { kind: "none" };
    if (source?.kind !== "folder") return { kind: "need-folder", connect: () => void connectFolder() };
    return { kind: "ok", open: () => openOriginal(documentId, focusId) };
  };

  // 원문 화면(PDF)은 메모리를 많이 써서, 스택에서 가장 위에 있는 하나만 살려 둔다.
  // 그보다 아래의 다른 원문은 닫아 두었다가(빈 화면) 뒤로 가서 다시 맨 위 원문이 되면 새로 연다.
  let livePdf = -1;
  stack.forEach((v, i) => {
    if (v.kind === "pdf" || v.kind === "local") livePdf = i;
  });

  // 쌓인 화면 하나를 그린다. 번들 화면(논문·상세·원문)은 번들이 있을 때만.
  const renderView = (v: View, i: number) => {
    if ((v.kind === "pdf" || v.kind === "local") && i !== livePdf) return null;
    if (v.kind === "local") {
      const p = v.pdf;
      return (
        <Suspense fallback={<div className="viewer-empty">PDF 불러오는 중…</div>}>
          <PdfScreen
            pdfKey={p.uri}
            load={() => local.load(p.uri)}
            title={p.name}
            highlights={loaded?.library.highlights.filter((h) => h.documentId === p.documentId) ?? []}
            onBack={() => history.back()}
            onOpenNote={openNote}
          />
        </Suspense>
      );
    }
    if (loaded) {
      if (v.kind === "pdf") {
        const doc = loaded.library.documents.find((d) => d.id === v.documentId);
        return (
          <Suspense fallback={<div className="viewer-empty">원문 불러오는 중…</div>}>
            <PdfScreen
              pdfKey={v.documentId}
              load={() =>
                loadDocumentPdf(v.documentId, doc?.pdf ? loaded.pdfUris.get(doc.pdf.split("/").pop()!) : undefined)
              }
              highlights={loaded.library.highlights.filter((h) => h.documentId === v.documentId)}
              focusId={v.focusId}
              focusNonce={v.focusNonce}
              onBack={() => history.back()}
              onOpenNote={openNote}
            />
          </Suspense>
        );
      }
      if (v.kind === "paper") {
        const summary = papers.find((p) => p.document.id === v.documentId);
        return (
          <PaperScreen
            title={summary?.document.title ?? ""}
            fileName={summary?.document.fileName ?? ""}
            items={paperItems(items, v.documentId)}
            original={originalFor(v.documentId)}
            onOpen={(it) => push({ kind: "detail", item: it })}
            onBack={() => history.back()}
          />
        );
      }
      const h = v.item.highlight;
      return (
        <Detail
          item={v.item}
          boards={loaded.boards}
          original={originalFor(h.documentId, h.id, !h.rects)}
          onBack={() => history.back()}
        />
      );
    }
    return null;
  };

  const home = (
    <div className="viewer">
      <header className="viewer-bar">
        <strong>PaperBoard 단어장</strong>
        <span className="viewer-read">{loaded ? `읽은 시각 ${fmt(loaded.readAt)}` : ""}</span>
        <button onClick={() => void refresh()} disabled={busy}>
          {busy ? "읽는 중…" : "새로고침"}
        </button>
      </header>
      {message && <div className="viewer-message">{message}</div>}
      {local.message && <div className="viewer-message">{local.message}</div>}
      {notice && <div className="viewer-notice">{notice}</div>}
      {!loaded ? (
        <>
          <div className="viewer-empty">
            <p>맥에서 번들을 내보낸 Google Drive 의 PaperBoard 폴더를 연결하세요.</p>
            <button onClick={() => void connectFolder()} disabled={busy}>
              PaperBoard 폴더 연결
            </button>
            <p className="viewer-hint">
              폴더를 연결하면 PDF 원문도 볼 수 있습니다.{" "}
              <button className="link" onClick={() => void pickFile()}>
                번들 파일만 선택
              </button>
            </p>
          </div>
          {localList}
        </>
      ) : (
        <>
          <nav className="viewer-tabs">
            <button className={tab === "vocab" ? "active" : ""} onClick={() => setTab("vocab")}>
              단어장 {items.length}
            </button>
            <button className={tab === "papers" ? "active" : ""} onClick={() => setTab("papers")}>
              논문 {papers.length}
            </button>
            <button className={tab === "local" ? "active" : ""} onClick={() => setTab("local")}>
              PDF 파일
            </button>
          </nav>
          {tab === "local" ? (
            localList
          ) : tab === "papers" ? (
            <ul className="vocab-list">
              {papers.map((p) => (
                <li key={p.document.id}>
                  <button className="paper-item" onClick={() => push({ kind: "paper", documentId: p.document.id })}>
                    <span className="vocab-text">{p.document.title}</span>
                    <span className="vocab-meta">
                      하이라이트 {p.highlightCount} · {fmtDate(p.document.lastOpenedAt)}
                      {p.hasPdf ? " · 원문 있음" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className="viewer-filters">
                <input type="search" placeholder="문구·노트 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
                <select value={docFilter ?? ""} onChange={(e) => setDocFilter(e.target.value || null)}>
                  <option value="">모든 문서</option>
                  {loaded.library.documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>
              <ul className="vocab-list">
                {visible.map((it) => (
                  <li key={it.highlight.id}>
                    <button onClick={() => push({ kind: "detail", item: it })}>
                      <span className="vocab-swatch" style={{ background: it.highlight.color }} />
                      <span className="vocab-text">{it.highlight.text}</span>
                      <span className="vocab-meta">
                        {it.documentTitle} · p.{it.highlight.pageIndex + 1}
                      </span>
                      {it.noteFirstLine && <span className="vocab-note">{it.noteFirstLine}</span>}
                    </button>
                  </li>
                ))}
                {visible.length === 0 && <li className="viewer-hint">결과가 없습니다.</li>}
              </ul>
            </>
          )}
          <footer className="viewer-foot">
            {tab === "vocab" ? `${visible.length}/${items.length}개 · ` : ""}
            <button className="link" onClick={() => void connectFolder()}>
              {source?.kind === "folder" ? "다른 폴더 연결" : "PaperBoard 폴더 연결 (원문 보기)"}
            </button>
          </footer>
        </>
      )}
    </div>
  );

  // 모든 화면을 겹쳐 두고 맨 위 화면만 보인다. 아래 화면은 언마운트하지 않고 숨겨서(visibility)
  // 뒤로 왔을 때 PDF·확대율·스크롤 위치가 그대로 남는다(#7). 각 화면이 자기 스크롤을 갖는다.
  const layers = [home, ...stack.map((v, i) => renderView(v, i))];
  return (
    <>
      {layers.map((el, i) => (
        <div key={i} className={i === layers.length - 1 ? "viewer-layer" : "viewer-layer behind"} aria-hidden={i !== layers.length - 1}>
          {el}
        </div>
      ))}
    </>
  );
}

type Original = { kind: "none" } | { kind: "ok"; open(): void } | { kind: "need-folder"; connect(): void };

function Detail({
  item,
  boards,
  original,
  onBack,
}: {
  item: VocabItem;
  boards: Map<string, string>;
  original: Original;
  onBack(): void;
}) {
  const h = item.highlight;
  const svg = h.boardSvg ? boards.get(h.boardSvg) : undefined;
  // SVG 는 <img> 로 넣어 스크립트가 실행되지 않게 한다.
  const svgUrl = useMemo(() => (svg ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })) : null), [svg]);
  useEffect(() => () => void (svgUrl && URL.revokeObjectURL(svgUrl)), [svgUrl]);
  return (
    <div className="viewer">
      <header className="viewer-bar">
        <button onClick={onBack}>← 뒤로</button>
        <span className="viewer-read" />
        {original.kind === "ok" && <button onClick={original.open}>원문 보기</button>}
      </header>
      <article className="vocab-detail">
        <blockquote style={{ borderLeftColor: h.color }}>{h.text}</blockquote>
        <p className="vocab-meta">
          {item.documentTitle} · p.{h.pageIndex + 1}
        </p>
        {original.kind === "need-folder" && (
          <p className="viewer-hint">
            원문을 보려면{" "}
            <button className="link" onClick={original.connect}>
              PaperBoard 폴더를 연결
            </button>
            하세요.
          </p>
        )}
        {h.note ? (
          // 노트 HTML 은 맥 앱이 만든 것(tiptapToHtml: 글자 이스케이프, 위험한 링크 제거)
          <div className="vocab-note-html" dangerouslySetInnerHTML={{ __html: h.note.html }} />
        ) : (
          <p className="viewer-hint">노트 없음</p>
        )}
        {svgUrl && <img className="vocab-board" src={svgUrl} alt="보드" />}
      </article>
    </div>
  );
}

function PaperScreen({
  title,
  fileName,
  items,
  original,
  onOpen,
  onBack,
}: {
  title: string;
  fileName: string;
  items: VocabItem[];
  original: Original;
  onOpen(it: VocabItem): void;
  onBack(): void;
}) {
  return (
    <div className="viewer">
      <header className="viewer-bar">
        <button onClick={onBack}>← 뒤로</button>
        <span className="viewer-read" />
        {original.kind === "ok" && <button onClick={original.open}>원문 열기</button>}
      </header>
      <div className="paper-head">
        <h2>{title}</h2>
        <p className="vocab-meta">
          {fileName} · 하이라이트 {items.length}
        </p>
        {original.kind === "need-folder" && (
          <p className="viewer-hint">
            원문을 보려면{" "}
            <button className="link" onClick={original.connect}>
              PaperBoard 폴더를 연결
            </button>
            하세요.
          </p>
        )}
      </div>
      <ul className="vocab-list">
        {items.map((it) => (
          <li key={it.highlight.id}>
            <button onClick={() => onOpen(it)}>
              <span className="vocab-swatch" style={{ background: it.highlight.color }} />
              <span className="vocab-text">{it.highlight.text}</span>
              <span className="vocab-meta">p.{it.highlight.pageIndex + 1}</span>
              {it.noteFirstLine && <span className="vocab-note">{it.noteFirstLine}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
