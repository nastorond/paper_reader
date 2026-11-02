import type { ViewportLike } from "../highlight/geometry";

// 펜 필기 획(순수 로직, 테스트 대상). 하이라이트처럼 PDF 좌표로 저장해 확대해도 같은 자리에 있다.

export interface InkPoint {
  x: number; // PDF 좌표(user space)
  y: number;
  p: number; // 필압 0~1
}

export interface InkStroke {
  id: string;
  pageIndex: number;
  color: string;
  width: number; // 기본 굵기(PDF pt)
  points: InkPoint[];
}

// 페이지 기준 CSS px → PDF 좌표. viewport 는 배율 1 기준이라 현재 배율로 나눈 값을 넘긴다.
export function cssToInkPoint(viewport: ViewportLike, cssX: number, cssY: number, scale: number, pressure: number): InkPoint {
  const [x, y] = viewport.convertToPdfPoint(cssX / scale, cssY / scale);
  return { x, y, p: pressure };
}

// PDF 좌표 → 페이지 기준 CSS px
export function inkPointToCss(viewport: ViewportLike, pt: InkPoint, scale: number): { x: number; y: number } {
  const [x, y] = viewport.convertToViewportPoint(pt.x, pt.y);
  return { x: x * scale, y: y * scale };
}

// 필압에 따른 화면 굵기(CSS px). 필압 정보가 없으면(0) 중간 굵기로 그린다.
export function strokeWidthPx(width: number, pressure: number, scale: number): number {
  const p = pressure > 0 ? Math.min(pressure, 1) : 0.5;
  return width * scale * (0.5 + p);
}

export function groupByPage(strokes: InkStroke[]): Map<number, InkStroke[]> {
  const m = new Map<number, InkStroke[]>();
  for (const s of strokes) {
    const list = m.get(s.pageIndex);
    if (list) list.push(s);
    else m.set(s.pageIndex, [s]);
  }
  return m;
}

// 시험판 측정값: 입력이 초당 몇 번 들어왔는지, 이벤트가 몇 ms 늦게 처리됐는지
export interface InkSample {
  pointerType: string;
  points: number;
  durationMs: number;
  avgDelayMs: number;
  maxPressure: number;
  cancelled: boolean;
}

export function samplesPerSecond(s: Pick<InkSample, "points" | "durationMs">): number {
  return s.durationMs > 0 ? Math.round(((s.points - 1) * 1000) / s.durationMs) : 0;
}
