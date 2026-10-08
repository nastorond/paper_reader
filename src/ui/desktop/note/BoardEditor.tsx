import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, MainMenu, convertToExcalidrawElements, hashElementsVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import "../../../services/excalidrawAssets";

interface Props {
  initialBoard: unknown | null;
  onChange(board: unknown): void;
}

// 보드 탭(Excalidraw 화이트보드). NotePanel.tsx 에서 lazy 로 불러와 보드 탭을 처음 열 때만 로드된다.
export default function BoardEditor({ initialBoard, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialData = useMemo(() => (initialBoard ?? null) as ExcalidrawInitialDataState | null, [initialBoard]);
  const theme = useSystemTheme();

  // onChange 는 선택·커서 이동에도 불리므로, 도형·첨부 파일이 실제로 바뀐 경우에만 저장을 요청한다.
  const lastHash = useRef<string | null>(null);

  return (
    <div className="board-host">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={import.meta.env.DEV ? devDraw : undefined}
        langCode="ko-KR"
        theme={theme}
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false },
        }}
        onChange={(elements, appState, files) => {
          const hash = `${hashElementsVersion(elements)}:${Object.keys(files).length}:${appState.viewBackgroundColor}`;
          if (lastHash.current === null) {
            lastHash.current = hash; // 처음 불러온 상태는 저장하지 않는다
            return;
          }
          if (hash === lastHash.current) return;
          lastHash.current = hash;
          // "local" 형식: .excalidraw 파일 저장과 같은 형식. 붙여넣은 이미지 데이터(files)도 들어간다.
          // ("database" 형식은 이미지를 따로 저장하는 서비스용이라 files 를 뺀다)
          onChangeRef.current(JSON.parse(serializeAsJSON(elements, appState, files, "local")));
        }}
      >
        {/* 기본 메뉴의 외부 링크(소셜·Excalidraw+ 등)를 빼고 필요한 항목만 둔다 */}
        <MainMenu>
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}

function useSystemTheme(): "light" | "dark" {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark ? "dark" : "light";
}

// 개발 자가 테스트: 빈 보드면 사각형과 한글 텍스트를 그려 넣는다(저장·복원·글꼴 확인용).
// StrictMode 로 인스턴스가 두 번 만들어질 수 있어, 장면이 비어 있을 때만 그린다.
function devDraw(api: ExcalidrawImperativeAPI) {
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
