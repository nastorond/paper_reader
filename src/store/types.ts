// CLAUDE.md "데이터 모델" 과 같은 구조. 시각은 ISO 8601 문자열.

// PDF 사용자 공간(포인트, y 위로 증가) 의 사각형. 확대율과 무관하다.
export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DocumentRecord {
  id: string; // PDF 파일 내용의 SHA-256 (hex)
  path: string; // 마지막으로 연 경로
  title: string;
  addedAt: string;
  lastOpenedAt: string;
}

export interface Highlight {
  id: string; // uuid
  documentId: string;
  pageIndex: number; // 0부터
  rects: Rect[];
  text: string;
  prefix: string; // 앞 32자 문맥
  suffix: string; // 뒤 32자 문맥
  color: string;
  createdAt: string;
}

export interface Note {
  highlightId: string;
  body: unknown; // TipTap 문서 JSON
  board: unknown | null; // Excalidraw scene JSON
  updatedAt: string;
}

export const DEFAULT_HIGHLIGHT_COLOR = "#fde047";
