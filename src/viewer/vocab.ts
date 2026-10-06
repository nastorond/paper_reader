import type { BundleHighlight, BundleLibrary } from "../bundle/schema";

// 단어장 목록용 가공(순수 함수, 테스트 대상).

export interface VocabItem {
  highlight: BundleHighlight;
  documentTitle: string;
  noteFirstLine: string;
  searchText: string; // 검색용(소문자)
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/tr|\/div)[^>]*>/gi, "\n")
    .replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

// 노트 첫 줄: JSON 이 있으면 거기서(수식은 LaTeX 그대로), 없으면 HTML 에서.
function firstLine(h: BundleHighlight): string {
  if (!h.note) return "";
  const text = jsonText(h.note.json) || htmlToText(h.note.html);
  return text.split("\n").map((s) => s.trim()).find((s) => s.length > 0) ?? "";
}

function jsonText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; attrs?: { latex?: string }; content?: unknown[] };
  if (n.type === "text") return n.text ?? "";
  if (n.type === "inlineMath" || n.type === "blockMath") return `$${n.attrs?.latex ?? ""}$`;
  const inner = (n.content ?? []).map(jsonText).join("");
  return ["paragraph", "heading", "listItem", "codeBlock", "blockMath", "tableRow"].includes(n.type ?? "") ? `${inner}\n` : inner;
}

// 최근에 만든 하이라이트가 위로(단어장은 최근 공부한 것부터 보는 게 자연스럽다).
export function vocabItems(lib: BundleLibrary): VocabItem[] {
  const titles = new Map(lib.documents.map((d) => [d.id, d.title]));
  return [...lib.highlights]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((h) => {
      const documentTitle = titles.get(h.documentId) ?? "";
      const noteFirstLine = firstLine(h);
      const noteAll = h.note ? (jsonText(h.note.json) || htmlToText(h.note.html)) : "";
      return { highlight: h, documentTitle, noteFirstLine, searchText: `${h.text}\n${noteAll}`.toLowerCase() };
    });
}

export function filterVocab(items: VocabItem[], documentId: string | null, query: string): VocabItem[] {
  const q = query.trim().toLowerCase();
  return items.filter(
    (it) => (!documentId || it.highlight.documentId === documentId) && (!q || it.searchText.includes(q)),
  );
}
