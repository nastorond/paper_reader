import type { DocumentRecord, Highlight, Note } from "../store/types";
import { tiptapToMarkdown } from "./tiptapToMarkdown";

// 한 문서의 하이라이트·노트 전체를 마크다운 한 파일로. 하이라이트 순서는 호출하는 쪽이 정한다(목록과 같은 순서).
export function notesToMarkdown(
  doc: Pick<DocumentRecord, "title" | "path">,
  items: { highlight: Highlight; note: Note | null }[],
  exportedAt: string,
): string {
  const out: string[] = [`# ${doc.title}`, "", `- 원본: \`${doc.path}\``, `- 내보낸 시각: ${exportedAt}`, `- 하이라이트: ${items.length}개`];
  for (const { highlight: h, note } of items) {
    out.push("", "---", "", `## p.${h.pageIndex + 1} — ${oneLine(h.text)}`, "");
    out.push(`> ${oneLine(h.text)}`);
    const body = note ? tiptapToMarkdown(note.body) : "";
    if (body) out.push("", body);
    if (hasBoard(note)) out.push("", "_(보드 있음 — PaperBoard 앱에서 보기)_");
  }
  return out.join("\n") + "\n";
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hasBoard(note: Note | null): boolean {
  const els = (note?.board as { elements?: { isDeleted?: boolean }[] } | null)?.elements;
  return !!els && els.some((e) => !e.isDeleted);
}

// 파일 이름에 쓸 수 없는 문자를 바꾼다.
export function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 120) || "notes";
}
