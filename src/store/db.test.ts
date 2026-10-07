import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  deleteHighlight,
  getNote,
  getSetting,
  listLibrary,
  setSetting,
  insertHighlight,
  listHighlights,
  listRecentDocuments,
  migrate,
  saveNoteBoard,
  saveNoteBody,
  updateHighlightColor,
  upsertDocument,
  type SqlDb,
} from "./db";
import type { Highlight } from "./types";

// node:sqlite 를 tauri-plugin-sql 과 같은 모양으로 감싼다.
function memoryDb(): SqlDb & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  return {
    raw,
    async execute(query, bind = []) {
      return raw.prepare(query).run(...(bind as never[]));
    },
    async select<T>(query: string, bind: unknown[] = []) {
      return raw.prepare(query).all(...(bind as never[])) as T;
    },
  };
}

const highlight = (over: Partial<Highlight> = {}): Highlight => ({
  id: "h1",
  documentId: "doc",
  pageIndex: 1,
  rects: [{ x1: 10.5, y1: 700, x2: 80.25, y2: 712 }],
  text: "측정 모델",
  prefix: "Ionosphere-Free (IF) ",
  suffix: "에 적용하였다.",
  color: "#fde047",
  createdAt: "2026-10-06T12:00:00.000Z",
  ...over,
});

describe("db", () => {
  it("마이그레이션은 여러 번 실행해도 안전하다", async () => {
    const db = memoryDb();
    await migrate(db);
    await migrate(db);
    expect(db.raw.prepare("PRAGMA user_version").get()).toEqual({ user_version: 3 });
  });

  it("문서 upsert: 다시 열면 경로·열람 시각만 갱신", async () => {
    const db = memoryDb();
    await migrate(db);
    const a = await upsertDocument(db, { id: "doc", path: "/a.pdf", title: "A" }, "2026-10-01T00:00:00Z");
    const b = await upsertDocument(db, { id: "doc", path: "/moved/a.pdf", title: "새 이름" }, "2026-10-02T00:00:00Z");
    expect(a.addedAt).toBe("2026-10-01T00:00:00Z");
    expect(b).toEqual({
      id: "doc",
      path: "/moved/a.pdf",
      title: "A",
      addedAt: "2026-10-01T00:00:00Z",
      lastOpenedAt: "2026-10-02T00:00:00Z",
    });
  });

  it("하이라이트 저장 → 같은 값으로 다시 읽힌다(좌표·한글 포함), 페이지 순 정렬", async () => {
    const db = memoryDb();
    await migrate(db);
    await upsertDocument(db, { id: "doc", path: "/a.pdf", title: "A" }, "2026-10-01T00:00:00Z");
    const h2 = highlight({ id: "h2", pageIndex: 3 });
    const h1 = highlight();
    await insertHighlight(db, h2);
    await insertHighlight(db, h1);
    expect(await listHighlights(db, "doc")).toEqual([h1, h2]);
    expect(await listHighlights(db, "other")).toEqual([]);
  });

  it("없는 문서에 하이라이트를 넣으면 거부(외래 키)", async () => {
    const db = memoryDb();
    await migrate(db);
    await expect(insertHighlight(db, highlight({ documentId: "missing" }))).rejects.toThrow();
  });

  it("노트: 없으면 null, 저장하면 덮어쓰기, 하이라이트가 지워지면 같이 지워진다", async () => {
    const db = memoryDb();
    await migrate(db);
    await upsertDocument(db, { id: "doc", path: "/a.pdf", title: "A" }, "2026-10-01T00:00:00Z");
    await insertHighlight(db, highlight());
    expect(await getNote(db, "h1")).toBeNull();

    const body1 = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "첫 메모" }] }] };
    const body2 = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "고친 메모 $x^2$" }] }] };
    await saveNoteBody(db, "h1", body1, "2026-10-01T00:00:01Z");
    await saveNoteBody(db, "h1", body2, "2026-10-01T00:00:02Z");
    expect(await getNote(db, "h1")).toEqual({ highlightId: "h1", body: body2, board: null, updatedAt: "2026-10-01T00:00:02Z" });

    await deleteHighlight(db, "h1", "2026-10-01T00:00:03Z");
    expect(await getNote(db, "h1")).toBeNull();
  });

  it("보드와 본문은 서로 덮어쓰지 않는다(보드를 먼저 저장해도 됨)", async () => {
    const db = memoryDb();
    await migrate(db);
    await upsertDocument(db, { id: "doc", path: "/a.pdf", title: "A" }, "2026-10-01T00:00:00Z");
    await insertHighlight(db, highlight());
    const board = { type: "excalidraw", elements: [{ id: "e1", type: "rectangle", x: 1, y: 2 }], files: {} };
    await saveNoteBoard(db, "h1", board, "2026-10-01T00:00:01Z");
    expect(await getNote(db, "h1")).toEqual({ highlightId: "h1", body: null, board, updatedAt: "2026-10-01T00:00:01Z" });

    const body = { type: "doc", content: [] };
    await saveNoteBody(db, "h1", body, "2026-10-01T00:00:02Z");
    await saveNoteBoard(db, "h1", { ...board, elements: [] }, "2026-10-01T00:00:03Z");
    const note = await getNote(db, "h1");
    expect(note?.body).toEqual(body);
    expect(note?.board).toEqual({ ...board, elements: [] });
  });

  it("색상 변경, 삭제하면 노트(본문·보드)도 함께 지워진다", async () => {
    const db = memoryDb();
    await migrate(db);
    await upsertDocument(db, { id: "doc", path: "/a.pdf", title: "A" }, "2026-10-01T00:00:00Z");
    await insertHighlight(db, highlight());
    await insertHighlight(db, highlight({ id: "h2" }));
    await saveNoteBody(db, "h1", { type: "doc" }, "2026-10-01T00:00:01Z");
    await saveNoteBoard(db, "h1", { elements: [] }, "2026-10-01T00:00:02Z");

    await updateHighlightColor(db, "h1", "#86efac", "2026-10-01T00:00:03Z");
    expect((await listHighlights(db, "doc")).find((h) => h.id === "h1")?.color).toBe("#86efac");

    await deleteHighlight(db, "h1", "2026-10-01T00:00:04Z");
    expect((await listHighlights(db, "doc")).map((h) => h.id)).toEqual(["h2"]);
    expect(await getNote(db, "h1")).toBeNull();
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM notes").get()).toEqual({ n: 0 });
    // 동기화용 지운 표시는 남는다
    expect(db.raw.prepare("SELECT deleted_at, updated_at FROM highlights WHERE id = 'h1'").get()).toEqual({
      deleted_at: "2026-10-01T00:00:04Z",
      updated_at: "2026-10-01T00:00:04Z",
    });
  });

  it("최근 문서: 최근 연 순서, 하이라이트 개수, 개수 제한", async () => {
    const db = memoryDb();
    await migrate(db);
    await upsertDocument(db, { id: "a", path: "/a.pdf", title: "A" }, "2026-10-01T00:00:00Z");
    await upsertDocument(db, { id: "b", path: "/b.pdf", title: "B" }, "2026-10-02T00:00:00Z");
    await upsertDocument(db, { id: "a", path: "/a.pdf", title: "A" }, "2026-10-03T00:00:00Z"); // 다시 열기
    await insertHighlight(db, highlight({ id: "h1", documentId: "a" }));
    await insertHighlight(db, highlight({ id: "h2", documentId: "a" }));
    const recent = await listRecentDocuments(db);
    expect(recent.map((d) => [d.id, d.highlightCount])).toEqual([
      ["a", 2],
      ["b", 0],
    ]);
    expect(await listRecentDocuments(db, 1)).toHaveLength(1);
  });

  it("설정 저장·덮어쓰기", async () => {
    const db = memoryDb();
    await migrate(db);
    expect(await getSetting(db, "bundle.dir")).toBeNull();
    await setSetting(db, "bundle.dir", "/a");
    await setSetting(db, "bundle.dir", "/b");
    expect(await getSetting(db, "bundle.dir")).toBe("/b");
  });

  it("라이브러리 전체 읽기(모든 문서)", async () => {
    const db = memoryDb();
    await migrate(db);
    await upsertDocument(db, { id: "a", path: "/a.pdf", title: "A" }, "2026-10-01T00:00:00Z");
    await upsertDocument(db, { id: "b", path: "/b.pdf", title: "B" }, "2026-10-02T00:00:00Z");
    await insertHighlight(db, highlight({ id: "h1", documentId: "a" }));
    await insertHighlight(db, highlight({ id: "h2", documentId: "b" }));
    await saveNoteBody(db, "h2", { type: "doc" }, "2026-10-02T00:00:01Z");
    const lib = await listLibrary(db);
    expect(lib.documents.map((d) => d.id)).toEqual(["b", "a"]);
    expect(lib.highlights.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(lib.notes.map((n) => n.highlightId)).toEqual(["h2"]);
  });
});
