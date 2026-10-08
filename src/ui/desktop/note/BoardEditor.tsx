import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, MainMenu, hashElementsVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import { devDraw } from "../../../dev/devDraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
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
