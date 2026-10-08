import type { TextSegment } from "../logic/pdf/glyphLayout";
import { devLog } from "./devLog";
import { selectTextInLayer } from "./selectText";

// 개발 자가 테스트: 텍스트 레이어를 만든 직후(PdfPage) 호출된다.
//  - 진단: span 폭이 PDF 상 폭과 맞는지 터미널로 보고
//  - VITE_DEV_SELECT_TEXT: 그 문구를 선택, VITE_DEV_PRESS_H: 이어서 H 키를 누른 것처럼
export function devAfterTextLayer(index: number, container: HTMLElement, segments: TextSegment[], mode: string, scale: number) {
  reportTextLayer(index, container, segments, mode, scale);
  const needle = import.meta.env.VITE_DEV_SELECT_TEXT;
  if (needle && selectTextInLayer(container, needle) && import.meta.env.VITE_DEV_PRESS_H) {
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyH", key: "h" })), 300);
  }
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
