import { readFile } from "@tauri-apps/plugin-fs";
import { loadCachedPdf, saveCachedPdf } from "./cache";

// 폰 "원문 보기"용 PDF 바이트: 폰에 저장해 둔 사본 → 없으면 Drive 폴더의 pdfs/<id>.pdf 를 읽어 저장.
export async function loadDocumentPdf(documentId: string, driveUri: string | undefined): Promise<Uint8Array> {
  const cached = await loadCachedPdf(documentId).catch(() => null);
  if (cached) return cached;
  if (!driveUri) {
    throw new Error('폴더에 이 논문의 PDF 가 없습니다. 맥에서 "PDF 원문도 함께 올리기"를 켜고 내보내 주세요.');
  }
  const data = await readFile(driveUri);
  await saveCachedPdf(documentId, data);
  return data;
}
