import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// 자동 업데이트(데스크톱). GitHub Releases 의 latest.json 을 확인하고(tauri.conf.json plugins.updater),
// 받은 파일은 공개 키로 서명을 확인한 뒤에만 설치한다.

export type { Update };

export function checkForUpdate(): Promise<Update | null> {
  return check();
}

// 받아서 설치하고 다시 시작한다. onProgress: 0~100(전체 크기를 모르면 null)
export async function installUpdate(update: Update, onProgress: (percent: number | null) => void): Promise<void> {
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((ev) => {
    if (ev.event === "Started") total = ev.data.contentLength ?? 0;
    else if (ev.event === "Progress") {
      done += ev.data.chunkLength;
      onProgress(total ? Math.round((100 * done) / total) : null);
    }
  });
  await relaunch();
}
