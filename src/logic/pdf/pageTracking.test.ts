import { describe, expect, it } from "vitest";
import { anchorToScrollTop, currentPageIndex, focalToScroll, makeAnchor, makeFocalAnchor } from "./pageTracking";

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

describe("두 손가락 확대 focal", () => {
  // 폭 600, 높이 800 페이지 2장(왼쪽 여백 24, 위 12, 간격 12)
  const pages1 = [
    { left: 24, top: 12, width: 600, height: 800 },
    { left: 24, top: 824, width: 600, height: 800 },
  ];
  // 2배 확대 후
  const pages2 = [
    { left: 24, top: 12, width: 1200, height: 1600 },
    { left: 24, top: 1624, width: 1200, height: 1600 },
  ];

  it("손가락 사이 지점이 확대 후에도 같은 글자 위에 온다", () => {
    // 스크롤 (0, 700) 에서 화면 (324, 200) 지점 → 2페이지 (300, 76) 위치
    const a = makeFocalAnchor(pages1, 0, 700, 324, 200)!;
    expect(a.pageIndex).toBe(1);
    expect(a.xRatio).toBeCloseTo(0.5);
    expect(a.yRatio).toBeCloseTo(76 / 800);
    const s = focalToScroll(a, pages2);
    // 확대 후 그 글자: x = 24 + 600 = 624, y = 1624 + 152 = 1776 → 화면 (324, 200) 에 오도록
    expect(s.left).toBeCloseTo(300);
    expect(s.top).toBeCloseTo(1576);
  });

  it("스크롤은 음수가 되지 않는다", () => {
    const a = makeFocalAnchor(pages2, 0, 0, 500, 500)!;
    expect(focalToScroll(a, pages1)).toEqual({ left: 0, top: expect.any(Number) });
    expect(focalToScroll(a, pages1).top).toBeGreaterThanOrEqual(0);
  });

  it("페이지 없음", () => {
    expect(makeFocalAnchor([], 0, 0, 0, 0)).toBeNull();
  });
});
