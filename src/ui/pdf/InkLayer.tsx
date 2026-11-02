import { useEffect, useRef } from "react";
import type { ViewportLike } from "../../logic/highlight/geometry";
import { cssToInkPoint, inkPointToCss, strokeWidthPx, type InkPoint, type InkSample, type InkStroke } from "../../logic/ink/ink";

const INK_COLOR = "#1d4ed8";
const INK_WIDTH = 1; // PDF pt

interface Props {
  pageIndex: number;
  viewport: ViewportLike; // 배율 1
  scale: number;
  width: number; // CSS px
  height: number;
  enabled: boolean;
  strokes: InkStroke[];
  onStroke(stroke: InkStroke): void;
  onSample(sample: InkSample): void;
}

// 한 페이지 위의 필기 캔버스. 펜 입력만 그리고 손가락은 그대로 스크롤·확대로 넘긴다.
// 그리는 동안에는 React 상태를 바꾸지 않고 캔버스에 바로 그린다(다시 그리기가 끼어들면 필기가 늦어진다).
export function InkLayer({ pageIndex, viewport, scale, width, height, enabled, strokes, onStroke, onSample }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ scale, viewport, onStroke, onSample });
  latest.current = { scale, viewport, onStroke, onSample };

  // 저장된 획 다시 그리기(배율이 바뀌거나 획이 늘었을 때)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) {
      for (let i = 1; i < s.points.length; i++) drawSegment(ctx, s, i, viewport, scale);
    }
  }, [strokes, viewport, scale, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    let current: InkStroke | null = null;
    let pointerId = -1;
    let startedAt = 0;
    let delaySum = 0;
    let delayCount = 0;
    let maxPressure = 0;
    let pointerType = "";

    const toPoint = (e: PointerEvent, rect: DOMRect): InkPoint =>
      cssToInkPoint(latest.current.viewport, e.clientX - rect.left, e.clientY - rect.top, latest.current.scale, e.pressure);

    const addEvents = (e: PointerEvent) => {
      if (!current) return;
      const ctx = canvas.getContext("2d");
      const rect = canvas.getBoundingClientRect();
      // 화면 한 프레임 사이에 들어온 입력을 모두 쓴다. 지원하지 않으면 이벤트 하나만.
      const coalesced = e.getCoalescedEvents?.() ?? [];
      for (const ev of coalesced.length > 0 ? coalesced : [e]) {
        current.points.push(toPoint(ev, rect));
        maxPressure = Math.max(maxPressure, ev.pressure);
        if (ctx) drawSegment(ctx, current, current.points.length - 1, latest.current.viewport, latest.current.scale);
      }
      delaySum += performance.now() - e.timeStamp;
      delayCount++;
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (!current || e.pointerId !== pointerId) return;
      const stroke = current;
      current = null;
      latest.current.onSample({
        pointerType,
        points: stroke.points.length,
        durationMs: e.timeStamp - startedAt,
        avgDelayMs: delayCount > 0 ? delaySum / delayCount : 0,
        maxPressure,
        cancelled,
      });
      if (stroke.points.length > 1) latest.current.onStroke(stroke);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || current) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      pointerId = e.pointerId;
      pointerType = e.pointerType;
      startedAt = e.timeStamp;
      delaySum = 0;
      delayCount = 0;
      maxPressure = e.pressure;
      current = {
        id: crypto.randomUUID(),
        pageIndex,
        color: INK_COLOR,
        width: INK_WIDTH,
        points: [toPoint(e, canvas.getBoundingClientRect())],
      };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId === pointerId) addEvents(e);
    };
    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);

    // iPad 는 Pencil 로 끌어도 스크롤한다. Pencil 터치만 막아서 손가락 스크롤은 그대로 둔다.
    // preventDefault 를 쓰려면 passive 가 아니어야 해서 React 대신 직접 등록한다.
    const onTouch = (e: TouchEvent) => {
      const isStylus = Array.from(e.touches).some((t) => (t as Touch & { touchType?: string }).touchType === "stylus");
      if (isStylus) e.preventDefault();
    };
    // 필기 중 펜으로 누른 것이 하이라이트 클릭으로 넘어가지 않게 한다.
    const onClick = (e: MouseEvent) => e.stopPropagation();

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("touchmove", onTouch, { passive: false });
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("click", onClick);
    };
  }, [enabled, pageIndex]);

  return <canvas ref={canvasRef} className={enabled ? "ink-layer on" : "ink-layer"} />;
}

// i-1 → i 번째 점을 잇는다. 굵기는 그 구간의 필압을 쓴다.
function drawSegment(ctx: CanvasRenderingContext2D, s: InkStroke, i: number, viewport: ViewportLike, scale: number) {
  if (i < 1) return;
  const a = inkPointToCss(viewport, s.points[i - 1], scale);
  const b = inkPointToCss(viewport, s.points[i], scale);
  ctx.strokeStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineWidth = strokeWidthPx(s.width, s.points[i].p, scale);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
