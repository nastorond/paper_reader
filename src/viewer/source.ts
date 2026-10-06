import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { BUNDLE_FILE_NAME, PDF_DIR } from "../bundle/schema";
import type { BundleSource } from "./cache";

// Kotlin 플러그인(BundlePickerPlugin) 호출과, 고른 곳에서 번들·PDF 읽기.

interface FolderItem {
  documentId: string;
  name: string;
  mime: string | null;
  size: number | null;
  uri: string;
}

export interface Picked {
  uri: string | null;
  persisted: boolean;
}

export const pickFolder = () => invoke<Picked>("pick_folder");
export const pickBundleFile = () => invoke<Picked>("pick_bundle");

async function listFolder(treeUri: string, documentId: string | null): Promise<FolderItem[]> {
  return (await invoke<{ items: FolderItem[] }>("list_folder", { treeUri, documentId })).items;
}

export interface SourceRead {
  data: Uint8Array;
  // PDF 원문 파일 이름(<문서 id>.pdf) → 읽을 주소. 폴더 연결일 때만.
  pdfUris: Map<string, string>;
}

export async function readSource(src: BundleSource): Promise<SourceRead> {
  if (src.kind === "file") return { data: await readFile(src.uri), pdfUris: new Map() };
  const items = await listFolder(src.treeUri, null);
  const zip = items.find((i) => i.name === BUNDLE_FILE_NAME);
  if (!zip) throw new Error(`이 폴더에 ${BUNDLE_FILE_NAME} 이 없습니다. 맥에서 내보낸 PaperBoard 폴더를 골라 주세요.`);
  const pdfUris = new Map<string, string>();
  const pdfDir = items.find((i) => i.name === PDF_DIR && i.mime === "vnd.android.document/directory");
  if (pdfDir) {
    for (const p of await listFolder(src.treeUri, pdfDir.documentId)) pdfUris.set(p.name, p.uri);
  }
  return { data: await readFile(zip.uri), pdfUris };
}
