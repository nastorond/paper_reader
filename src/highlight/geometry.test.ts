import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  boxToPdfRect,
  contextAround,
  mergeLineBoxes,
  normalizeSelectedText,
  pdfRectToPercent,
  percentContains,
} from "./geometry";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe("mergeLineBoxes", () => {
  it("같은 줄의 단어 사각형들을 하나로 합친다", () => {
    expect(mergeLineBoxes([box(10, 100, 40, 112), box(40, 101, 70, 112), box(72, 100, 90, 113)])).toEqual([
      box(10, 100, 90, 113),
    ]);
  });

  it("여러 줄 선택은 줄마다 하나씩", () => {
    const merged = mergeLineBoxes([box(50, 100, 90, 112), box(10, 115, 90, 127), box(10, 130, 30, 142)]);
    expect(merged).toEqual([box(50, 100, 90, 112), box(10, 115, 90, 127), box(10, 130, 30, 142)]);
  });

  it("같은 높이라도 멀리 떨어진(다른 단) 사각형은 합치지 않는다", () => {
    expect(mergeLineBoxes([box(10, 100, 200, 112), box(260, 100, 300, 112)])).toHaveLength(2);
  });

  it("폭·높이 0 사각형(줄바꿈 요소 등)은 버린다", () => {
    expect(mergeLineBoxes([box(10, 100, 10, 112), box(10, 100, 50, 100.2)])).toEqual([]);
  });

  it("위/아래 첨자처럼 살짝 어긋난 높이는 같은 줄로 본다", () => {
    expect(mergeLineBoxes([box(10, 100, 40, 112), box(40, 104, 46, 113)])).toEqual([box(10, 100, 46, 113)]);
  });
});

describe("좌표 변환 (실제 pdf.js viewport)", async () => {
  const doc = await getDocument({ data: new Uint8Array(readFileSync("fixtures/two-column.pdf")) }).promise;
  const page = await doc.getPage(1);

  it("화면 → PDF → %: 배율 1 과 2.5 에서 같은 PDF 좌표, 같은 % 위치", () => {
    const v1 = page.getViewport({ scale: 1 });
    const v25 = page.getViewport({ scale: 2.5 });
    const b = box(54, 100, 200, 112); // scale 1 화면 좌표
    const r1 = boxToPdfRect(b, v1);
    const r25 = boxToPdfRect(box(54 * 2.5, 100 * 2.5, 200 * 2.5, 112 * 2.5), v25);
    expect(r25).toEqual(r1);
    // US Letter 높이 792pt: 화면 y=100 → PDF y=692 (y 축 뒤집힘)
    expect(r1).toEqual({ x1: 54, y1: 680, x2: 200, y2: 692 });
    const p1 = pdfRectToPercent(r1, v1);
    const p25 = pdfRectToPercent(r1, v25);
    expect(p25.left).toBeCloseTo(p1.left, 9);
    expect(p25.top).toBeCloseTo(p1.top, 9);
    expect(p1.left).toBeCloseTo((100 * 54) / 612, 9);
    expect(p1.top).toBeCloseTo((100 * 100) / 792, 9);
    expect(p1.width).toBeCloseTo((100 * 146) / 612, 9);
  });

  it("회전된 페이지(90°)에서도 왕복 결과가 같다", () => {
    const v = page.getViewport({ scale: 1.5, rotation: 90 });
    const b = box(30, 60, 50, 300);
    const r = boxToPdfRect(b, v);
    const p = pdfRectToPercent(r, v);
    expect(p.left).toBeCloseTo((100 * 30) / v.width, 1);
    expect(p.top).toBeCloseTo((100 * 60) / v.height, 1);
    expect(p.width).toBeCloseTo((100 * 20) / v.width, 1);
    expect(p.height).toBeCloseTo((100 * 240) / v.height, 1);
  });
});

describe("기타", () => {
  it("percentContains", () => {
    const p = { left: 10, top: 10, width: 5, height: 2 };
    expect(percentContains(p, 12, 11)).toBe(true);
    expect(percentContains(p, 16, 11)).toBe(false);
  });

  it("문맥 32자, 문서 경계에서 잘림", () => {
    const text = "a".repeat(40) + "TARGET" + "b".repeat(10);
    expect(contextAround(text, 40, 46)).toEqual({ prefix: "a".repeat(32), suffix: "b".repeat(10) });
    expect(contextAround("xTARGETy", 1, 7)).toEqual({ prefix: "x", suffix: "y" });
  });

  it("선택 원문 공백 정리", () => {
    expect(normalizeSelectedText("  hyphen-\nated   at\tthe ")).toBe("hyphen- ated at the");
  });
});
