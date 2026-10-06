// 스크롤 위치로 현재 페이지를 판단하는 순수 함수들.
// pageTops[i] = i번째 페이지 상단의 스크롤 컨테이너 내부 y 좌표(오름차순).

// 뷰포트 상단에서 viewportHeight * 0.3 지점을 지나고 있는 페이지를 "현재 페이지"로 본다.
export function currentPageIndex(pageTops: number[], scrollTop: number, viewportHeight: number): number {
  if (pageTops.length === 0) return 0;
  const probe = scrollTop + viewportHeight * 0.3;
  let lo = 0;
  let hi = pageTops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pageTops[mid] <= probe) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// 확대/축소 전후로 같은 내용을 보도록 스크롤 위치를 유지하기 위한 앵커.
export interface ScrollAnchor {
  pageIndex: number;
  // 페이지 높이 대비 뷰포트 상단의 상대 위치 (0 = 페이지 상단)
  offsetRatio: number;
}

export function makeAnchor(pageTops: number[], pageHeights: number[], scrollTop: number): ScrollAnchor {
  const pageIndex = currentPageIndex(pageTops, scrollTop, 0);
  const h = pageHeights[pageIndex] || 1;
  return { pageIndex, offsetRatio: (scrollTop - (pageTops[pageIndex] ?? 0)) / h };
}

export function anchorToScrollTop(anchor: ScrollAnchor, pageTops: number[], pageHeights: number[]): number {
  const top = pageTops[anchor.pageIndex] ?? 0;
  return top + anchor.offsetRatio * (pageHeights[anchor.pageIndex] ?? 0);
}

// ---- 두 손가락 확대: 손가락 사이 지점(focal)이 확대 전후 같은 글자 위에 있도록 ----

// 페이지 상자(스크롤 컨테이너 내부 좌표, CSS px)
export interface PageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

// 확대 직전: 화면의 (viewX, viewY) 지점이 어느 페이지의 어느 비율 위치인지 기억한다.
export interface FocalAnchor {
  pageIndex: number;
  xRatio: number; // 페이지 폭 대비(범위를 벗어날 수 있음: 페이지 옆 여백)
  yRatio: number;
  viewX: number; // 스크롤 컨테이너 기준 화면 좌표
  viewY: number;
}

export function makeFocalAnchor(
  pages: PageBox[],
  scrollLeft: number,
  scrollTop: number,
  viewX: number,
  viewY: number,
): FocalAnchor | null {
  if (pages.length === 0) return null;
  const y = scrollTop + viewY;
  // 그 높이를 지나는 페이지(페이지 사이 간격이면 위쪽 페이지)
  const pageIndex = currentPageIndex(
    pages.map((p) => p.top),
    y,
    0,
  );
  const p = pages[pageIndex];
  return {
    pageIndex,
    xRatio: (scrollLeft + viewX - p.left) / p.width,
    yRatio: (y - p.top) / p.height,
    viewX,
    viewY,
  };
}

// 확대 직후(새 페이지 상자 기준): 같은 지점이 다시 (viewX, viewY) 에 오도록 하는 스크롤 위치.
export function focalToScroll(a: FocalAnchor, pages: PageBox[]): { left: number; top: number } {
  const p = pages[a.pageIndex];
  if (!p) return { left: 0, top: 0 };
  return {
    left: Math.max(0, p.left + a.xRatio * p.width - a.viewX),
    top: Math.max(0, p.top + a.yRatio * p.height - a.viewY),
  };
}
