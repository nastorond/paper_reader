import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Node 에서는 브라우저용 빌드 대신 legacy 빌드를 쓴다(앱 코드는 src/pdf/pdfjs.ts).
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

describe("fixtures/two-column.pdf", () => {
  it("pdf.js 로 열리고 텍스트를 추출할 수 있다", async () => {
    const data = new Uint8Array(readFileSync("fixtures/two-column.pdf"));
    const doc = await getDocument({ data }).promise;
    expect(doc.numPages).toBe(3);
    const page = await doc.getPage(1);
    const text = (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
    expect(text).toContain("Attention-Free Reading");
    expect(text).toContain("hyphen-");
    await doc.loadingTask.destroy();
  });
});
