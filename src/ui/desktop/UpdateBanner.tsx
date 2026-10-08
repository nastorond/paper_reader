import { useEffect, useState } from "react";
import { checkForUpdate, installUpdate, type Update } from "../../services/update/updater";

// 자동 업데이트 안내(데스크톱). 앱이 켜질 때 새 버전을 확인하고(services/update/updater.ts),
// 있으면 화면 아래에 안내를 띄운다. 누르면 받아서 설치하고 다시 시작한다.
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
    checkForUpdate()
      .then((update) => {
        if (!cancelled && update) setState({ kind: "available", update });
      })
      .catch((e) => console.warn("update check failed", e));
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async (update: Update) => {
    setState({ kind: "downloading", percent: null });
    try {
      await installUpdate(update, (percent) => setState({ kind: "downloading", percent }));
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
