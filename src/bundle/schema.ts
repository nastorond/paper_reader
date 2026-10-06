// 번들(paperboard-library.zip) 형식. 맥(쓰기, M6)과 폰(읽기, M7)이 함께 쓰는 타입 정의.
// 형식을 바꾸면 BUNDLE_SCHEMA_VERSION 을 올리고, 폰은 모르는 버전이면 안내만 한다.
// 단, 선택(optional) 필드를 "추가"만 하는 변경은 예전 폰 앱도 무시하고 읽을 수 있으므로 버전을 유지한다.
//
// zip 구성:
//   library.json             BundleLibrary
//   boards/<highlightId>.svg 보드 SVG (보드가 있는 노트만)
//
// PDF 원문(선택, "PDF 원문도 함께 올리기"): zip 이 아니라 같은 폴더의 pdfs/<문서 id>.pdf 로 따로 둔다.
// 내용이 바뀌지 않으므로 처음 한 번만 복사되고, 번들 zip 은 가볍게 유지된다.

export const BUNDLE_SCHEMA_VERSION = 1;
export const BUNDLE_FILE_NAME = "paperboard-library.zip";
export const LIBRARY_JSON = "library.json";

export interface BundleLibrary {
  schemaVersion: number;
  app: "PaperBoard";
  exportedAt: string; // ISO 8601
  documents: BundleDocument[];
  highlights: BundleHighlight[];
}

export interface BundleDocument {
  id: string; // PDF 내용 SHA-256
  title: string;
  fileName: string; // 원본 파일 이름(경로 없이)
  addedAt: string;
  lastOpenedAt: string;
  // PDF 원문의 번들 폴더 기준 경로(pdfs/<id>.pdf). 올리지 않았으면 없음.
  pdf?: string | null;
}

export interface BundleHighlight {
  id: string;
  documentId: string;
  pageIndex: number; // 0부터
  text: string;
  prefix: string;
  suffix: string;
  color: string;
  createdAt: string;
  note: BundleNote | null;
  // 보드 SVG 의 zip 안 경로(없으면 null)
  boardSvg: string | null;
  // PDF 사용자 공간 좌표(폰에서 원문 위에 하이라이트를 그릴 때). 예전 번들에는 없을 수 있다.
  rects?: { x1: number; y1: number; x2: number; y2: number }[];
}

export interface BundleNote {
  html: string; // 렌더링된 HTML(수식은 KaTeX HTML). 폰은 이것만 보여준다.
  json: unknown; // TipTap 문서 JSON(원본 보존용)
  updatedAt: string;
}

export const PDF_DIR = "pdfs";

export function pdfPath(documentId: string): string {
  return `${PDF_DIR}/${documentId}.pdf`;
}

export function boardSvgPath(highlightId: string): string {
  return `boards/${highlightId}.svg`;
}
