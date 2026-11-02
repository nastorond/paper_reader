import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { sha256Hex } from "../files/hash";
import { parseLocalPdfs, type LocalPdf } from "../../logic/viewer/localPdfs";

// 폰·태블릿 PDF 리더: 기기의 PDF 고르기(Kotlin BundlePickerPlugin.pickPdf), 읽기·해시, 최근 목록 저장.

export interface PickedPdf {
  uri: string | null;
  persisted: boolean;
  name: string | null;
}

export const pickPdfFile = () => invoke<PickedPdf>("pick_pdf");

// 영구 읽기 권한 해제. 실패해도(이미 없음) 목록 정리는 계속한다.
export const releaseUri = (uri: string) => invoke("release_uri", { uri }).catch((e) => console.warn("release_uri", e));

// 파일 내용과 문서 id(내용 해시, PC 와 같은 방식)
export async function readLocalPdf(uri: string): Promise<{ data: Uint8Array; documentId: string }> {
  const data = await readFile(uri);
  return { data, documentId: await sha256Hex(data) };
}

const LIST_KEY = "paperboard.localPdfs";

export function savedLocalPdfs(): LocalPdf[] {
  try {
    return parseLocalPdfs(localStorage.getItem(LIST_KEY));
  } catch {
    return [];
  }
}

export function saveLocalPdfs(list: LocalPdf[]): void {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    /* 저장 실패는 무시: 다음에 다시 고르면 된다 */
  }
}

// iPad 시험판: 웹뷰의 파일 선택 창(파일 앱, Drive 등)으로 PDF 를 고른다. 영구 권한이 없어 목록에 남기지 않는다.
export function pickPdfInWebView(): Promise<{ name: string; data: Uint8Array } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file
        .arrayBuffer()
        .then((buf) => resolve({ name: file.name, data: new Uint8Array(buf) }))
        .catch(reject);
    };
    input.click();
  });
}
