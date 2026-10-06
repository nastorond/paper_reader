import { useEffect, useRef } from "react";
import { RenderingCancelledException, TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";

export interface PageSize {
  // scale 1 기준 크기(CSS px = PDF pt × userUnit)
  width: number;
  height: number;
  userUnit: number;
}

interface Props {
  doc: PDFDocumentProxy;
  index: number;
  size: PageSize;
  scale: number;
  // 화면 근처에 있을 때만 캔버스·텍스트 레이어를 만든다(메모리 절약).
  active: boolean;
}

// 한 페이지 = 캔버스(그림) + 텍스트 레이어(투명 글자, 선택·검색용) 를 겹친 것.
// 하이라이트 오버레이(M1)는 이 위에 레이어를 하나 더 얹을 예정.
export function PdfPage({ doc, index, size, scale, active }: Props) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const textLayerDivRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<TextLayer | null>(null);

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
      container.replaceChildren();
      layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport: page.getViewport({ scale }),
      });
      await layer.render();
      if (!cancelled) textLayerRef.current = layer;
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
    (async () => {
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
    })().catch(reportError);
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, index, scale, active]);

  return (
    <div
      className="pdf-page"
      data-page-index={index}
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
      <div className="textLayer" ref={textLayerDivRef} />
    </div>
  );
}

function reportError(err: unknown) {
  if (err instanceof RenderingCancelledException) return;
  if (err instanceof Error && err.name === "AbortException") return;
  console.error(err);
}
