import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getDb } from "../../services/db/tauriDb";
import { getSetting, setSetting } from "../../services/db/db";
import { createDebouncedSaver } from "../../logic/debouncedSaver";
import { notifyLibraryChanged, onLibraryChanged } from "../../services/libraryEvents";
import { getDevice, mergeOthers, writeMySnapshot, type Device, type MergeResult } from "../../services/sync/syncFiles";
import { devLog } from "../../dev/devLog";

const KEY_ENABLED = "sync.enabled";
const MERGE_INTERVAL_MS = 3 * 60_000; // 켜 둔 동안 3분마다 다른 PC 파일 확인
const MIN_MERGE_GAP_MS = 20_000; // 창으로 돌아왔을 때는 20초 안에 확인했으면 건너뜀
const WRITE_DEBOUNCE_MS = 3_000; // 고친 뒤 3초 뒤 내 파일 쓰기

export interface SyncState {
  enabled: boolean;
  device: Device | null;
  lastSyncAt: string | null;
  status: "idle" | "syncing" | "error";
  error: string | null;
}

// PC 간 동기화(같은 Drive 폴더의 sync/). dir 은 번들 폴더.
// onRemoteApplied: 다른 PC 내용을 합쳐 DB 가 바뀌었을 때(화면 다시 읽기·안내용)
export function useSync(dir: string | null, onRemoteApplied: (results: MergeResult[]) => void) {
  const [state, setState] = useState<SyncState>({
    enabled: false,
    device: null,
    lastSyncAt: null,
    status: "idle",
    error: null,
  });
  const onAppliedRef = useRef(onRemoteApplied);
  onAppliedRef.current = onRemoteApplied;
  const lastMergeRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const [enabled, device] = await Promise.all([getDb().then((db) => getSetting(db, KEY_ENABLED)), getDevice()]);
      const devOn = import.meta.env.DEV && !!import.meta.env.VITE_DEV_SYNC;
      setState((s) => ({ ...s, enabled: enabled === "1" || devOn, device }));
    })().catch(console.error);
  }, []);

  const active = state.enabled && !!dir && !!state.device;

  const write = useCallback(async () => {
    if (!dir || !state.device) return;
    try {
      await writeMySnapshot(dir, state.device);
      setState((s) => ({ ...s, lastSyncAt: new Date().toISOString(), status: "idle", error: null }));
    } catch (e) {
      console.error("sync write failed", e);
      setState((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : String(e) }));
    }
  }, [dir, state.device]);

  // 다른 PC 파일을 읽어 합치고, 바뀐 게 있으면 내 파일도 다시 쓴다(서로 같은 상태가 되면 멈춘다).
  const merge = useCallback(async () => {
    if (!dir || !state.device || busyRef.current) return;
    busyRef.current = true;
    lastMergeRef.current = Date.now();
    setState((s) => ({ ...s, status: "syncing" }));
    try {
      const results = await mergeOthers(dir, state.device);
      const changed = results.filter((r) => r.message);
      devLog(`sync merged: ${results.map((r) => `${r.deviceName}:${JSON.stringify(r.plan.stats)}`).join(" ") || "nothing new"}`);
      if (changed.length > 0) {
        onAppliedRef.current(changed);
        notifyLibraryChanged(); // 폰용 번들도 최신으로(이 PC 에서 번들 자동 내보내기를 켠 경우)
      }
      await writeMySnapshot(dir, state.device);
      setState((s) => ({ ...s, lastSyncAt: new Date().toISOString(), status: "idle", error: null }));
    } catch (e) {
      console.error("sync merge failed", e);
      setState((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : String(e) }));
    } finally {
      busyRef.current = false;
    }
  }, [dir, state.device]);

  // 켜질 때(앱 시작·설정 켬) 한 번, 이후 3분마다
  useEffect(() => {
    if (!active) return;
    void merge();
    const t = setInterval(() => void merge(), MERGE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [active, merge]);

  // 창으로 돌아왔을 때(다른 PC 를 쓰다 온 경우)
  useEffect(() => {
    if (!active) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastMergeRef.current > MIN_MERGE_GAP_MS) void merge();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [active, merge]);

  // 내가 고치면 3초 뒤 내 파일 쓰기
  const writer = useMemo(() => createDebouncedSaver<null>(() => write(), WRITE_DEBOUNCE_MS), [write]);
  useEffect(() => {
    if (!active) return;
    return onLibraryChanged(() => writer.schedule(null));
  }, [active, writer]);

  // 창을 닫기 전에 아직 안 쓴 변경을 마저 쓴다(PC 를 바꿔 쓰기 직전에 닫는 경우)
  useEffect(() => {
    if (!active) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWindow()
      .onCloseRequested(async () => {
        if (writer.pending()) await writer.flush();
      })
      .then((fn) => (disposed ? fn() : (unlisten = fn)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [active, writer]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    await setSetting(await getDb(), KEY_ENABLED, enabled ? "1" : "0");
    setState((s) => ({ ...s, enabled }));
  }, []);

  return { state, active, syncNow: merge, setEnabled };
}
