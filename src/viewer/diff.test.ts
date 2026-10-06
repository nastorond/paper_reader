import { describe, expect, it } from "vitest";
import { describeDiff, diffLibraries, shouldAutoRefresh } from "./diff";
import type { BundleHighlight, BundleLibrary } from "../bundle/schema";

const h = (id: string, over: Partial<BundleHighlight> = {}): BundleHighlight => ({
  id,
  documentId: "d",
  pageIndex: 0,
  text: id,
  prefix: "",
  suffix: "",
  color: "#fde047",
  createdAt: "2026-10-01",
  note: null,
  boardSvg: null,
  ...over,
});
const lib = (...highlights: BundleHighlight[]): BundleLibrary => ({
  schemaVersion: 1,
  app: "PaperBoard",
  exportedAt: "",
  documents: [],
  highlights,
});

describe("diffLibraries", () => {
  it("추가·삭제·수정(노트 시각, 색, 보드)", () => {
    const prev = lib(h("a"), h("b"), h("c", { note: { html: "", json: null, updatedAt: "1" } }), h("d"));
    const next = lib(
      h("a"),
      h("c", { note: { html: "", json: null, updatedAt: "2" } }),
      h("d", { color: "#86efac" }),
      h("e"),
      h("f"),
    );
    expect(diffLibraries(prev, next)).toEqual({ added: 2, removed: 1, changed: 2 });
  });

  it("안내 문구", () => {
    expect(describeDiff({ added: 2, removed: 0, changed: 1 }, false)).toBe("새 하이라이트 2개 · 수정 1개");
    expect(describeDiff({ added: 0, removed: 0, changed: 0 }, true)).toContain("Drive 동기화");
    expect(describeDiff({ added: 0, removed: 0, changed: 0 }, false)).toBe("바뀐 내용 없음");
  });
});

describe("shouldAutoRefresh", () => {
  it("1분 간격 제한", () => {
    const t = new Date("2026-10-07T00:00:00Z").getTime();
    expect(shouldAutoRefresh(null, t)).toBe(true);
    expect(shouldAutoRefresh("2026-10-07T00:00:00Z", t + 30_000)).toBe(false);
    expect(shouldAutoRefresh("2026-10-07T00:00:00Z", t + 60_000)).toBe(true);
  });
});
