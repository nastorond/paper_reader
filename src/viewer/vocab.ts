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

// ---- 논문 탭 ----

export interface PaperSummary {
  document: BundleLibrary["documents"][number];
  highlightCount: number;
  hasPdf: boolean;
}

// 최근에 연 논문 순. 하이라이트가 없는 논문은 뺀다(단어장 앱이라 볼 게 없다).
export function paperSummaries(lib: BundleLibrary): PaperSummary[] {
  const counts = new Map<string, number>();
  for (const h of lib.highlights) counts.set(h.documentId, (counts.get(h.documentId) ?? 0) + 1);
  return lib.documents
    .filter((d) => (counts.get(d.id) ?? 0) > 0)
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    .map((d) => ({ document: d, highlightCount: counts.get(d.id) ?? 0, hasPdf: !!d.pdf }));
}

// 한 논문의 하이라이트를 읽는 순서(페이지 → 위에서 아래)로. 좌표가 없으면 만든 순서.
export function paperItems(items: VocabItem[], documentId: string): VocabItem[] {
  const top = (it: VocabItem) => Math.max(...(it.highlight.rects ?? [{ y2: 0 }]).map((r) => r.y2));
  return items
    .filter((it) => it.highlight.documentId === documentId)
    .sort(
      (a, b) =>
        a.highlight.pageIndex - b.highlight.pageIndex ||
        top(b) - top(a) ||
        a.highlight.createdAt.localeCompare(b.highlight.createdAt),
    );
}
