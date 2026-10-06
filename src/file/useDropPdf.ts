import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isPdfPath } from "./openPdf";

// 창에 파일을 드래그해 놓으면 첫 번째 PDF 경로로 onDrop 을 호출한다.
// Tauri 는 네이티브 드래그앤드롭을 가로채므로 HTML5 drop 이벤트 대신 이 이벤트를 쓴다.
export function useDropPdf(onDrop: (path: string) => void): boolean {
  const [dragging, setDragging] = useState(false);
  // 최신 콜백을 ref 에 담아 두면 리스너를 다시 등록하지 않아도 된다.
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") {
          setDragging(true);
        } else if (p.type === "leave") {
          setDragging(false);
        } else if (p.type === "drop") {
          setDragging(false);
          const pdf = p.paths.find(isPdfPath);
          if (pdf) onDropRef.current(pdf);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return dragging;
}
