import { setLayerDimensions, type PageViewport } from "pdfjs-dist";
import type { TextContent } from "pdfjs-dist/types/src/display/api";
import type { TextSegment } from "./glyphLayout";

// 단어 조각(TextSegment) 단위로 투명 텍스트 레이어를 만든다.
// pdf.js TextLayer 와 같은 CSS(pdf_viewer.css 의 .textLayer)를 쓰도록 같은 CSS 변수를 채운다.
//
// 각 span 의 가로 배율(--scale-x)은 "PDF 상 폭 / 브라우저 글꼴로 잰 폭" 이라 배율(확대율)과 무관하다.
// 글자 크기와 위치는 --total-scale-factor 로 계산되므로 확대/축소 때 다시 만들 필요가 없다.

const MEASURE_FONT_PX = 100;

let measureCtx: { ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement } | null = null;
let minFontSize: number | null = null;

function getMeasureCtx(lang: string): CanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;display:none;letter-spacing:normal;word-spacing:normal";
    document.body.append(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    measureCtx = { ctx, canvas };
  }
  // 측정용 캔버스와 텍스트 레이어의 lang 이 같아야 같은 글꼴로 측정된다(PdfPage.tsx 주석 참고).
  measureCtx.canvas.lang = lang;
  return measureCtx.ctx;
}

// 브라우저 최소 글꼴 크기 설정 대응(pdf.js TextLayer 와 같은 방식)
function getMinFontSize(): number {
  if (minFontSize === null) {
    const div = document.createElement("div");
    div.style.cssText = "opacity:0;line-height:1;font-size:1px;position:absolute";
    div.textContent = "X";
    document.body.append(div);
    minFontSize = div.getBoundingClientRect().height || 1;
    div.remove();
  }
  return minFontSize;
}

export function renderSegmentTextLayer(
  container: HTMLDivElement,
  segments: TextSegment[],
  styles: TextContent["styles"],
  viewport: PageViewport,
  lang: string,
): void {
  container.replaceChildren();
  container.style.setProperty("--min-font-size", String(getMinFontSize()));
  setLayerDimensions(container, viewport);

  const { pageWidth, pageHeight, pageX, pageY } = viewport.rawDims as {
    pageWidth: number;
    pageHeight: number;
    pageX: number;
    pageY: number;
  };
  const ctx = getMeasureCtx(lang);
  const frag = document.createDocumentFragment();

  for (const seg of segments) {
    const style = styles[seg.fontName];
    const fontFamily = style?.fontFamily ?? "sans-serif";
    const ascentRatio = style?.ascent ?? 0.8;

    // 사용자 공간(y 위로 증가) → 페이지 좌상단 기준(y 아래로 증가)
    const X = seg.x - pageX;
    const Y = pageY + pageHeight - seg.y;
    const angle = -seg.angle; // y 축 뒤집힘
    const ascent = seg.size * ascentRatio;
    const left = X + ascent * Math.sin(angle);
    const top = Y - ascent * Math.cos(angle);

    const span = document.createElement("span");
    span.textContent = seg.text;
    span.setAttribute("role", "presentation");
    const st = span.style;
    st.left = `${((100 * left) / pageWidth).toFixed(3)}%`;
    st.top = `${((100 * top) / pageHeight).toFixed(3)}%`;
    st.fontFamily = fontFamily;
    st.setProperty("--font-height", `${Math.round(seg.size * 100) / 100}px`);
    if (Math.abs(angle) > 1e-3) st.setProperty("--rotate", `${(angle * 180) / Math.PI}deg`);

    ctx.font = `${MEASURE_FONT_PX}px ${fontFamily}`;
    const measured = ctx.measureText(seg.text).width;
    if (measured > 0) {
      // 화면 폭 = measured/100 × size × scale, 목표 폭 = width × scale
      st.setProperty("--scale-x", String((seg.width * MEASURE_FONT_PX) / (measured * seg.size)));
    }
    frag.append(span);
    if (seg.endOfLine) {
      const br = document.createElement("br");
      br.setAttribute("role", "presentation");
      frag.append(br);
    }
  }
  container.append(frag);
}
