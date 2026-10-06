// TipTap 문서 JSON → 마크다운. 노트 내보내기(M5)용 순수 함수.
// 지원: 문단, 제목, 목록(중첩), 코드 블록, 인용, 구분선, 줄바꿈, 표(GFM), 수식($...$, $$...$$),
//       글자 꾸밈(굵게·기울임·취소선·인라인 코드·링크). 모르는 노드는 안의 글자만 꺼낸다.

export interface TNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: TNode[];
}

export function tiptapToMarkdown(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  return blocks((doc as TNode).content ?? [], "").trim();
}

function blocks(nodes: TNode[], indent: string): string {
  return nodes
    .map((n) => block(n, indent))
    .filter((s) => s.length > 0)
    .join("\n\n");
}

function block(n: TNode, indent: string): string {
  const prefixLines = (s: string, first: string, rest: string) =>
    s
      .split("\n")
      .map((line, i) => (i === 0 ? first : rest) + line)
      .join("\n");

  switch (n.type) {
    case "paragraph":
      return indent + inline(n.content ?? []);
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)));
      return `${indent}${"#".repeat(level)} ${inline(n.content ?? [])}`;
    }
    case "bulletList":
    case "orderedList": {
      const start = Number(n.attrs?.start ?? 1);
      return (n.content ?? [])
        .map((item, i) => {
          const marker = n.type === "orderedList" ? `${start + i}. ` : "- ";
          // 항목 안(문단 + 하위 목록)은 빈 줄 없이 붙인다(tight list)
          const body = (item.content ?? [])
            .map((c) => block(c, ""))
            .filter((x) => x.length > 0)
            .join("\n");
          return prefixLines(body, indent + marker, indent + " ".repeat(marker.length));
        })
        .join("\n");
    }
    case "codeBlock": {
      const lang = typeof n.attrs?.language === "string" ? n.attrs.language : "";
      const code = (n.content ?? []).map((c) => c.text ?? "").join("");
      return prefixLines("```" + lang + "\n" + code + "\n```", indent, indent);
    }
    case "blockquote":
      return prefixLines(blocks(n.content ?? [], ""), indent + "> ", indent + "> ");
    case "horizontalRule":
      return indent + "---";
    case "blockMath":
      return `${indent}$$\n${indent}${String(n.attrs?.latex ?? "")}\n${indent}$$`;
    case "table":
      return table(n, indent);
    default:
      // 알 수 없는 블록: 안쪽을 블록으로 처리하거나 글자만
      return n.content ? blocks(n.content, indent) : indent + (n.text ?? "");
  }
}

function table(n: TNode, indent: string): string {
  const rows = (n.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      // 칸 안의 여러 문단은 <br> 로, 파이프는 이스케이프
      (cell.content ?? [])
        .map((p) => inline(p.content ?? []))
        .join("<br>")
        .replace(/\|/g, "\\|"),
    ),
  );
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) => `${indent}| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  return [line(rows[0]), `${indent}|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}

function inline(nodes: TNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      if (n.type === "inlineMath") return `$${String(n.attrs?.latex ?? "")}$`;
      if (n.type !== "text") return n.content ? inline(n.content) : "";
      return marked(n.text ?? "", n.marks ?? []);
    })
    .join("");
}

function marked(text: string, marks: NonNullable<TNode["marks"]>): string {
  const has = (t: string) => marks.some((m) => m.type === t);
  if (has("code")) {
    const fence = text.includes("`") ? "``" : "`";
    return wrapLink(`${fence}${text}${fence}`, marks);
  }
  let s = text;
  if (has("bold")) s = `**${s}**`;
  if (has("italic")) s = `*${s}*`;
  if (has("strike")) s = `~~${s}~~`;
  return wrapLink(s, marks);
}

function wrapLink(s: string, marks: NonNullable<TNode["marks"]>): string {
  const link = marks.find((m) => m.type === "link");
  return link ? `[${s}](${String(link.attrs?.href ?? "")})` : s;
}
