import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Node 에서는 legacy 빌드를 쓴다(앱 코드는 브라우저 빌드).
import { AnnotationMode, OPS, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildSegments, extractGlyphs, multiply, type FontLike, type PositionedGlyph } from "./glyphLayout";

function glyph(str: string, x0: number, x1: number, y = 100, size = 10): PositionedGlyph {
  return { str, isSpace: str === " ", x0, y0: y, x1, y1: y, size, fontName: "f" };
}

describe("multiply", () => {
  it("pdf.js Util.transform 과 같은 순서로 곱한다", () => {
    // 이동 후 2배 확대: 점 (1,0) → (2,0) → (12, 0)
    expect(multiply([1, 0, 0, 1, 10, 0], [2, 0, 0, 2, 0, 0])).toEqual([2, 0, 0, 2, 10, 0]);
  });
});

describe("buildSegments", () => {
  it("공백 글리프 기준으로 단어를 나누고, 조각이 빈틈 없이 이어진다", () => {
    // "ab  cd" (양쪽 정렬로 공백이 넓어진 줄)
    const segs = buildSegments([
      glyph("a", 0, 5),
      glyph("b", 5, 10),
      glyph(" ", 10, 20),
      glyph("c", 20, 25),
      glyph("d", 25, 30),
    ]);
    expect(segs.map((s) => s.text)).toEqual(["ab ", "cd"]);
    expect(segs[0].x).toBe(0);
    expect(segs[0].width).toBe(20); // 다음 단어 시작까지
    expect(segs[1].x).toBe(20);
    expect(segs[1].width).toBe(10);
    expect(segs.map((s) => s.endOfLine)).toEqual([false, true]);
  });

  it("공백 글리프 없이 간격만 있어도(TJ 간격) 단어를 나누고 공백을 넣는다", () => {
    const segs = buildSegments([glyph("a", 0, 5), glyph("b", 5, 10), glyph("c", 14, 19)]);
    expect(segs.map((s) => s.text)).toEqual(["ab ", "c"]);
  });

  it("줄이 바뀌면(기준선 이동, 뒤로 돌아감) 새 줄로 나눈다", () => {
    const segs = buildSegments([glyph("a", 0, 5, 100), glyph("b", 5, 10, 100), glyph("c", 0, 5, 88)]);
    expect(segs.map((s) => [s.text, s.endOfLine])).toEqual([
      ["ab", true],
      ["c", true],
    ]);
  });

  it("멀리 떨어진 글자(다른 단)는 다른 줄로 본다", () => {
    const segs = buildSegments([glyph("a", 0, 5), glyph("b", 300, 305)]);
    expect(segs).toHaveLength(2);
    expect(segs[0].endOfLine).toBe(true);
  });
});

// 실제 PDF: pdf.js textContent 가 알려 주는 각 항목의 시작·끝 위치에
// 연산자 목록에서 직접 계산한 글리프의 시작·끝이 있는지 본다(글리프 위치 계산 검증).
async function checkAgainstTextContent(path: string) {
  const data = new Uint8Array(readFileSync(path));
  const doc = await getDocument({
    data,
    standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/",
    cMapUrl: "node_modules/pdfjs-dist/cmaps/",
    verbosity: 0,
  }).promise;
  let checked = 0;
  const misses: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const opList = await page.getOperatorList({ annotationMode: AnnotationMode.DISABLE });
    const getFont = (n: string) => (page.commonObjs.has(n) ? (page.commonObjs.get(n) as FontLike) : null);
    const glyphs = extractGlyphs(opList.fnArray, opList.argsArray, OPS, getFont);
    const tc = await page.getTextContent();
    for (const item of tc.items) {
      if (!("str" in item) || item.str.trim().length < 3) continue;
      const [a, b, , , x, y] = item.transform;
      if (Math.abs(b) > 1e-3 || a <= 0) continue; // 가로 글자만
      const end = x + item.width;
      const onLine = glyphs.filter((g) => Math.abs(g.y0 - y) < 0.5);
      // 끝 쪽은 아래·위 첨자(기준선이 살짝 다른 글리프)로 끝나는 항목이 있어 글자 높이 이내까지 본다.
      const nearLine = glyphs.filter((g) => Math.abs(g.y0 - y) < item.height);
      const near = (vals: number[], v: number) => Math.min(...vals.map((u) => Math.abs(u - v)));
      checked++;
      const dStart = near(onLine.map((g) => g.x0), x);
      const dEnd = near(nearLine.map((g) => g.x1), end);
      if (dStart > 0.5 || dEnd > 0.5) {
        misses.push(`p${p} "${item.str.slice(0, 30)}" start±${dStart.toFixed(2)} end±${dEnd.toFixed(2)}`);
      }
    }
  }
  await doc.loadingTask.destroy();
  return { checked, misses };
}

describe("실제 PDF 에서 줄 위치가 pdf.js textContent 와 일치", () => {
  it("fixtures/two-column.pdf", async () => {
    const { checked, misses } = await checkAgainstTextContent("fixtures/two-column.pdf");
    expect(checked).toBeGreaterThan(50);
    expect(misses).toEqual([]);
  });

  const kci = "fixtures/KCI_FI003273433.pdf";
  it.skipIf(!existsSync(kci))("fixtures/KCI_FI003273433.pdf (한글, 양쪽 정렬)", async () => {
    const { checked, misses } = await checkAgainstTextContent(kci);
    expect(checked).toBeGreaterThan(300);
    // 각주·수식 등 일부 예외는 허용하되 98% 이상 일치해야 한다.
    expect(misses.length / checked, misses.slice(0, 10).join("\n")).toBeLessThan(0.02);
  });
});
