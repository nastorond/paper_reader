import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getDb } from "../db/tauriDb";
import { getNote } from "../db/db";
import type { Highlight } from "../../logic/types";
import { notesToMarkdown, safeFileName } from "../../logic/export/notesMarkdown";
import { formatDate } from "../../logic/format";

// 현재 문서의 노트 전체를 마크다운으로 만든다(하이라이트 순서는 목록과 같게 넘겨받는다).
export async function buildNotesMarkdown(doc: { title: string; path: string }, ordered: Highlight[]): Promise<string> {
  const db = await getDb();
  const items = await Promise.all(ordered.map(async (h) => ({ highlight: h, note: await getNote(db, h.id) })));
  return notesToMarkdown(doc, items, formatDate(new Date().toISOString()));
}

// 저장 위치를 고르게 하고 파일로 쓴다. 취소하면 null.
export async function exportNotesToFile(doc: { title: string; path: string }, ordered: Highlight[]): Promise<string | null> {
  const markdown = await buildNotesMarkdown(doc, ordered);
  const path = await save({
    title: "노트를 마크다운으로 내보내기",
    defaultPath: `${safeFileName(doc.title)}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!path) return null;
  await writeTextFile(path, markdown);
  return path;
}
