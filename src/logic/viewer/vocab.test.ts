import { describe, expect, it } from "vitest";
import { filterVocab, htmlToText, paperItems, paperSummaries, vocabItems } from "./vocab";
import type { BundleHighlight, BundleLibrary } from "../bundle/schema";

const h = (id: string, doc: string, text: string, createdAt: string, json: unknown = null): BundleHighlight => ({
  id,
  documentId: doc,
  pageIndex: 0,
  text,
  prefix: "",
  suffix: "",
  color: "#fde047",
  createdAt,
  note: json ? { html: "", json, updatedAt: createdAt } : null,
  boardSvg: null,
});
const para = (...content: object[]) => ({ type: "paragraph", content });

const lib: BundleLibrary = {
  schemaVersion: 1,
  app: "PaperBoard",
  exportedAt: "",
  documents: [
    { id: "a", title: "논문 A", fileName: "a.pdf", addedAt: "", lastOpenedAt: "" },
    { id: "b", title: "논문 B", fileName: "b.pdf", addedAt: "", lastOpenedAt: "" },
  ],
  highlights: [
    h("1", "a", "Kalman Filter", "2026-10-01", {
      type: "doc",
      content: [para({ type: "text", text: "" }), para({ type: "text", text: "상태 추정 " }, { type: "inlineMath", attrs: { latex: "x_k" } }), para({ type: "text", text: "둘째 줄" })],
    }),
    h("2", "b", "전리층 지연", "2026-10-03"),
    h("3", "a", "RAIM", "2026-10-02"),
  ],
};

describe("vocab", () => {
  it("최근 순, 문서 제목, 노트 첫 줄(빈 줄 건너뜀, 수식은 $..$)", () => {
    const items = vocabItems(lib);
    expect(items.map((i) => i.highlight.id)).toEqual(["2", "3", "1"]);
    expect(items[2].documentTitle).toBe("논문 A");
    expect(items[2].noteFirstLine).toBe("상태 추정 $x_k$");
    expect(items[0].noteFirstLine).toBe("");
  });

  it("문서 필터 + 문구·노트 검색(대소문자 무시)", () => {
    const items = vocabItems(lib);
    expect(filterVocab(items, "a", "").map((i) => i.highlight.id)).toEqual(["3", "1"]);
    expect(filterVocab(items, null, "kalman").map((i) => i.highlight.id)).toEqual(["1"]);
    expect(filterVocab(items, null, "둘째").map((i) => i.highlight.id)).toEqual(["1"]);
    expect(filterVocab(items, "b", "kalman")).toEqual([]);
  });

  it("htmlToText", () => {
    expect(htmlToText("<p>a &amp; b</p><p>c<br>d</p>")).toBe("a & b\nc\nd\n");
  });
});

describe("논문 탭", () => {
  const lib2: BundleLibrary = {
    ...lib,
    documents: [
      { id: "a", title: "논문 A", fileName: "a.pdf", addedAt: "", lastOpenedAt: "2026-10-01", pdf: "pdfs/a.pdf" },
      { id: "b", title: "논문 B", fileName: "b.pdf", addedAt: "", lastOpenedAt: "2026-10-05" },
      { id: "c", title: "하이라이트 없음", fileName: "c.pdf", addedAt: "", lastOpenedAt: "2026-10-09" },
    ],
    highlights: [
      { ...lib.highlights[0], pageIndex: 3, rects: [{ x1: 0, y1: 0, x2: 1, y2: 500 }] },
      { ...lib.highlights[2], pageIndex: 1, rects: [{ x1: 0, y1: 0, x2: 1, y2: 100 }] },
      { ...lib.highlights[2], id: "4", pageIndex: 1, rects: [{ x1: 0, y1: 0, x2: 1, y2: 700 }] },
      lib.highlights[1],
    ],
  };

  it("최근 연 순, 개수, 원문 여부, 하이라이트 없는 논문 제외", () => {
    expect(paperSummaries(lib2).map((p) => [p.document.id, p.highlightCount, p.hasPdf])).toEqual([
      ["b", 1, false],
      ["a", 3, true],
    ]);
  });

  it("논문 안 하이라이트는 페이지 → 위에서 아래 순", () => {
    expect(paperItems(vocabItems(lib2), "a").map((i) => i.highlight.id)).toEqual(["4", "3", "1"]);
  });
});
