// 확대/축소 단계. scale 1 = PDF 1pt 당 CSS 1px (pdf.js 기본).
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

// 현재 배율보다 한 단계 큰 값. 단계 사이 값(폭 맞춤 등)에서도 동작한다.
export function zoomIn(scale: number): number {
  return ZOOM_STEPS.find((s) => s > scale + 1e-3) ?? MAX_ZOOM;
}

export function zoomOut(scale: number): number {
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < scale - 1e-3) return ZOOM_STEPS[i];
  }
  return MIN_ZOOM;
}

// 컨테이너 폭에 페이지 폭을 맞추는 배율. padding 은 좌우 여백 합(px).
export function fitWidthScale(containerWidth: number, pageWidthPt: number, padding = 48): number {
  if (pageWidthPt <= 0) return 1;
  return clampZoom((containerWidth - padding) / pageWidthPt);
}
