import { getDb } from "./db/tauriDb";
import { deleteHighlight, insertHighlight, updateHighlightColor } from "./db/db";
import { notifyLibraryChanged } from "./libraryEvents";
import { DEFAULT_HIGHLIGHT_COLOR, type Highlight } from "../logic/types";

// 하이라이트 저장·수정·삭제. 바뀌면 libraryEvents 로 알린다(폰 번들·PC 동기화가 다시 쓰도록).

export interface HighlightDraft {
  pageIndex: number;
  rects: Highlight["rects"];
  text: string;
  prefix: string;
  suffix: string;
}

export async function createHighlight(documentId: string, draft: HighlightDraft): Promise<Highlight> {
  const h: Highlight = {
    id: crypto.randomUUID(),
    documentId,
    ...draft,
    color: DEFAULT_HIGHLIGHT_COLOR,
    createdAt: new Date().toISOString(),
  };
  await insertHighlight(await getDb(), h);
  notifyLibraryChanged();
  return h;
}

export async function setHighlightColor(id: string, color: string): Promise<void> {
  await updateHighlightColor(await getDb(), id, color, new Date().toISOString());
  notifyLibraryChanged();
}

// 노트(본문·보드)도 함께 지운다. 하이라이트 행은 PC 간 동기화용 지운 표시로 남는다.
export async function removeHighlight(id: string): Promise<void> {
  await deleteHighlight(await getDb(), id, new Date().toISOString());
  notifyLibraryChanged();
}
