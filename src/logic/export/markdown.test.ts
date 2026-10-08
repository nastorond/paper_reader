import { describe, expect, it } from "vitest";
import { tiptapToMarkdown } from "./tiptapToMarkdown";
import { notesToMarkdown, safeFileName } from "./notesMarkdown";
import type { Highlight } from "../types";

const p = (...content: object[]) => ({ type: "paragraph", content });
const t = (text: string, ...marks: string[]) => ({ type: "text", text, marks: marks.map((type) => ({ type })) });

describe("tiptapToMarkdown", () => {
  it("문단·제목·글자 꾸밈·인라인 수식", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 3 }, content: [t("정의")] },
        p(t("보통 "), t("굵게", "bold"), t(" "), t("기울임", "italic"), t(" "), t("x+1", "code"), t(" 수식 "), {
          type: "inlineMath",
          attrs: { latex: "x^2" },
        }),
      ],
    };
    expect(tiptapToMarkdown(doc)).toBe("### 정의\n\n보통 **굵게** *기울임* `x+1` 수식 $x^2$");
  });

  it("중첩 목록과 번호 목록", () => {
    const li = (...content: object[]) => ({ type: "listItem", content });
    const doc = {
      type: "doc",
      content: [
        { type: "bulletList", content: [li(p(t("a")), { type: "bulletList", content: [li(p(t("a-1")))] }), li(p(t("b")))] },
        { type: "orderedList", attrs: { start: 3 }, content: [li(p(t("셋"))), li(p(t("넷")))] },
      ],
    };
    expect(tiptapToMarkdown(doc)).toBe("- a\n  - a-1\n- b\n\n3. 셋\n4. 넷");
  });

  it("코드 블록·블록 수식·인용·링크", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "codeBlock", attrs: { language: "cpp" }, content: [t("int x = 1;\nreturn x;")] },
        { type: "blockMath", attrs: { latex: "\\sum_i x_i" } },
        { type: "blockquote", content: [p(t("인용"))] },
        p({ type: "text", text: "링크", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }),
      ],
    };
    expect(tiptapToMarkdown(doc)).toBe(
      "```cpp\nint x = 1;\nreturn x;\n```\n\n$$\n\\sum_i x_i\n$$\n\n> 인용\n\n[링크](https://example.com)",
    );
  });

  it("표(GFM), 칸 안의 | 이스케이프", () => {
    const cell = (type: string, text: string) => ({ type, content: [p(t(text))] });
    const doc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("tableHeader", "항목"), cell("tableHeader", "값")] },
            { type: "tableRow", content: [cell("tableCell", "a|b"), cell("tableCell", "1")] },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(doc)).toBe("| 항목 | 값 |\n| --- | --- |\n| a\\|b | 1 |");
  });

  it("빈 노트·null", () => {
    expect(tiptapToMarkdown(null)).toBe("");
    expect(tiptapToMarkdown({ type: "doc", content: [{ type: "paragraph" }] })).toBe("");
  });
});

describe("notesToMarkdown", () => {
  const h = (id: string, page: number, text: string): Highlight => ({
    id,
    documentId: "d",
    pageIndex: page,
    rects: [],
    text,
    prefix: "",
    suffix: "",
    color: "#fde047",
    createdAt: "2026-10-01T00:00:00Z",
  });

  it("문구 + 페이지 + 노트 본문, 보드 있음 표시", () => {
    const md = notesToMarkdown(
      { title: "KF-RAIM 논문", path: "/papers/a.pdf" },
      [
        { highlight: h("1", 1, "(IF) 측정\n모델에"), note: { highlightId: "1", body: { type: "doc", content: [p(t("메모"))] }, board: null, updatedAt: "" } },
        { highlight: h("2", 2, "Solution Separation"), note: { highlightId: "2", body: null, board: { elements: [{ id: "e" }] }, updatedAt: "" } },
        { highlight: h("3", 3, "노트 없음"), note: null },
      ],
      "2026-10-06 23:00",
    );
    expect(md).toBe(
      [
        "# KF-RAIM 논문",
        "",
        "- 원본: `/papers/a.pdf`",
        "- 내보낸 시각: 2026-10-06 23:00",
        "- 하이라이트: 3개",
        "",
        "---",
        "",
        "## p.2 — (IF) 측정 모델에",
        "",
        "> (IF) 측정 모델에",
        "",
        "메모",
        "",
        "---",
        "",
        "## p.3 — Solution Separation",
        "",
        "> Solution Separation",
        "",
        "_(보드 있음 — PaperBoard 앱에서 보기)_",
        "",
        "---",
        "",
        "## p.4 — 노트 없음",
        "",
        "> 노트 없음",
        "",
      ].join("\n"),
    );
  });

  it("파일 이름 정리", () => {
    expect(safeFileName('A/B: "C"?')).toBe("A_B_ _C__");
  });
});
