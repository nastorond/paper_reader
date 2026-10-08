import { describe, expect, it } from "vitest";
import { describeMerge, isEmptyPlan, mergeRemote, type SyncData, type SyncHighlight, type SyncNote } from "./merge";

const doc = (id: string, lastOpenedAt = "2026-10-01T00:00:00Z") => ({
  id,
  title: `문서 ${id}`,
  addedAt: "2026-10-01T00:00:00Z",
  lastOpenedAt,
});
const hl = (id: string, updatedAt: string, over: Partial<SyncHighlight> = {}): SyncHighlight => ({
  id,
  documentId: "d1",
  pageIndex: 0,
  rects: [{ x1: 1, y1: 2, x2: 3, y2: 4 }],
  text: id,
  prefix: "",
  suffix: "",
  color: "#fde047",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt,
  deletedAt: null,
  ...over,
});
const note = (highlightId: string, body: string | null, bodyAt: string | null, board: string | null = null, boardAt: string | null = null): SyncNote => ({
  highlightId,
  body,
  bodyUpdatedAt: bodyAt,
  board,
  boardUpdatedAt: boardAt,
});
const data = (over: Partial<SyncData> = {}): SyncData => ({ documents: [doc("d1")], highlights: [], notes: [], ...over });

const T1 = "2026-10-08T01:00:00Z";
const T2 = "2026-10-08T02:00:00Z";
const T3 = "2026-10-08T03:00:00Z";

describe("mergeRemote", () => {
  it("상대에만 있는 문서·하이라이트·노트를 가져온다", () => {
    const remote = data({
      documents: [doc("d1"), doc("d2")],
      highlights: [hl("a", T1)],
      notes: [note("a", "메모", T1)],
    });
    const plan = mergeRemote(data(), remote, null);
    expect(plan.documents.map((d) => d.id)).toEqual(["d2"]);
    expect(plan.highlights.map((h) => h.id)).toEqual(["a"]);
    expect(plan.notes).toEqual([{ highlightId: "a", body: { value: "메모", updatedAt: T1 } }]);
    expect(plan.stats.highlightsAdded).toBe(1);
  });

  it("나중에 고친 쪽이 이긴다(하이라이트 색)", () => {
    const local = data({ highlights: [hl("a", T1, { color: "#fde047" })] });
    const newer = data({ highlights: [hl("a", T2, { color: "#86efac" })] });
    const older = data({ highlights: [hl("a", T1, { color: "#93c5fd" })] });
    expect(mergeRemote(local, newer, null).highlights[0].color).toBe("#86efac");
    expect(mergeRemote(local, older, null).highlights).toEqual([]); // 같거나 이른 건 무시
  });

  it("삭제가 전파되고, 노트도 함께 지운다", () => {
    const local = data({ highlights: [hl("a", T1)], notes: [note("a", "메모", T1)] });
    const remote = data({ highlights: [hl("a", T2, { deletedAt: T2 })], notes: [] });
    const plan = mergeRemote(local, remote, T1);
    expect(plan.highlights[0].deletedAt).toBe(T2);
    expect(plan.deleteNotes).toEqual(["a"]);
    expect(plan.stats.highlightsDeleted).toBe(1);
  });

  it("지운 표시가 있으면 상대의 예전 사본이 되살아나지 않는다", () => {
    const local = data({ highlights: [hl("a", T2, { deletedAt: T2 })] });
    const remote = data({ highlights: [hl("a", T1)], notes: [note("a", "예전 메모", T1)] });
    const plan = mergeRemote(local, remote, null);
    expect(plan.highlights).toEqual([]);
    expect(plan.notes).toEqual([]); // 지운 하이라이트의 노트는 가져오지 않는다
  });

  it("지운 뒤 상대가 더 나중에 고쳤으면 되살린다", () => {
    const local = data({ highlights: [hl("a", T2, { deletedAt: T2 })] });
    const remote = data({ highlights: [hl("a", T3, { color: "#f9a8d4" })], notes: [note("a", "새 메모", T3)] });
    const plan = mergeRemote(local, remote, T1);
    expect(plan.highlights[0].deletedAt).toBeNull();
    expect(plan.notes[0].body?.value).toBe("새 메모");
    expect(plan.stats.highlightsAdded).toBe(1);
  });

  it("상대가 지운 걸 처음 보는 경우도 지운 상태로 기록한다(나중에 다른 사본이 와도 막도록)", () => {
    const remote = data({ highlights: [hl("a", T2, { deletedAt: T2 })], notes: [note("a", "x", T1)] });
    const plan = mergeRemote(data(), remote, null);
    expect(plan.highlights[0].deletedAt).toBe(T2);
    expect(plan.notes).toEqual([]);
    expect(plan.stats.highlightsAdded).toBe(0);
  });

  it("노트 본문과 보드는 따로 비교한다", () => {
    const local = data({ highlights: [hl("a", T1)], notes: [note("a", "맥 본문", T2, "맥 보드", T1)] });
    const remote = data({ highlights: [hl("a", T1)], notes: [note("a", "윈도 본문", T1, "윈도 보드", T3)] });
    const plan = mergeRemote(local, remote, T3);
    expect(plan.notes).toEqual([{ highlightId: "a", board: { value: "윈도 보드", updatedAt: T3 } }]);
  });

  it("번갈아 쓰기: 마지막 합치기 뒤 상대만 고쳤으면 백업 없이 가져온다", () => {
    const local = data({ highlights: [hl("a", T1)], notes: [note("a", "오전 메모", T1)] });
    const remote = data({ highlights: [hl("a", T1)], notes: [note("a", "오후에 덧붙임", T3)] });
    const plan = mergeRemote(local, remote, T2); // T2 에 마지막으로 합침 → 내 쪽(T1)은 그 뒤로 안 고침
    expect(plan.backups).toEqual([]);
    expect(plan.notes[0].body?.value).toBe("오후에 덧붙임");
  });

  it("충돌: 양쪽 모두 마지막 합치기 뒤에 고쳤고 상대가 이기면 내 것을 백업", () => {
    const local = data({ highlights: [hl("a", T1)], notes: [note("a", "맥에서 고침", T2)] });
    const remote = data({ highlights: [hl("a", T1)], notes: [note("a", "윈도에서 고침", T3)] });
    const plan = mergeRemote(local, remote, T1);
    expect(plan.notes[0].body?.value).toBe("윈도에서 고침");
    expect(plan.backups).toEqual([{ highlightId: "a", field: "body", content: "맥에서 고침", updatedAt: T2 }]);
    expect(plan.stats.conflicts).toBe(1);
  });

  it("내 것이 더 나중이면 그대로 둔다(상대가 나중에 내 것을 가져가며 자기 것을 백업한다)", () => {
    const local = data({ highlights: [hl("a", T1)], notes: [note("a", "맥에서 고침", T3)] });
    const remote = data({ highlights: [hl("a", T1)], notes: [note("a", "윈도에서 고침", T2)] });
    expect(isEmptyPlan(mergeRemote(local, remote, T1))).toBe(true);
  });

  it("같은 내용을 다시 합치면 바뀌는 게 없다(서로 계속 다시 쓰는 일이 없도록)", () => {
    const same = data({ highlights: [hl("a", T1)], notes: [note("a", "메모", T1, "보드", T1)] });
    expect(isEmptyPlan(mergeRemote(same, structuredClone(same), null))).toBe(true);
  });

  it("문서: 최근 연 시각은 늦은 쪽", () => {
    const local = data({ documents: [doc("d1", T1)] });
    const remote = data({ documents: [doc("d1", T3)] });
    expect(mergeRemote(local, remote, null).documents).toEqual([{ ...doc("d1", T3) }]);
  });
});

describe("describeMerge", () => {
  it("안내 문구", () => {
    expect(
      describeMerge("Windows", { highlightsAdded: 3, highlightsUpdated: 0, highlightsDeleted: 1, notesUpdated: 2, conflicts: 1 }),
    ).toBe("Windows에서 가져옴: 하이라이트 3개 추가, 하이라이트 1개 삭제, 노트 2개 갱신 (겹친 수정 1건은 내 쪽 내용을 백업했습니다)");
    expect(describeMerge("Mac", { highlightsAdded: 0, highlightsUpdated: 0, highlightsDeleted: 0, notesUpdated: 0, conflicts: 0 })).toBeNull();
  });
});
