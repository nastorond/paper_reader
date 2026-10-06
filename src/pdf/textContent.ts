import type { PDFPageProxy, TextContent } from "pdfjs-dist/types/src/display/api";

// page.getTextContent() 대체.
// pdf.js 6 의 getTextContent 는 `for await (... of readableStream)` 을 쓰는데,
// macOS 웹뷰(WebKit)는 ReadableStream 비동기 반복을 지원하지 않아 TypeError 가 난다.
// 같은 일을 getReader() 로 한다.
export async function readTextContent(page: PDFPageProxy): Promise<TextContent> {
  const reader = page.streamTextContent().getReader();
  const result: TextContent = { items: [], styles: Object.create(null), lang: null };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = value as TextContent;
    result.lang ??= chunk.lang;
    Object.assign(result.styles, chunk.styles);
    result.items.push(...chunk.items);
  }
  return result;
}
