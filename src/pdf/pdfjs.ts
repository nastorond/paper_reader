import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
// `?url` 은 Vite 기능: 워커 파일을 번들 자산으로 내보내고 그 URL 문자열을 준다.
// pdf.js 는 이 URL 로 Web Worker 를 띄워 파싱을 메인 스레드 밖에서 한다.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";

GlobalWorkerOptions.workerSrc = workerUrl;

// vite.config.ts 의 copyLibraryAssets 와 짝을 이룬다.
const PDFJS_ASSET_BASE = import.meta.env.DEV ? "/node_modules/pdfjs-dist/" : "/pdfjs/";

export async function loadPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({
    data,
    cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
    standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
    wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
    iccUrl: `${PDFJS_ASSET_BASE}iccs/`,
  }).promise;
}

export type { PDFDocumentProxy };
