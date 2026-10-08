import { useCallback, useEffect, useRef, useState } from "react";
import { readBundle } from "../../logic/bundle/bundleZip";
import { BUNDLE_SCHEMA_VERSION, type BundleLibrary } from "../../logic/bundle/schema";
import { describeDiff, diffLibraries, shouldAutoRefresh } from "../../logic/viewer/diff";
import { loadCachedBundle, saveCachedBundle, savedSource, saveSource, type BundleSource } from "../../services/viewer/cache";
import { pickBundleFile, pickFolder, readSource } from "../../services/viewer/source";

export interface Loaded {
  library: BundleLibrary;
  boards: Map<string, string>;
  pdfUris: Map<string, string>; // 폴더 연결일 때 PDF 원문 주소
  readAt: string;
}

type Report = "always" | "changes" | "none";

// 폰 뷰어의 번들 읽기: 폴더/파일 연결, 새로고침(버튼·시작·앱 복귀), 캐시, 바뀐 내용 안내.
export function useBundleSource() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [source, setSource] = useState<BundleSource | null>(() => savedSource());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  return { loaded, source, busy, message, notice, connectFolder, pickFile, refresh };
}
