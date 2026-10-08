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

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function extOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export function isImagePath(path: string): boolean {
  return extOf(path) in IMAGE_TYPES;
}

// 보드에 넣을 이미지 파일을 읽어 File 로 만든다.
export async function readImageFile(path: string): Promise<File> {
  const data = await readFile(path);
  const name = path.split(/[\\/]/).pop() ?? "image";
  return new File([data], name, { type: IMAGE_TYPES[extOf(path)] });
}

export function fileNameOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.pdf$/i, "");
}

export async function readPdfFile(path: string): Promise<OpenedFile> {
  const data = await readFile(path);
  return { path, name: fileNameOf(path), data };
}
