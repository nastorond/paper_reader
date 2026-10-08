import { confirm, open } from "@tauri-apps/plugin-dialog";
import type { Highlight } from "../logic/types";

// 네이티브 확인 창(macOS·Windows 기본 대화상자)

export function confirmDeleteHighlight(h: Highlight): Promise<boolean> {
  const short = h.text.length > 60 ? `${h.text.slice(0, 60)}…` : h.text;
  return confirm(`“${short}”\n\n이 하이라이트와 노트(보드 포함)를 삭제할까요? 되돌릴 수 없습니다.`, {
    title: "하이라이트 삭제",
    kind: "warning",
    okLabel: "삭제",
    cancelLabel: "취소",
  });
}

export function confirmRepickMissingFile(title: string, path: string): Promise<boolean> {
  return confirm(`파일을 찾을 수 없습니다.\n${path}\n\n옮긴 위치에서 다시 고를까요?`, {
    title,
    kind: "warning",
    okLabel: "다시 고르기",
    cancelLabel: "취소",
  });
}

// 번들·동기화에 쓸 Drive 폴더 고르기. 취소하면 null.
export async function pickDriveFolder(): Promise<string | null> {
  const dir = await open({ directory: true, multiple: false, title: "번들을 저장할 폴더 (예: Google Drive 의 PaperBoard 폴더)" });
  return typeof dir === "string" ? dir : null;
}
