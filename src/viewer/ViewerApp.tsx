import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { readBundle } from "../bundle/bundleZip";
import { BUNDLE_SCHEMA_VERSION, type BundleLibrary } from "../bundle/schema";
import { loadCachedBundle, saveCachedBundle, savedSource, saveSource, type BundleSource } from "./cache";
import { pickBundleFile, pickFolder, readSource } from "./source";
import { filterVocab, paperItems, paperSummaries, vocabItems, type VocabItem } from "./vocab";
import { describeDiff, diffLibraries, shouldAutoRefresh } from "./diff";
import "./viewer.css";

// 원문 보기는 pdf.js 를 쓰므로 필요할 때만 불러온다.
const PdfScreen = lazy(() => import("./PdfScreen"));

interface Loaded {
  library: BundleLibrary;
  boards: Map<string, string>;
  pdfUris: Map<string, string>; // 폴더 연결일 때 PDF 원문 주소
  readAt: string;
}

// 화면 쌓기: (단어장|논문) → 논문 → 노트 상세 → 원문. Android 뒤로 가기(popstate)로 한 단계씩 돌아간다.
type View =
  | { kind: "paper"; documentId: string }
  | { kind: "detail"; item: VocabItem }
  | { kind: "pdf"; documentId: string; focusId?: string };

type Report = "always" | "changes" | "none";

// Android 뷰어(읽기 전용 단어장). DB 를 쓰지 않고 번들(library.json + 보드 SVG)과 PDF 원문만 읽는다.
export default function ViewerApp() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [source, setSource] = useState<BundleSource | null>(() => savedSource());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState<string | null>(null);
  const [stack, setStack] = useState<View[]>([]);
  const [tab, setTab] = useState<"vocab" | "papers">("vocab");
  const loadedRef = useRef<Loaded | null>(null);
  loadedRef.current = loaded;
  const busyRef = useRef(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // 바이트 → 화면 상태. 성공하면 캐시에 저장.
  // report: "always" = 결과를 항상 안내(버튼), "changes" = 바뀐 게 있을 때만(자동), "none" = 안내 없음(캐시)
  const apply = useCallback(
    async (data: Uint8Array, pdfUris: Map<string, string>, readAt: string, cache: boolean, report: Report) => {
      const r = readBundle(data);
      if (!r.ok) {
        setMessage(
          r.reason === "unsupported-version"
            ? `이 번들은 더 새로운 형식(v${r.version})입니다. 폰 앱을 업데이트하세요. (지원: v${BUNDLE_SCHEMA_VERSION})`
            : "PaperBoard 번들 파일이 아니거나 손상되었습니다.",
        );
        return false;
      }
      const prev = loadedRef.current?.library;
      if (prev && report !== "none") {
        const d = diffLibraries(prev, r.library);
        const any = d.added + d.removed + d.changed > 0;
        if (report === "always" || any) setNotice(describeDiff(d, prev.exportedAt === r.library.exportedAt));
      }
      setLoaded({ library: r.library, boards: r.boards, pdfUris, readAt });
      if (cache) await saveCachedBundle({ data, readAt });
      return true;
    },
    [],
  );

  const readFrom = useCallback(
    async (src: BundleSource, report: Report = "always") => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setMessage(null);
      try {
        const { data, pdfUris } = await readSource(src);
        if (await apply(data, pdfUris, new Date().toISOString(), true, report)) {
          saveSource(src);
          setSource(src);
        }
      } catch (e) {
        console.error("bundle read failed", e);
        setMessage(`번들을 읽지 못했습니다. 다시 연결해 주세요. (${e instanceof Error ? e.message : String(e)})`);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [apply],
  );

  // PaperBoard 폴더 연결(권장): 번들과 PDF 원문을 모두 읽는다.
  const connectFolder = useCallback(async () => {
    const picked = await pickFolder();
    if (!picked.uri) return;
    await readFrom({ kind: "folder", treeUri: picked.uri });
    if (!picked.persisted) setMessage("폴더의 영구 권한을 받지 못해, 앱을 다시 켜면 다시 연결해야 할 수 있습니다.");
  }, [readFrom]);

  // 번들 파일 하나만 고르기(원문 보기 불가)
  const pickFile = useCallback(async () => {
    const picked = await pickBundleFile();
    if (!picked.uri) return;
    await readFrom({ kind: "file", uri: picked.uri });
    if (!picked.persisted) setMessage("이 파일은 영구 권한을 받지 못해, 앱을 다시 켜면 다시 골라야 할 수 있습니다.");
  }, [readFrom]);

  const refresh = useCallback(async () => {
    const src = savedSource();
    if (src) await readFrom(src, "always");
    else await connectFolder();
  }, [readFrom, connectFolder]);

  // 시작: 캐시를 먼저 보여주고, 저장된 곳이 있으면 최신으로 다시 읽는다(바뀐 게 있을 때만 안내).
  useEffect(() => {
    void (async () => {
      const cached = await loadCachedBundle().catch(() => null);
      if (cached) await apply(cached.data, new Map(), cached.readAt, false, "none");
      const src = savedSource();
      if (src) await readFrom(src, "changes");
    })();
  }, [apply, readFrom]);

  // 다른 앱에 갔다가 돌아오면 자동 새로고침. 1분 안에 읽었으면 건너뛴다.
  useEffect(() => {
    const onVisible = () => {
      const src = savedSource();
      if (document.visibilityState !== "visible" || !src) return;
      if (shouldAutoRefresh(loadedRef.current?.readAt ?? null, Date.now())) void readFrom(src, "changes");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [readFrom]);

  // 화면 쌓기 + Android 뒤로 가기
  const push = useCallback((v: View) => {
    history.pushState({ depth: 1 }, "");
    setStack((s) => [...s, v]);
  }, []);
  useEffect(() => {
    const onPop = () => setStack((s) => s.slice(0, -1));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const items = useMemo(() => (loaded ? vocabItems(loaded.library) : []), [loaded]);
  const visible = useMemo(() => filterVocab(items, docFilter, query), [items, docFilter, query]);
  const papers = useMemo(() => (loaded ? paperSummaries(loaded.library) : []), [loaded]);

  // 원문을 볼 수 있는지: 번들에 PDF 가 있고 폴더가 연결돼 있어야 한다.
  const originalFor = (documentId: string, focusId?: string, needRects = false): Original => {
    const doc = loaded?.library.documents.find((d) => d.id === documentId);
    if (!doc?.pdf || needRects) return { kind: "none" };
    if (source?.kind !== "folder") return { kind: "need-folder", connect: () => void connectFolder() };
    return { kind: "ok", open: () => push({ kind: "pdf", documentId, focusId }) };
  };

  const top = stack[stack.length - 1];
  if (top && loaded) {
    if (top.kind === "pdf") {
      const doc = loaded.library.documents.find((d) => d.id === top.documentId);
      return (
        <Suspense fallback={<div className="viewer-empty">원문 불러오는 중…</div>}>
          <PdfScreen
            document={doc!}
            highlights={loaded.library.highlights.filter((h) => h.documentId === top.documentId)}
            focusId={top.focusId}
            pdfUri={doc?.pdf ? loaded.pdfUris.get(doc.pdf.split("/").pop()!) : undefined}
            onBack={() => history.back()}
            onOpenNote={(id) => {
              const it = items.find((x) => x.highlight.id === id);
              if (it) push({ kind: "detail", item: it });
            }}
          />
        </Suspense>
      );
    }
    if (top.kind === "paper") {
      const summary = papers.find((p) => p.document.id === top.documentId);
      return (
        <PaperScreen
          title={summary?.document.title ?? ""}
          fileName={summary?.document.fileName ?? ""}
          items={paperItems(items, top.documentId)}
          original={originalFor(top.documentId)}
          onOpen={(it) => push({ kind: "detail", item: it })}
          onBack={() => history.back()}
        />
      );
    }
    const h = top.item.highlight;
    return (
      <Detail
        item={top.item}
        boards={loaded.boards}
        original={originalFor(h.documentId, h.id, !h.rects)}
        onBack={() => history.back()}
      />
    );
  }

  return (
    <div className="viewer">
      <header className="viewer-bar">
        <strong>PaperBoard 단어장</strong>
        <span className="viewer-read">{loaded ? `읽은 시각 ${fmt(loaded.readAt)}` : ""}</span>
        <button onClick={() => void refresh()} disabled={busy}>
          {busy ? "읽는 중…" : "새로고침"}
        </button>
      </header>
      {message && <div className="viewer-message">{message}</div>}
      {notice && <div className="viewer-notice">{notice}</div>}
      {!loaded ? (
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
      ) : (
        <>
          <nav className="viewer-tabs">
            <button className={tab === "vocab" ? "active" : ""} onClick={() => setTab("vocab")}>
              단어장 {items.length}
            </button>
            <button className={tab === "papers" ? "active" : ""} onClick={() => setTab("papers")}>
              논문 {papers.length}
            </button>
          </nav>
          {tab === "papers" ? (
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
