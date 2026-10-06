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
