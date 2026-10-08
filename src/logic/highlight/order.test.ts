import { describe, expect, it } from "vitest";
import { readingOrder } from "./order";
import type { Highlight } from "../types";

const h = (id: string, pageIndex: number, x: number, y: number): Highlight => ({
  id,
  documentId: "d",
  pageIndex,
  rects: [{ x1: x, y1: y - 10, x2: x + 50, y2: y }],
  text: id,
  prefix: "",
  suffix: "",
  color: "#fde047",
  createdAt: "2026-10-01T00:00:00Z",
});

describe("readingOrder", () => {
  it("페이지 → 위에서 아래 → 왼쪽에서 오른쪽", () => {
    const list = [h("p2", 1, 50, 700), h("p1-bottom", 0, 50, 100), h("p1-top-right", 0, 300, 700), h("p1-top-left", 0, 50, 700)];
    expect(readingOrder(list).map((x) => x.id)).toEqual(["p1-top-left", "p1-top-right", "p1-bottom", "p2"]);
  });

  it("원래 배열은 바꾸지 않는다", () => {
    const list = [h("b", 1, 0, 0), h("a", 0, 0, 0)];
    readingOrder(list);
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
  });
});
