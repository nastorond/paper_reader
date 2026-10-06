import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

export interface OpenedFile {
  path: string;
  name: string;
  data: Uint8Array;
}

// 파일 열기 다이얼로그. 취소하면 null.
export async function pickPdfPath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

export function fileNameOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.pdf$/i, "");
}

export async function readPdfFile(path: string): Promise<OpenedFile> {
  const data = await readFile(path);
  return { path, name: fileNameOf(path), data };
}
