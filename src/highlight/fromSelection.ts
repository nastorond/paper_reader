import type { Rect } from "../store/types";
import {
  boxToPdfRect,
  contextAround,
  mergeLineBoxes,
  normalizeSelectedText,
  type BoxPx,
  type ViewportLike,
} from "./geometry";

export interface HighlightDraft {
  pageIndex: number;
  rects: Rect[];
  text: string;
  prefix: string;
  suffix: string;
}

export type DraftResult = { ok: true; draft: HighlightDraft } | { ok: false; reason: "empty" | "cross-page" };

function pageOf(node: Node): HTMLElement | null {
  const el = node instanceof Element ? node : node.parentElement;
  return el?.closest<HTMLElement>(".pdf-page") ?? null;
}

// 현재 브라우저 선택 영역 → 하이라이트 초안(PDF 좌표).
// baseViewport(pageIndex) 는 배율 1 viewport. 화면 사각형을 "페이지 실제 크기 대비 비율"로 바꾼 뒤
// 배율 1 좌표로 옮겨 변환하므로, 지금 배율이 얼마든 같은 결과가 나온다.
export function draftFromSelection(baseViewport: (pageIndex: number) => ViewportLike | undefined): DraftResult {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return { ok: false, reason: "empty" };
  const range = sel.getRangeAt(0);
  const pageEl = pageOf(range.startContainer);
  if (!pageEl) return { ok: false, reason: "empty" };
  if (pageOf(range.endContainer) !== pageEl) return { ok: false, reason: "cross-page" };
  const pageIndex = Number(pageEl.dataset.pageIndex);
  const viewport = baseViewport(pageIndex);
  const textLayer = pageEl.querySelector<HTMLElement>(".textLayer");
  const text = normalizeSelectedText(range.toString());
  if (!viewport || !textLayer || !text) return { ok: false, reason: "empty" };

  // 화면 사각형 → 페이지 기준 → 배율 1 좌표
  const page = pageEl.getBoundingClientRect();
  const kx = viewport.width / page.width;
  const ky = viewport.height / page.height;
  const boxes: BoxPx[] = [];
  for (const r of Array.from(range.getClientRects())) {
    const cx = (r.left + r.right) / 2 - page.left;
    const cy = (r.top + r.bottom) / 2 - page.top;
    if (cx < 0 || cy < 0 || cx > page.width || cy > page.height) continue;
    boxes.push({
      left: (r.left - page.left) * kx,
      top: (r.top - page.top) * ky,
      right: (r.right - page.left) * kx,
      bottom: (r.bottom - page.top) * ky,
    });
  }
  const rects = mergeLineBoxes(boxes).map((b) => boxToPdfRect(b, viewport));
  if (rects.length === 0) return { ok: false, reason: "empty" };

  // 문맥: 텍스트 레이어 전체 글자 중 선택 시작·끝 위치
  const before = document.createRange();
  before.setStart(textLayer, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  const ctx = contextAround(textLayer.textContent ?? "", start, end);
  const squash = (s: string) => s.replace(/\s+/g, " ");

  return { ok: true, draft: { pageIndex, rects, text, prefix: squash(ctx.prefix), suffix: squash(ctx.suffix) } };
}
