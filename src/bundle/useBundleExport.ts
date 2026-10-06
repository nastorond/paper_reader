import { useCallback, useEffect, useMemo, useState } from "react";
import { getDb } from "../store/tauriDb";
import { getSetting, setSetting } from "../store/db";
import { createDebouncedSaver } from "../note/debouncedSaver";
import { exportBundleTo, type BundleExportResult } from "./exportBundle";
import { onLibraryChanged } from "./libraryEvents";
import { devLog } from "../dev/devLog";

const KEY_DIR = "bundle.dir";
const KEY_AUTO = "bundle.auto";
const KEY_LAST = "bundle.lastExportedAt";

export interface BundleState {
  dir: string | null;
  auto: boolean;
  lastExportedAt: string | null;
  status: "idle" | "exporting" | "error";
  lastResult: BundleExportResult | null;
  error: string | null;
}

// 번들 내보내기 설정(DB settings 테이블)과 실행. auto 가 켜져 있으면 라이브러리가 바뀐 뒤 5초 뒤에 다시 쓴다.
export function useBundleExport() {
  const [state, setState] = useState<BundleState>({
    dir: null,
    auto: false,
    lastExportedAt: null,
    status: "idle",
    lastResult: null,
    error: null,
  });

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const [dir, auto, last] = await Promise.all([getSetting(db, KEY_DIR), getSetting(db, KEY_AUTO), getSetting(db, KEY_LAST)]);
      // 개발 자가 테스트: VITE_DEV_BUNDLE_DIR 를 내보내기 폴더로 쓰고 자동 내보내기를 켠다.
      const devDir = import.meta.env.DEV ? import.meta.env.VITE_DEV_BUNDLE_DIR : undefined;
      if (devDir) {
        setState((s) => ({ ...s, dir: devDir, auto: true, lastExportedAt: last }));
        return;
      }
      setState((s) => ({ ...s, dir, auto: auto === "1", lastExportedAt: last }));
    })().catch(console.error);
  }, []);

  const exportNow = useCallback(async (dir: string | null) => {
    if (!dir) return;
    setState((s) => ({ ...s, status: "exporting", error: null }));
    try {
      const result = await exportBundleTo(dir);
      const at = new Date().toISOString();
      await setSetting(await getDb(), KEY_LAST, at);
      setState((s) => ({ ...s, status: "idle", lastExportedAt: at, lastResult: result }));
      devLog(`bundle exported ${result.path} ${result.bytes}B highlights=${result.highlights} boards=${result.boards}`);
    } catch (e) {
      console.error(e);
      setState((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);

  const setDir = useCallback(async (dir: string) => {
    await setSetting(await getDb(), KEY_DIR, dir);
    setState((s) => ({ ...s, dir }));
  }, []);

  const setAuto = useCallback(async (auto: boolean) => {
    await setSetting(await getDb(), KEY_AUTO, auto ? "1" : "0");
    setState((s) => ({ ...s, auto }));
  }, []);

  // 자동 내보내기: 변경이 멈추고 5초 뒤 한 번
  const autoSaver = useMemo(() => createDebouncedSaver<string>((dir) => exportNow(dir), 5000), [exportNow]);
  useEffect(() => {
    if (!state.auto || !state.dir) return;
    const dir = state.dir;
    return onLibraryChanged(() => autoSaver.schedule(dir));
  }, [state.auto, state.dir, autoSaver]);

  return { state, exportNow: () => exportNow(state.dir), setDir, setAuto };
}
