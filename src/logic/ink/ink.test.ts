import { describe, expect, it } from "vitest";
import { cssToInkPoint, groupByPage, inkPointToCss, samplesPerSecond, strokeWidthPx, type InkStroke } from "./ink";
import type { ViewportLike } from "../highlight/geometry";

// 높이 800 인 페이지(pdf.js 처럼 y 가 뒤집힘)
const viewport: ViewportLike = {
  width: 600,
  height: 800,
  convertToPdfPoint: (x, y) => [x, 800 - y],
  convertToViewportPoint: (x, y) => [x, 800 - y],
};

describe("획 좌표", () => {
  it("배율이 달라도 같은 PDF 좌표가 되고, 되돌리면 그 배율의 화면 위치", () => {
    const a = cssToInkPoint(viewport, 100, 200, 1, 0.5);
    const b = cssToInkPoint(viewport, 200, 400, 2, 0.5);
    expect(a).toEqual({ x: 100, y: 600, p: 0.5 });
    expect(b).toEqual(a);
    expect(inkPointToCss(viewport, a, 2)).toEqual({ x: 200, y: 400 });
  });
});

describe("획 굵기", () => {
  it("필압과 배율에 비례하고, 필압이 없으면 중간 굵기", () => {
    expect(strokeWidthPx(2, 1, 1)).toBe(3);
    expect(strokeWidthPx(2, 0.5, 2)).toBe(4);
    expect(strokeWidthPx(2, 0, 1)).toBe(2);
  });
});

describe("groupByPage", () => {
  it("페이지별로 나눈다", () => {
    const s = (id: string, pageIndex: number): InkStroke => ({ id, pageIndex, color: "#000", width: 1, points: [] });
    const m = groupByPage([s("a", 0), s("b", 1), s("c", 0)]);
    expect(m.get(0)?.map((x) => x.id)).toEqual(["a", "c"]);
    expect(m.get(1)?.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("samplesPerSecond", () => {
  it("입력 간격으로 초당 횟수를 구한다", () => {
    expect(samplesPerSecond({ points: 121, durationMs: 500 })).toBe(240);
    expect(samplesPerSecond({ points: 1, durationMs: 0 })).toBe(0);
  });
});
