import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import "katex/dist/katex.min.css";
import { readBundle } from "../bundle/bundleZip";
import { BUNDLE_SCHEMA_VERSION, type BundleLibrary } from "../bundle/schema";
import { loadCachedBundle, saveBundleUri, saveCachedBundle, savedBundleUri } from "./cache";
import { filterVocab, vocabItems, type VocabItem } from "./vocab";
import "./viewer.css";

interface Loaded {
  library: BundleLibrary;
  boards: Map<string, string>;
  readAt: string;
}

// Android 뷰어(읽기 전용 단어장). DB 를 쓰지 않고 번들(library.json + 보드 SVG)만 읽는다.
export default function ViewerApp() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<VocabItem | null>(null);

  // 바이트 → 화면 상태. 성공하면 캐시에 저장.
  const apply = useCallback(async (data: Uint8Array, readAt: string, cache: boolean) => {
    const r = readBundle(data);
    if (!r.ok) {
      setMessage(
        r.reason === "unsupported-version"
          ? `이 번들은 더 새로운 형식(v${r.version})입니다. 폰 앱을 업데이트하세요. (지원: v${BUNDLE_SCHEMA_VERSION})`
          : "PaperBoard 번들 파일이 아니거나 손상되었습니다.",
      );
      return false;
    }
    setLoaded({ library: r.library, boards: r.boards, readAt });
    if (cache) await saveCachedBundle({ data, readAt });
    return true;
  }, []);

  const readFrom = useCallback(
    async (uri: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const data = await readFile(uri);
        if (await apply(data, new Date().toISOString(), true)) saveBundleUri(uri);
      } catch (e) {
        console.error("bundle read failed", uri, e);
        setMessage(`번들을 읽지 못했습니다. 다시 선택해 주세요. (${e instanceof Error ? e.message : String(e)})`);
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  // Kotlin 플러그인(BundlePickerPlugin)으로 고른다: 영구 읽기 권한을 받아 다음 실행에도 새로고침이 된다.
  const pick = useCallback(async () => {
    const picked = await invoke<{ uri: string | null; persisted: boolean }>("pick_bundle");
    console.log("picked bundle", JSON.stringify(picked));
    if (!picked.uri) return;
    await readFrom(picked.uri);
    if (!picked.persisted) setMessage("이 파일은 영구 권한을 받지 못해, 앱을 다시 켜면 다시 골라야 할 수 있습니다.");
  }, [readFrom]);

  const refresh = useCallback(async () => {
    const uri = savedBundleUri();
    if (uri) await readFrom(uri);
    else await pick();
  }, [readFrom, pick]);

  // 시작: 캐시를 먼저 보여주고, 저장된 주소가 있으면 최신으로 다시 읽는다.
  useEffect(() => {
    void (async () => {
      const cached = await loadCachedBundle().catch(() => null);
      if (cached) await apply(cached.data, cached.readAt, false);
      if (savedBundleUri()) await refresh();
    })();
  }, [apply, refresh]);

  // Android 뒤로 가기: 상세를 열 때 기록을 한 단계 쌓고, 뒤로 가기(popstate)면 목록으로 돌아간다.
  const openDetail = useCallback((it: VocabItem) => {
    history.pushState({ detail: it.highlight.id }, "");
    setSelected(it);
  }, []);
  useEffect(() => {
    const onPop = () => setSelected(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const items = useMemo(() => (loaded ? vocabItems(loaded.library) : []), [loaded]);
  const visible = useMemo(() => filterVocab(items, docFilter, query), [items, docFilter, query]);

  if (selected && loaded) {
    return <Detail item={selected} boards={loaded.boards} onBack={() => history.back()} />;
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
      {!loaded ? (
        <div className="viewer-empty">
          <p>맥에서 내보낸 번들 파일(paperboard-library.zip)을 고르세요.</p>
          <p className="viewer-hint">Google Drive → PaperBoard 폴더</p>
          <button onClick={() => void pick()} disabled={busy}>
            번들 파일 선택
          </button>
        </div>
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
                <button onClick={() => openDetail(it)}>
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
          <footer className="viewer-foot">
            {visible.length}/{items.length}개 ·{" "}
            <button className="link" onClick={() => void pick()}>
              다른 번들 선택
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

function Detail({ item, boards, onBack }: { item: VocabItem; boards: Map<string, string>; onBack(): void }) {
  const h = item.highlight;
  const svg = h.boardSvg ? boards.get(h.boardSvg) : undefined;
  // SVG 는 <img> 로 넣어 스크립트가 실행되지 않게 한다.
  const svgUrl = useMemo(() => (svg ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })) : null), [svg]);
  useEffect(() => () => void (svgUrl && URL.revokeObjectURL(svgUrl)), [svgUrl]);
  return (
    <div className="viewer">
      <header className="viewer-bar">
        <button onClick={onBack}>← 목록</button>
      </header>
      <article className="vocab-detail">
        <blockquote style={{ borderLeftColor: h.color }}>{h.text}</blockquote>
        <p className="vocab-meta">
          {item.documentTitle} · p.{h.pageIndex + 1}
        </p>
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

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
