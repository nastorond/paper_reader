import { describe, expect, it } from "vitest";
import { anchorToScrollTop, currentPageIndex, makeAnchor } from "./pageTracking";

// 높이 1000px 페이지 3장, 간격 12px, 상단 여백 12px
const tops = [12, 1024, 2036];
const heights = [1000, 1000, 1000];

describe("currentPageIndex", () => {
  it("뷰포트 30% 지점의 페이지를 현재 페이지로 본다", () => {
    expect(currentPageIndex(tops, 0, 800)).toBe(0);
    expect(currentPageIndex(tops, 800, 800)).toBe(1); // probe = 1040
    expect(currentPageIndex(tops, 5000, 800)).toBe(2);
  });

  it("빈 문서", () => {
    expect(currentPageIndex([], 100, 800)).toBe(0);
  });
});

describe("scroll anchor", () => {
  it("배율이 두 배가 돼도 같은 페이지의 같은 상대 위치로 돌아온다", () => {
    const anchor = makeAnchor(tops, heights, 1024 + 250);
    expect(anchor).toEqual({ pageIndex: 1, offsetRatio: 0.25 });

    const tops2 = [12, 2024, 4036];
    const heights2 = [2000, 2000, 2000];
    expect(anchorToScrollTop(anchor, tops2, heights2)).toBe(2024 + 500);
  });
});
