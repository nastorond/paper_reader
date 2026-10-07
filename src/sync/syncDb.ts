import type { SqlDb } from "../store/db";
import type { MergePlan, SyncData } from "./merge";

// DB ↔ 동기화 데이터(SyncData) 변환. 지운 하이라이트(지운 표시)도 포함한다.

interface Row {
  [k: string]: unknown;
}

const parse = (v: unknown) => (v === null || v === undefined ? null : JSON.parse(String(v)));

export async function readSyncData(db: SqlDb): Promise<SyncData> {
  const docs = await db.select<Row[]>("SELECT id, title, added_at, last_opened_at FROM documents");
  const hls = await db.select<Row[]>("SELECT * FROM highlights");
  const notes = await db.select<Row[]>("SELECT * FROM notes");
  return {
    documents: docs.map((d) => ({
      id: String(d.id),
      title: String(d.title),
      addedAt: String(d.added_at),
      lastOpenedAt: String(d.last_opened_at),
    })),
    highlights: hls.map((h) => ({
      id: String(h.id),
      documentId: String(h.document_id),
      pageIndex: Number(h.page_index),
      rects: JSON.parse(String(h.rects)),
      text: String(h.text),
      prefix: String(h.prefix),
      suffix: String(h.suffix),
      color: String(h.color),
      createdAt: String(h.created_at),
      updatedAt: String(h.updated_at ?? h.created_at),
      deletedAt: (h.deleted_at as string | null) ?? null,
    })),
    notes: notes.map((n) => ({
      highlightId: String(n.highlight_id),
      body: parse(n.body),
      bodyUpdatedAt: (n.body_updated_at as string | null) ?? null,
      board: parse(n.board),
      boardUpdatedAt: (n.board_updated_at as string | null) ?? null,
    })),
  };
}

// 합치기 결과를 내 DB 에 적용한다. 문서 경로는 이 PC 의 값을 유지한다(다른 PC 에서 처음 온 문서는 빈 경로).
export async function applyPlan(db: SqlDb, plan: MergePlan, now: string, otherDevice: string): Promise<void> {
  for (const d of plan.documents) {
    await db.execute(
      `INSERT INTO documents (id, path, title, added_at, last_opened_at) VALUES (?, '', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET added_at = excluded.added_at, last_opened_at = excluded.last_opened_at`,
      [d.id, d.title, d.addedAt, d.lastOpenedAt],
    );
  }
  for (const h of plan.highlights) {
    await db.execute(
      `INSERT INTO highlights (id, document_id, page_index, rects, text, prefix, suffix, color, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET page_index = excluded.page_index, rects = excluded.rects, text = excluded.text,
         prefix = excluded.prefix, suffix = excluded.suffix, color = excluded.color,
         updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
      [
        h.id,
        h.documentId,
        h.pageIndex,
        JSON.stringify(h.rects),
        h.text,
        h.prefix,
        h.suffix,
        h.color,
        h.createdAt,
        h.updatedAt,
        h.deletedAt,
      ],
    );
  }
  for (const b of plan.backups) {
    await db.execute(
      `INSERT INTO note_backups (id, highlight_id, field, content, content_updated_at, replaced_at, other_device)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), b.highlightId, b.field, JSON.stringify(b.content), b.updatedAt, now, otherDevice],
    );
  }
  for (const id of plan.deleteNotes) {
    await db.execute("DELETE FROM notes WHERE highlight_id = ?", [id]);
  }
  for (const n of plan.notes) {
    // 행이 없으면 만들고(본문은 'null' 로 시작), 바뀐 필드만 덮어쓴다.
    await db.execute(
      `INSERT INTO notes (highlight_id, body, board, updated_at) VALUES (?, 'null', NULL, ?) ON CONFLICT(highlight_id) DO NOTHING`,
      [n.highlightId, now],
    );
    if (n.body) {
      await db.execute("UPDATE notes SET body = ?, body_updated_at = ?, updated_at = ? WHERE highlight_id = ?", [
        JSON.stringify(n.body.value),
        n.body.updatedAt,
        n.body.updatedAt,
        n.highlightId,
      ]);
    }
    if (n.board) {
      await db.execute("UPDATE notes SET board = ?, board_updated_at = ?, updated_at = ? WHERE highlight_id = ?", [
        n.board.value === null ? null : JSON.stringify(n.board.value),
        n.board.updatedAt,
        n.board.updatedAt,
        n.highlightId,
      ]);
    }
  }
}
