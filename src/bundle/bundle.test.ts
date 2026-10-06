import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readBundle, writeBundle } from "./bundleZip";
import { boardHasContent, buildLibrary } from "./buildLibrary";
import { BUNDLE_SCHEMA_VERSION, boardSvgPath } from "./schema";
import { tiptapToHtml } from "../export/tiptapToHtml";
import type { DocumentRecord, Highlight, Note } from "../store/types";

const doc: DocumentRecord = {
  id: "doc1",
  path: "/Users/me/papers/KF-RAIM.pdf",
  title: "OpenMP을 활용한 KF-RAIM",
  addedAt: "2026-10-01T00:00:00Z",
  lastOpenedAt: "2026-10-06T00:00:00Z",
};
const hl = (id: string): Highlight => ({
  id,
  documentId: "doc1",
  pageIndex: 1,
  rects: [{ x1: 1, y1: 2, x2: 3, y2: 4 }],
  text: "(IF) 측정 모델에",
  prefix: "앞",
  suffix: "뒤",
  color: "#fde047",
  createdAt: "2026-10-06T12:00:00Z",
});
const body = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "조합 " }, { type: "inlineMath", attrs: { latex: "x^2" } }] }],
};
const notes: Note[] = [
  { highlightId: "h1", body, board: { elements: [{ id: "e1" }] }, updatedAt: "2026-10-06T12:01:00Z" },
  { highlightId: "h2", body: null, board: { elements: [{ id: "e2", isDeleted: true }] }, updatedAt: "2026-10-06T12:02:00Z" },
];

describe("번들 왕복", () => {
  it("만들기 → zip → 읽기: 같은 내용", () => {
    const boardIds = new Set(notes.filter((n) => boardHasContent(n.board)).map((n) => n.highlightId));
    const library = buildLibrary([doc], [hl("h1"), hl("h2"), hl("h3")], notes, boardIds, "2026-10-06T13:00:00Z", new Set(["doc1"]));
    const boards = new Map([[boardSvgPath("h1"), '<svg xmlns="http://www.w3.org/2000/svg"><text>한글</text></svg>']]);
    const zip = writeBundle(library, boards);

    const read = readBundle(zip);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.library).toEqual(library);
    expect(read.boards).toEqual(boards);

    // 내용 확인: 경로 대신 파일 이름만, 노트 HTML 은 KaTeX 로 렌더링, 빈 보드는 SVG 없음
    expect(read.library.schemaVersion).toBe(BUNDLE_SCHEMA_VERSION);
    expect(read.library.documents[0].fileName).toBe("KF-RAIM.pdf");
    const [h1, h2, h3] = read.library.highlights;
    expect(h1.note?.html).toContain('class="katex"');
    expect(h1.note?.json).toEqual(body);
    expect(h1.boardSvg).toBe("boards/h1.svg");
    expect(h2.note).toBeNull();
    expect(h2.boardSvg).toBeNull();
    expect(h3.note).toBeNull();
    // 폰에서 원문 위에 그릴 좌표, PDF 원문 경로
    expect(h1.rects).toEqual([{ x1: 1, y1: 2, x2: 3, y2: 4 }]);
    expect(read.library.documents[0].pdf).toBe("pdfs/doc1.pdf");
  });

  it("PDF 를 올리지 않으면 pdf 는 null", () => {
    const library = buildLibrary([doc], [], [], new Set(), "2026-10-06T13:00:00Z");
    expect(library.documents[0].pdf).toBeNull();
  });

  it("같은 내용이면 같은 바이트(불필요한 Drive 동기화 방지)", () => {
    const library = buildLibrary([doc], [hl("h1")], [], new Set(), "2026-10-06T13:00:00Z");
    expect(writeBundle(library, new Map())).toEqual(writeBundle(library, new Map()));
  });

  it("모르는 새 버전·깨진 파일", () => {
    const future = zipSync({ "library.json": strToU8(JSON.stringify({ schemaVersion: BUNDLE_SCHEMA_VERSION + 1 })) });
    expect(readBundle(future)).toEqual({ ok: false, reason: "unsupported-version", version: BUNDLE_SCHEMA_VERSION + 1 });
    expect(readBundle(new Uint8Array([1, 2, 3]))).toEqual({ ok: false, reason: "invalid" });
    expect(readBundle(zipSync({ "other.txt": strToU8("x") }))).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("tiptapToHtml", () => {
  it("이스케이프, 꾸밈, 위험한 링크 제거", () => {
    const html = tiptapToHtml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "<b>a&b</b>" },
            { type: "text", text: "굵게", marks: [{ type: "bold" }] },
            { type: "text", text: "링크", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
            { type: "text", text: "웹", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
          ],
        },
        { type: "codeBlock", attrs: { language: "cpp" }, content: [{ type: "text", text: "a < b" }] },
      ],
    });
    expect(html).toBe(
      '<p>&lt;b&gt;a&amp;b&lt;/b&gt;<strong>굵게</strong>링크<a href="https://example.com">웹</a></p>' +
        '<pre><code class="language-cpp">a &lt; b</code></pre>',
    );
  });

  it("표와 목록", () => {
    const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
    const html = tiptapToHtml({
      type: "doc",
      content: [
        { type: "bulletList", content: [{ type: "listItem", content: [p("a")] }] },
        {
          type: "table",
          content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [p("h")] }, { type: "tableCell", content: [p("c")] }] }],
        },
      ],
    });
    expect(html).toBe("<ul><li><p>a</p></li></ul><table><tbody><tr><th><p>h</p></th><td><p>c</p></td></tr></tbody></table>");
  });
});
