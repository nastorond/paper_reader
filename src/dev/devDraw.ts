import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// 개발 자가 테스트: 빈 보드면 사각형과 한글 텍스트를 그려 넣는다(저장·복원·글꼴 확인용).
// StrictMode 로 인스턴스가 두 번 만들어질 수 있어, 장면이 비어 있을 때만 그린다.
export function devDraw(api: ExcalidrawImperativeAPI) {
  if (!import.meta.env.VITE_DEV_DRAW) return;
  setTimeout(() => {
    if (api.getSceneElements().length > 0) return;
    api.updateScene({
      elements: convertToExcalidrawElements([
        { type: "rectangle", x: 40, y: 40, width: 220, height: 110, strokeColor: "#1971c2" },
        { type: "text", x: 60, y: 75, text: "전리층 지연 1차 제거", fontSize: 20 },
      ]),
    });
  }, 500);
}
