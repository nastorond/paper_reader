import type { Highlight } from "../store/types";
import { pdfRectToPercent, type ViewportLike } from "./geometry";

interface Props {
  highlights: Highlight[];
  viewport: ViewportLike; // 배율 1
  selectedId: string | null;
}

// 캔버스와 텍스트 레이어 사이에 깔리는 하이라이트 색 레이어.
// 위치는 페이지 대비 % 라서 확대/축소해도 다시 계산하지 않는다.
// pointer-events: none 이라 텍스트 선택을 막지 않는다. 클릭 판정은 PdfPage 가 좌표로 한다.
export function HighlightLayer({ highlights, viewport, selectedId }: Props) {
  return (
    <div className="highlight-layer">
      {highlights.flatMap((h) =>
        h.rects.map((r, i) => {
          const p = pdfRectToPercent(r, viewport);
          return (
            <div
              key={`${h.id}-${i}`}
              className={h.id === selectedId ? "hl selected" : "hl"}
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: `${p.width}%`,
                height: `${p.height}%`,
                background: h.color,
              }}
            />
          );
        }),
      )}
    </div>
  );
}
