import type { Rect } from "../store/types";

// 하이라이트 좌표 변환. CLAUDE.md "하이라이트 위치 저장" 참고.
// - 저장: 선택 영역의 화면 사각형(페이지 기준 CSS px) → 같은 줄끼리 합침 → PDF 좌표(Rect)
// - 표시: PDF 좌표 → 페이지 크기 대비 % 위치. 확대율과 무관하므로 확대/축소해도 다시 계산할 필요 없다.

// pdf.js PageViewport 중 여기서 쓰는 부분
export interface ViewportLike {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportPoint(x: number, y: number): number[];
}

// 페이지 왼쪽 위 기준 CSS px 사각형
export interface BoxPx {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// 표시용: 페이지 크기 대비 %
export interface BoxPercent {
  left: number;
  top: number;
  width: number;
  height: number;
}

// 같은 줄에 있는(세로로 절반 이상 겹치는) 사각형들을 가로로 이어 붙인다.
// 단어마다 span 이 나뉜 텍스트 레이어에서 나온 사각형을 줄 단위로 만든다.
// maxGap: 이보다 멀리 떨어진 같은 높이의 사각형(예: 다른 단)은 합치지 않는다.
export function mergeLineBoxes(boxes: BoxPx[], maxGap = 12): BoxPx[] {
  const valid = boxes.filter((b) => b.right - b.left > 0.5 && b.bottom - b.top > 0.5);
  const sorted = [...valid].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: BoxPx[][] = [];
  for (const b of sorted) {
    const line = lines.find((l) => sameLine(l[0], b));
    if (line) line.push(b);
    else lines.push([b]);
  }
  const out: BoxPx[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.left - b.left);
    let cur = { ...line[0] };
    for (const b of line.slice(1)) {
      if (b.left - cur.right <= maxGap) {
        cur = {
          left: Math.min(cur.left, b.left),
          top: Math.min(cur.top, b.top),
          right: Math.max(cur.right, b.right),
          bottom: Math.max(cur.bottom, b.bottom),
        };
      } else {
        out.push(cur);
        cur = { ...b };
      }
    }
    out.push(cur);
  }
  return out;
}

function sameLine(a: BoxPx, b: BoxPx): boolean {
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const minH = Math.min(a.bottom - a.top, b.bottom - b.top);
  return overlap > minH * 0.5;
}

// 화면(현재 배율 viewport) 사각형 → PDF 사용자 공간 사각형
export function boxToPdfRect(box: BoxPx, viewport: ViewportLike): Rect {
  const [ax, ay] = viewport.convertToPdfPoint(box.left, box.top);
  const [bx, by] = viewport.convertToPdfPoint(box.right, box.bottom);
  return {
    x1: round(Math.min(ax, bx)),
    y1: round(Math.min(ay, by)),
    x2: round(Math.max(ax, bx)),
    y2: round(Math.max(ay, by)),
  };
}

// PDF 사각형 → 페이지 대비 %. 어떤 배율의 viewport 를 넣어도 결과는 같다.
export function pdfRectToPercent(rect: Rect, viewport: ViewportLike): BoxPercent {
  const [x1, y1] = viewport.convertToViewportPoint(rect.x1, rect.y1);
  const [x2, y2] = viewport.convertToViewportPoint(rect.x2, rect.y2);
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  return {
    left: (100 * left) / viewport.width,
    top: (100 * top) / viewport.height,
    width: (100 * Math.abs(x2 - x1)) / viewport.width,
    height: (100 * Math.abs(y2 - y1)) / viewport.height,
  };
}

export function percentContains(box: BoxPercent, xPct: number, yPct: number): boolean {
  return xPct >= box.left && xPct <= box.left + box.width && yPct >= box.top && yPct <= box.top + box.height;
}

// 저장 크기를 줄이려 0.01pt 단위로 반올림(화면에서 구분 안 되는 정밀도).
function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// 선택한 문구 앞뒤 문맥(나중에 좌표가 어긋날 때 재정렬에 쓴다).
export function contextAround(text: string, start: number, end: number, n = 32): { prefix: string; suffix: string } {
  return { prefix: text.slice(Math.max(0, start - n), start), suffix: text.slice(end, end + n) };
}

// 선택한 원문 정리: 줄바꿈·연속 공백을 공백 하나로.
export function normalizeSelectedText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
