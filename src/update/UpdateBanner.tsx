import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// 자동 업데이트(데스크톱). 앱이 켜질 때 GitHub Releases 의 latest.json 을 확인하고,
// 새 버전이 있으면 화면 아래에 안내를 띄운다. 누르면 받아서 설치하고 다시 시작한다.
// 받은 파일은 tauri.conf.json 의 공개 키로 서명을 확인한 뒤에만 설치된다.
// 네트워크 연결이 없거나 확인에 실패하면 조용히 넘어간다(앱 사용에는 영향 없음).
type State =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; percent: number | null }
  | { kind: "error"; message: string };

export function UpdateBanner() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return; // 개발 실행에서는 확인하지 않는다
    let cancelled = false;
    check()
      .then((update) => {
        if (!cancelled && update) setState({ kind: "available", update });
      })
      .catch((e) => console.warn("update check failed", e));
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async (update: Update) => {
    let total = 0;
    let done = 0;
    setState({ kind: "downloading", percent: null });
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          setState({ kind: "downloading", percent: total ? Math.round((100 * done) / total) : null });
        }
      });
      await relaunch();
    } catch (e) {
      console.error(e);
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  if (state.kind === "idle" || dismissed) return null;
  return (
    <div className="update-banner" role="status">
      {state.kind === "available" && (
        <>
          <span>
            새 버전 <strong>{state.update.version}</strong> 이 있습니다 (지금 {state.update.currentVersion})
          </span>
          <button className="primary" onClick={() => void install(state.update)}>
            업데이트하고 다시 시작
          </button>
          <button onClick={() => setDismissed(true)}>나중에</button>
        </>
      )}
      {state.kind === "downloading" && (
        <span>업데이트 받는 중… {state.percent !== null ? `${state.percent}%` : ""}</span>
      )}
      {state.kind === "error" && (
        <>
          <span>업데이트 실패: {state.message}</span>
          <button onClick={() => setDismissed(true)}>닫기</button>
        </>
      )}
    </div>
  );
}
