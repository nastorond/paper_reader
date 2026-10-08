import { useEffect, useRef } from "react";
import { devLog } from "../../dev/devLog";
import { readTextContent } from "../../services/pdf/textContent";
import { selectTextInLayer } from "../../dev/selectText";
import {
  AnnotationMode,
  OPS,
  RenderingCancelledException,
  TextLayer,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { buildSegments, extractGlyphs, type FontLike, type TextSegment } from "../../logic/pdf/glyphLayout";
import { renderSegmentTextLayer } from "./segmentTextLayer";
import { HighlightLayer } from "./HighlightLayer";
import { pdfRectToPercent, percentContains, type ViewportLike } from "../../logic/highlight/geometry";
import type { Highlight } from "../../logic/types";

export interface PageSize {
  // scale 1 기준 크기(CSS px = PDF pt × userUnit)
  width: number;
  height: number;
  userUnit: number;
  // 배율 1 viewport (하이라이트 좌표 변환용)
  viewport: ViewportLike;
}

interface Props {
  doc: PDFDocumentProxy;
  index: number;
  size: PageSize;
  scale: number;
  // 화면 근처에 있을 때만 캔버스·텍스트 레이어를 만든다(메모리 절약).
  active: boolean;
  highlights: Highlight[];
  selectedHighlightId: string | null;
  onHighlightClick(id: string | null): void;
}

// 한 페이지 = 캔버스(그림) + 텍스트 레이어(투명 글자, 선택·검색용) 를 겹친 것.
// 하이라이트 색 레이어는 둘 사이에 깔린다(HighlightLayer.tsx).
export function PdfPage({ doc, index, size, scale, active, highlights, selectedHighlightId, onHighlightClick }: Props) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const textLayerDivRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<TextLayer | null>(null);
  // 텍스트 레이어가 비동기로 만들어지는 동안 배율이 바뀌어도 최신 값을 쓰기 위해.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // 텍스트 레이어: 화면에 들어올 때 한 번 만든다. 글자 위치·크기가 CSS 변수
  // --total-scale-factor 로 계산되므로 확대/축소 때 다시 만들 필요가 없다.
  useEffect(() => {
    const container = textLayerDivRef.current;
    if (!active || !container) return;
    let layer: TextLayer | null = null;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(index + 1);
      if (cancelled) return;
      const [textContent, segments] = await Promise.all([readTextContent(page), readSegments(page)]);
      if (cancelled) return;
      container.replaceChildren();
      // pdf.js 는 글자 폭을 lang=<PDF 언어> 인 숨은 캔버스에서 재서 --scale-x 를 정한다.
      // 텍스트 레이어가 <html lang="ko"> 를 물려받으면 WebKit 이 serif/sans-serif 를
      // 한글 글꼴로 골라 측정값과 실제 폭이 달라지고, 선택 영역이 줄 끝으로 갈수록 밀린다.
      // 그래서 컨테이너의 lang 을 측정 캔버스와 똑같이 맞춘다.
      const lang = textContent.lang ?? "";
      container.lang = lang;
      const viewport = page.getViewport({ scale: scaleRef.current });

      if (segments.length > 0 || textContent.items.length === 0) {
        // 기본: 단어 단위 레이어(glyphLayout.ts 주석 참고)
        renderSegmentTextLayer(container, segments, textContent.styles, viewport, lang);
      } else {
        // 대체: 세로쓰기 등 단어 위치를 못 구한 페이지는 pdf.js 기본 텍스트 레이어
        layer = new TextLayer({ textContentSource: textContent, container, viewport });
        await layer.render();
        if (cancelled) return;
        layer.update({ viewport: page.getViewport({ scale: scaleRef.current }) });
        textLayerRef.current = layer;
      }
      if (import.meta.env.DEV) {
        reportTextLayer(index, container, segments, layer ? "pdfjs" : "segments", scaleRef.current);
        const needle = import.meta.env.VITE_DEV_SELECT_TEXT;
        if (needle && selectTextInLayer(container, needle) && import.meta.env.VITE_DEV_PRESS_H) {
          // 자가 테스트: 선택 후 H 키를 누른 것처럼 이벤트를 보낸다.
          setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyH", key: "h" })), 300);
        }
      }
    })().catch(reportError);
    return () => {
      cancelled = true;
      layer?.cancel();
      textLayerRef.current = null;
      container.replaceChildren();
    };
    // scale 은 일부러 의존성에서 뺀다(위 주석 참고). 배율 변경은 아래 effect 가 update 로 처리.
  }, [doc, index, active]);

  // 캔버스: 배율이 바뀔 때마다 다시 그린다. 새 캔버스를 다 그린 뒤 교체해서 깜빡임을 줄인다.
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    if (!active) {
      host.replaceChildren();
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    const render = async () => {
      const page = await doc.getPage(index + 1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      textLayerRef.current?.update({ viewport });

      // 레티나 화면에서 흐리지 않도록 실제 픽셀 수 = CSS 크기 × devicePixelRatio
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      task = page.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      await task.promise;
      if (!cancelled) host.replaceChildren(canvas);
    };
    // 이미 그려진 캔버스가 있으면(=배율 변경) 잠깐 기다렸다 다시 그린다. 두 손가락 확대 중에는
    // 배율이 계속 바뀌므로, 그동안은 기존 캔버스를 늘려 보여주고 손을 멈춘 뒤 한 번만 선명하게 그린다.
    const delay = host.childElementCount > 0 ? 150 : 0;
    const timer = setTimeout(() => void render().catch(reportError), delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [doc, index, scale, active]);

  // 클릭(드래그가 아닌)한 지점에 하이라이트가 있으면 선택한다. 레이어가 클릭을 가로채지 않으므로
  // 텍스트 선택은 그대로 되고, 판정만 좌표로 한다. 겹치면 나중에 만든 것이 우선.
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!window.getSelection()?.isCollapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (100 * (e.clientX - r.left)) / r.width;
    const y = (100 * (e.clientY - r.top)) / r.height;
    const hit = [...highlights]
      .reverse()
      .find((h) => h.rects.some((rect) => percentContains(pdfRectToPercent(rect, size.viewport), x, y)));
    onHighlightClick(hit?.id ?? null);
  };

  return (
    <div
      className="pdf-page"
      data-page-index={index}
      onClick={onClick}
      style={
        {
          width: Math.floor(size.width * scale),
          height: Math.floor(size.height * scale),
          "--scale-factor": scale,
          "--user-unit": size.userUnit,
          "--total-scale-factor": "calc(var(--scale-factor) * var(--user-unit))",
          "--scale-round-x": "1px",
          "--scale-round-y": "1px",
        } as React.CSSProperties
      }
    >
      <div className="pdf-canvas" ref={canvasHostRef} />
      <HighlightLayer highlights={highlights} viewport={size.viewport} selectedId={selectedHighlightId} />
      <div className="textLayer" ref={textLayerDivRef} />
    </div>
  );
}

function reportError(err: unknown) {
  if (err instanceof RenderingCancelledException) return;
  if (err instanceof Error && err.name === "AbortException") return;
  console.error(err);
}

// 연산자 목록에서 단어 조각을 구한다. 주석(annotation) 모양은 textContent 에도 없으므로 뺀다.
async function readSegments(page: PDFPageProxy): Promise<TextSegment[]> {
  const opList = await page.getOperatorList({ annotationMode: AnnotationMode.DISABLE });
  const getFont = (name: string) => (page.commonObjs.has(name) ? (page.commonObjs.get(name) as FontLike) : null);
  return buildSegments(extractGlyphs(opList.fnArray, opList.argsArray, OPS, getFont));
}

// 개발 진단: 텍스트 레이어 span 의 실제 폭이 PDF 상 폭(× 배율)과 맞는지 터미널로 보고한다.
function reportTextLayer(index: number, container: HTMLElement, segments: TextSegment[], mode: string, scale: number) {
  requestAnimationFrame(() => {
    const spans = Array.from(container.querySelectorAll<HTMLElement>("span:not(.eol)"));
    const errors: number[] = [];
    if (mode === "segments") {
      spans.forEach((span, i) => {
        const seg = segments[i];
        if (!seg || Math.abs(seg.angle) > 1e-3 || seg.width * scale < 20) return;
        errors.push(Math.abs(span.getBoundingClientRect().width / (seg.width * scale) - 1));
      });
    }
    errors.sort((a, b) => a - b);
    devLog(
      `page ${index + 1}: mode=${mode} spans=${spans.length} lang="${container.lang}"`,
      `widthErr median=${pct(errors[errors.length >> 1])} max=${pct(errors[errors.length - 1])}`,
    );
  });
}

function pct(v: number | undefined) {
  return v === undefined ? "-" : `${(v * 100).toFixed(1)}%`;
}
