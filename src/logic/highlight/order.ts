import type { Highlight } from "../types";

// 목록 순서: 페이지 → 위에서 아래(PDF 좌표는 y 가 위로 증가) → 왼쪽에서 오른쪽.
// 2단 편집에서 단 순서까지 맞추지는 않는다(같은 높이면 왼쪽 단이 먼저).
export function readingOrder(highlights: Highlight[]): Highlight[] {
  const top = (h: Highlight) => Math.max(...h.rects.map((r) => r.y2));
  const left = (h: Highlight) => Math.min(...h.rects.map((r) => r.x1));
  return [...highlights].sort(
    (a, b) => a.pageIndex - b.pageIndex || top(b) - top(a) || left(a) - left(b) || a.createdAt.localeCompare(b.createdAt),
  );
}
