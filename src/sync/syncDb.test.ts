import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  MIGRATIONS,
  deleteHighlight,
  getNote,
  insertHighlight,
  listHighlights,
  migrate,
  saveNoteBoard,
  saveNoteBody,
  updateHighlightColor,
  upsertDocument,
  type SqlDb,
} from "../store/db";
import { applyPlan, readSyncData } from "./syncDb";
import { mergeRemote } from "./merge";
import type { Highlight } from "../store/types";

function memoryDb(): SqlDb & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  return {
    raw,
    async execute(q, b = []) {
      return raw.prepare(q).run(...(b as never[]));
    },
    async select<T>(q: string, b: unknown[] = []) {
      return raw.prepare(q).all(...(b as never[])) as T;
    },
  };
}

const h = (id: string, documentId = "doc"): Highlight => ({
  id,
  documentId,
  pageIndex: 1,
  rects: [{ x1: 1, y1: 2, x2: 3, y2: 4 }],
  text: `문구 ${id}`,
  prefix: "",
  suffix: "",
  color: "#fde047",
  createdAt: "2026-10-08T00:00:00Z",
});

async function freshDb() {
  const db = memoryDb();
  await migrate(db);
  return db;
}

// PC A 의 상태를 PC B 에 합친다(파일을 거치는 것과 같음: JSON 직렬화 후 읽기)
async function syncInto(from: SqlDb, to: SqlDb, lastMergedAt: string | null, now = "2026-10-08T09:00:00Z") {
  const remote = JSON.parse(JSON.stringify(await readSyncData(from)));
  const plan = mergeRemote(await readSyncData(to), remote, lastMergedAt);
  await applyPlan(to, plan, now, "A");
  return plan;
}

describe("v2 → v3 마이그레이션(기존 DB 업그레이드)", () => {
  it("기존 하이라이트·노트에 수정 시각이 채워진다", async () => {
    const db = memoryDb();
    // v1, v2 만 적용된 예전 DB 를 만든다
    for (const m of MIGRATIONS.slice(0, 2)) for (const st of m.split(";").map((x) => x.trim()).filter(Boolean)) db.raw.exec(st);
    db.raw.exec("PRAGMA user_version = 2");
    db.raw.exec("INSERT INTO documents VALUES ('doc', '/a.pdf', 'A', '2026-10-01', '2026-10-01')");
    db.raw.exec(
      `INSERT INTO highlights VALUES ('h1', 'doc', 0, '[]', 't', '', '', '#fde047', '2026-10-01T00:00:00Z')`,
    );
    db.raw.exec(`INSERT INTO notes VALUES ('h1', '{"type":"doc"}', NULL, '2026-10-02T00:00:00Z')`);
    await migrate(db);
    expect(db.raw.prepare("SELECT updated_at, deleted_at FROM highlights").get()).toEqual({
      updated_at: "2026-10-01T00:00:00Z",
      deleted_at: null,
    });
    expect(db.raw.prepare("SELECT body_updated_at, board_updated_at FROM notes").get()).toEqual({
      body_updated_at: "2026-10-02T00:00:00Z",
      board_updated_at: null,
    });
  });
});

describe("두 PC 동기화(DB ↔ 합치기 ↔ DB)", () => {
  it("A 에서 만든 하이라이트·노트·보드가 B 로 그대로 온다", async () => {
    const a = await freshDb();
    const b = await freshDb();
    await upsertDocument(a, { id: "doc", path: "/mac/a.pdf", title: "논문" }, "2026-10-08T00:00:00Z");
    await insertHighlight(a, h("h1"));
    await saveNoteBody(a, "h1", { type: "doc", content: [] }, "2026-10-08T01:00:00Z");
    await saveNoteBoard(a, "h1", { elements: [{ id: "e" }] }, "2026-10-08T01:30:00Z");

    const plan = await syncInto(a, b, null);
    expect(plan.stats.highlightsAdded).toBe(1);
    expect((await listHighlights(b, "doc")).map((x) => x.id)).toEqual(["h1"]);
    const note = await getNote(b, "h1");
    expect(note?.body).toEqual({ type: "doc", content: [] });
    expect(note?.board).toEqual({ elements: [{ id: "e" }] });
    // 경로는 B 에서 모르는 값이라 빈 문자열
    expect(b.raw.prepare("SELECT path, title FROM documents").get()).toEqual({ path: "", title: "논문" });
  });

  it("번갈아 쓰기: B 에서 고친 노트·색이 A 로, A 에서 지운 하이라이트가 B 로", async () => {
    const a = await freshDb();
    const b = await freshDb();
    await upsertDocument(a, { id: "doc", path: "/a.pdf", title: "논문" }, "2026-10-08T00:00:00Z");
    await insertHighlight(a, h("h1"));
    await insertHighlight(a, h("h2"));
    await saveNoteBody(a, "h1", "오전", "2026-10-08T01:00:00Z");
    await syncInto(a, b, null, "2026-10-08T02:00:00Z");

    // 오후: B 에서 수정
    await saveNoteBody(b, "h1", "오후에 덧붙임", "2026-10-08T03:00:00Z");
    await updateHighlightColor(b, "h1", "#86efac", "2026-10-08T03:00:00Z");
    const back = await syncInto(b, a, "2026-10-08T02:00:00Z");
    expect(back.backups).toEqual([]);
    expect((await getNote(a, "h1"))?.body).toBe("오후에 덧붙임");
    expect((await listHighlights(a, "doc")).find((x) => x.id === "h1")?.color).toBe("#86efac");

    // 저녁: A 에서 h2 삭제 → B 로 전파, B 에 다시 합쳐도 되살아나지 않음
    await deleteHighlight(a, "h2", "2026-10-08T05:00:00Z");
    await syncInto(a, b, "2026-10-08T04:00:00Z");
    expect((await listHighlights(b, "doc")).map((x) => x.id)).toEqual(["h1"]);
    const again = await syncInto(b, a, "2026-10-08T06:00:00Z");
    expect(again.highlights).toEqual([]);
    expect((await listHighlights(a, "doc")).map((x) => x.id)).toEqual(["h1"]);
  });

  it("겹친 수정: 진 쪽 내용은 note_backups 에 남는다", async () => {
    const a = await freshDb();
    const b = await freshDb();
    await upsertDocument(a, { id: "doc", path: "/a.pdf", title: "논문" }, "2026-10-08T00:00:00Z");
    await insertHighlight(a, h("h1"));
    await syncInto(a, b, null, "2026-10-08T01:00:00Z");
    await saveNoteBody(b, "h1", "B 에서 고침", "2026-10-08T02:00:00Z");
    await saveNoteBody(a, "h1", "A 에서 고침", "2026-10-08T03:00:00Z");
    const plan = await syncInto(a, b, "2026-10-08T01:00:00Z");
    expect(plan.stats.conflicts).toBe(1);
    expect((await getNote(b, "h1"))?.body).toBe("A 에서 고침");
    expect(b.raw.prepare("SELECT field, content, other_device FROM note_backups").get()).toEqual({
      field: "body",
      content: JSON.stringify("B 에서 고침"),
      other_device: "A",
    });
  });

  it("같은 상태끼리 다시 합치면 아무것도 바뀌지 않는다", async () => {
    const a = await freshDb();
    const b = await freshDb();
    await upsertDocument(a, { id: "doc", path: "/a.pdf", title: "논문" }, "2026-10-08T00:00:00Z");
    await insertHighlight(a, h("h1"));
    await saveNoteBody(a, "h1", "메모", "2026-10-08T01:00:00Z");
    await syncInto(a, b, null);
    const p1 = await syncInto(b, a, "2026-10-08T09:00:00Z");
    const p2 = await syncInto(a, b, "2026-10-08T09:00:00Z");
    expect([p1.highlights.length, p1.notes.length, p2.highlights.length, p2.notes.length]).toEqual([0, 0, 0, 0]);
  });
});
