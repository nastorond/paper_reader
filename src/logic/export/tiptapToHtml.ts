import katex from "katex";
import type { TNode } from "./tiptapToMarkdown";

// TipTap 문서 JSON → HTML 문자열. 번들(폰 뷰어)용 순수 함수(DOM 불필요).
// 수식은 KaTeX 로 미리 렌더링한다(폰에는 KaTeX CSS·글꼴만 있으면 된다).

export function tiptapToHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  return children((doc as TNode).content);
}

function children(nodes: TNode[] | undefined): string {
  return (nodes ?? []).map(node).join("");
}

function node(n: TNode): string {
  switch (n.type) {
    case "paragraph":
      return `<p>${children(n.content)}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)));
      return `<h${level}>${children(n.content)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${children(n.content)}</ul>`;
    case "orderedList": {
      const start = Number(n.attrs?.start ?? 1);
      return start === 1 ? `<ol>${children(n.content)}</ol>` : `<ol start="${start}">${children(n.content)}</ol>`;
    }
    case "listItem":
      return `<li>${children(n.content)}</li>`;
    case "blockquote":
      return `<blockquote>${children(n.content)}</blockquote>`;
    case "codeBlock": {
      const lang = typeof n.attrs?.language === "string" ? n.attrs.language : "";
      const code = (n.content ?? []).map((c) => c.text ?? "").join("");
      return `<pre><code${lang ? ` class="language-${esc(lang)}"` : ""}>${esc(code)}</code></pre>`;
    }
    case "horizontalRule":
      return "<hr>";
    case "hardBreak":
      return "<br>";
    case "table":
      return `<table><tbody>${children(n.content)}</tbody></table>`;
    case "tableRow":
      return `<tr>${children(n.content)}</tr>`;
    case "tableHeader":
      return `<th>${children(n.content)}</th>`;
    case "tableCell":
      return `<td>${children(n.content)}</td>`;
    case "inlineMath":
      return math(String(n.attrs?.latex ?? ""), false);
    case "blockMath":
      return `<div class="math-block">${math(String(n.attrs?.latex ?? ""), true)}</div>`;
    case "text":
      return marked(esc(n.text ?? ""), n.marks ?? []);
    default:
      return children(n.content);
  }
}

function math(latex: string, displayMode: boolean): string {
  return katex.renderToString(latex, { displayMode, throwOnError: false, output: "html" });
}

function marked(html: string, marks: NonNullable<TNode["marks"]>): string {
  let s = html;
  for (const m of marks) {
    if (m.type === "bold") s = `<strong>${s}</strong>`;
    else if (m.type === "italic") s = `<em>${s}</em>`;
    else if (m.type === "strike") s = `<s>${s}</s>`;
    else if (m.type === "code") s = `<code>${s}</code>`;
    else if (m.type === "underline") s = `<u>${s}</u>`;
    else if (m.type === "link") {
      const href = String(m.attrs?.href ?? "");
      // javascript: 같은 위험한 링크는 버린다
      if (/^(https?:|mailto:)/i.test(href)) s = `<a href="${esc(href)}">${s}</a>`;
    }
  }
  return s;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
