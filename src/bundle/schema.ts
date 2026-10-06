// 번들(paperboard-library.zip) 형식. 맥(쓰기, M6)과 폰(읽기, M7)이 함께 쓰는 타입 정의.
// 형식을 바꾸면 BUNDLE_SCHEMA_VERSION 을 올리고, 폰은 모르는 버전이면 안내만 한다.
//
// zip 구성:
//   library.json             BundleLibrary
//   boards/<highlightId>.svg 보드 SVG (보드가 있는 노트만)

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
}

export interface BundleNote {
  html: string; // 렌더링된 HTML(수식은 KaTeX HTML). 폰은 이것만 보여준다.
  json: unknown; // TipTap 문서 JSON(원본 보존용)
  updatedAt: string;
}

export function boardSvgPath(highlightId: string): string {
  return `boards/${highlightId}.svg`;
}
