import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, clampZoom, fitWidthScale, zoomIn, zoomOut } from "./zoom";

describe("zoom", () => {
  it("한 단계씩 확대/축소한다", () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
  });

  it("단계 사이 값에서도 가장 가까운 다음 단계로 간다", () => {
    expect(zoomIn(1.3)).toBe(1.5);
    expect(zoomOut(1.3)).toBe(1.25);
  });

  it("범위를 벗어나지 않는다", () => {
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
  });

  it("폭 맞춤 배율", () => {
    // A4 폭 595pt, 컨테이너 1000px, 여백 48px → (1000-48)/595
    expect(fitWidthScale(1000, 595)).toBeCloseTo(952 / 595);
    expect(fitWidthScale(100000, 595)).toBe(MAX_ZOOM);
  });
});
