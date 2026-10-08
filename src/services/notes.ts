import { getDb } from "./db/tauriDb";
import { getNote, saveNoteBoard, saveNoteBody } from "./db/db";
import { notifyLibraryChanged } from "./libraryEvents";
import type { Note } from "../logic/types";

// 노트(본문·보드) 읽기·저장. 저장하면 libraryEvents 로 알린다.

export async function loadNote(highlightId: string): Promise<Note | null> {
  return getNote(await getDb(), highlightId);
}

export async function saveBody(highlightId: string, body: unknown): Promise<void> {
  await saveNoteBody(await getDb(), highlightId, body, new Date().toISOString());
  notifyLibraryChanged();
}

export async function saveBoard(highlightId: string, board: unknown): Promise<void> {
  await saveNoteBoard(await getDb(), highlightId, board, new Date().toISOString());
  notifyLibraryChanged();
}
