import type { DocumentRecord, Highlight, Note, Rect } from "../../logic/types";

// tauri-plugin-sql 의 Database 와 같은 모양의 최소 인터페이스.
// 앱에서는 플러그인을, 테스트에서는 node:sqlite 어댑터를 넣는다.
// placeholder 는 `?` 를 쓴다(sqlx 와 node:sqlite 양쪽에서 동작).
export interface SqlDb {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

// 스키마 버전별 마이그레이션. 순서대로 한 번씩만 실행되고 PRAGMA user_version 에 기록된다.
// 이미 배포된 항목은 고치지 말고 새 항목을 뒤에 추가한다.
export const MIGRATIONS: string[] = [
  `CREATE TABLE documents (
     id TEXT PRIMARY KEY,
     path TEXT NOT NULL,
     title TEXT NOT NULL,
     added_at TEXT NOT NULL,
     last_opened_at TEXT NOT NULL
   );
   CREATE TABLE highlights (
     id TEXT PRIMARY KEY,
     document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     page_index INTEGER NOT NULL,
     rects TEXT NOT NULL,
     text TEXT NOT NULL,
     prefix TEXT NOT NULL,
     suffix TEXT NOT NULL,
     color TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE INDEX highlights_document ON highlights(document_id, page_index);
   CREATE TABLE notes (
     highlight_id TEXT PRIMARY KEY REFERENCES highlights(id) ON DELETE CASCADE,
     body TEXT NOT NULL,
     board TEXT,
     updated_at TEXT NOT NULL
   );`,
  // v2 (M6): 앱 설정(번들 내보내기 폴더, 자동 내보내기 등)
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  // v3: PC 간 동기화(src/logic/sync/merge.ts). 항목별 수정 시각, 지운 표시(tombstone), 겹친 수정 백업.
  // 하이라이트는 지워도 행을 남기고 deleted_at 을 기록한다(다른 PC 의 사본이 되살아나지 않게).
  `ALTER TABLE highlights ADD COLUMN updated_at TEXT;
   UPDATE highlights SET updated_at = created_at;
   ALTER TABLE highlights ADD COLUMN deleted_at TEXT;
   ALTER TABLE notes ADD COLUMN body_updated_at TEXT;
   ALTER TABLE notes ADD COLUMN board_updated_at TEXT;
   UPDATE notes SET body_updated_at = CASE WHEN body = 'null' THEN NULL ELSE updated_at END,
                    board_updated_at = CASE WHEN board IS NULL THEN NULL ELSE updated_at END;
   CREATE TABLE note_backups (
     id TEXT PRIMARY KEY,
     highlight_id TEXT NOT NULL,
     field TEXT NOT NULL,
     content TEXT,
     content_updated_at TEXT,
     replaced_at TEXT NOT NULL,
     other_device TEXT NOT NULL
   );`,
];

export async function migrate(db: SqlDb): Promise<void> {
  const [{ user_version: current }] = await db.select<{ user_version: number }[]>("PRAGMA user_version");
  for (let v = current; v < MIGRATIONS.length; v++) {
    // 문장을 하나씩 실행한다(드라이버에 따라 여러 문장을 한 번에 못 받는다).
    for (const stmt of MIGRATIONS[v].split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.execute(stmt);
    }
    await db.execute(`PRAGMA user_version = ${v + 1}`);
  }
}

// 문서를 열 때마다 호출. 처음이면 추가하고, 이미 있으면 경로·최근 열람 시각을 갱신한다.
// 제목은 사용자가 바꿀 수 있게(M5) 처음 값을 유지한다.
export async function upsertDocument(
  db: SqlDb,
  doc: { id: string; path: string; title: string },
  now: string,
): Promise<DocumentRecord> {
  await db.execute(
    `INSERT INTO documents (id, path, title, added_at, last_opened_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET path = excluded.path, last_opened_at = excluded.last_opened_at`,
    [doc.id, doc.path, doc.title, now, now],
  );
  const rows = await db.select<DocumentRow[]>("SELECT * FROM documents WHERE id = ?", [doc.id]);
  return toDocument(rows[0]);
}

export interface RecentDocument extends DocumentRecord {
  highlightCount: number;
}

// 최근에 연 문서(최근 순). 하이라이트 개수를 함께 준다.
export async function listRecentDocuments(db: SqlDb, limit = 20): Promise<RecentDocument[]> {
  const rows = await db.select<(DocumentRow & { highlight_count: number })[]>(
    `SELECT d.*, (SELECT COUNT(*) FROM highlights h WHERE h.document_id = d.id AND h.deleted_at IS NULL) AS highlight_count
     FROM documents d ORDER BY d.last_opened_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({ ...toDocument(r), highlightCount: Number(r.highlight_count) }));
}

// 번들 내보내기용: 라이브러리 전체(모든 문서·하이라이트·노트).
export async function listLibrary(db: SqlDb): Promise<{ documents: DocumentRecord[]; highlights: Highlight[]; notes: Note[] }> {
  const docs = await db.select<DocumentRow[]>("SELECT * FROM documents ORDER BY last_opened_at DESC");
  const hls = await db.select<HighlightRow[]>(
    "SELECT * FROM highlights WHERE deleted_at IS NULL ORDER BY document_id, page_index, created_at",
  );
  const notes = await db.select<NoteRow[]>(
    "SELECT n.* FROM notes n JOIN highlights h ON h.id = n.highlight_id WHERE h.deleted_at IS NULL",
  );
  return { documents: docs.map(toDocument), highlights: hls.map(toHighlight), notes: notes.map(toNote) };
}

export async function getSetting(db: SqlDb, key: string): Promise<string | null> {
  const rows = await db.select<{ value: string }[]>("SELECT value FROM settings WHERE key = ?", [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(db: SqlDb, key: string, value: string): Promise<void> {
  await db.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    key,
    value,
  ]);
}

export async function insertHighlight(db: SqlDb, h: Highlight): Promise<void> {
  await db.execute(
    `INSERT INTO highlights (id, document_id, page_index, rects, text, prefix, suffix, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [h.id, h.documentId, h.pageIndex, JSON.stringify(h.rects), h.text, h.prefix, h.suffix, h.color, h.createdAt, h.createdAt],
  );
}

export async function listHighlights(db: SqlDb, documentId: string): Promise<Highlight[]> {
  const rows = await db.select<HighlightRow[]>(
    "SELECT * FROM highlights WHERE document_id = ? AND deleted_at IS NULL ORDER BY page_index, created_at",
    [documentId],
  );
  return rows.map(toHighlight);
}

export async function updateHighlightColor(db: SqlDb, id: string, color: string, now: string): Promise<void> {
  await db.execute("UPDATE highlights SET color = ?, updated_at = ? WHERE id = ?", [color, now, id]);
}

// 하이라이트 삭제. 행은 남기고 지운 표시(deleted_at)를 한다 — PC 간 동기화에서 삭제를 전파하기 위해.
// 노트(본문·보드)는 바로 지운다.
export async function deleteHighlight(db: SqlDb, id: string, now: string): Promise<void> {
  await db.execute("UPDATE highlights SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  await db.execute("DELETE FROM notes WHERE highlight_id = ?", [id]);
}

export async function getNote(db: SqlDb, highlightId: string): Promise<Note | null> {
  const rows = await db.select<NoteRow[]>("SELECT * FROM notes WHERE highlight_id = ?", [highlightId]);
  return rows[0] ? toNote(rows[0]) : null;
}

// 노트 본문(TipTap JSON) 저장. 보드는 건드리지 않는다.
export async function saveNoteBody(db: SqlDb, highlightId: string, body: unknown, now: string): Promise<void> {
  await db.execute(
    `INSERT INTO notes (highlight_id, body, board, updated_at, body_updated_at) VALUES (?, ?, NULL, ?, ?)
     ON CONFLICT(highlight_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at,
       body_updated_at = excluded.body_updated_at`,
    [highlightId, JSON.stringify(body), now, now],
  );
}

// 보드(Excalidraw 장면 JSON) 저장. 노트 본문이 아직 없으면 null 로 둔다.
export async function saveNoteBoard(db: SqlDb, highlightId: string, board: unknown, now: string): Promise<void> {
  await db.execute(
    `INSERT INTO notes (highlight_id, body, board, updated_at, board_updated_at) VALUES (?, 'null', ?, ?, ?)
     ON CONFLICT(highlight_id) DO UPDATE SET board = excluded.board, updated_at = excluded.updated_at,
       board_updated_at = excluded.board_updated_at`,
    [highlightId, JSON.stringify(board), now, now],
  );
}

interface NoteRow {
  highlight_id: string;
  body: string;
  board: string | null;
  updated_at: string;
}

function toNote(r: NoteRow): Note {
  return {
    highlightId: r.highlight_id,
    body: JSON.parse(r.body),
    board: r.board === null ? null : JSON.parse(r.board),
    updatedAt: r.updated_at,
  };
}

interface DocumentRow {
  id: string;
  path: string;
  title: string;
  added_at: string;
  last_opened_at: string;
}

interface HighlightRow {
  id: string;
  document_id: string;
  page_index: number;
  rects: string;
  text: string;
  prefix: string;
  suffix: string;
  color: string;
  created_at: string;
}

function toDocument(r: DocumentRow): DocumentRecord {
  return { id: r.id, path: r.path, title: r.title, addedAt: r.added_at, lastOpenedAt: r.last_opened_at };
}

function toHighlight(r: HighlightRow): Highlight {
  return {
    id: r.id,
    documentId: r.document_id,
    pageIndex: r.page_index,
    rects: JSON.parse(r.rects) as Rect[],
    text: r.text,
    prefix: r.prefix,
    suffix: r.suffix,
    color: r.color,
    createdAt: r.created_at,
  };
}
