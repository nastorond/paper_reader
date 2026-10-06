import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isImagePath, isPdfPath } from "./openPdf";

// 창에 파일을 끌어다 놓을 때의 처리.
// Tauri 는 네이티브 드래그앤드롭을 가로채므로(HTML5 drop 이벤트가 웹뷰에 오지 않음) 이 이벤트를 쓴다.
// - 보드(Excalidraw) 위에 이미지를 놓으면 onImages
// - 그 밖의 곳에 PDF 를 놓으면 onPdf
export type DragTarget = "none" | "pdf" | "board";

interface Handlers {
  onPdf(path: string): void;
  onImages(paths: string[], clientX: number, clientY: number): void;
}

function targetAt(x: number, y: number): DragTarget {
  const el = document.elementFromPoint(x, y);
  return el?.closest(".board-host") ? "board" : "pdf";
}

export function useFileDrop(handlers: Handlers): DragTarget {
  const [target, setTarget] = useState<DragTarget>("none");
  // 최신 콜백을 ref 에 담아 두면 리스너를 다시 등록하지 않아도 된다.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "leave") {
          setTarget("none");
          return;
        }
        // 위치는 물리 픽셀 → CSS px
        const x = p.position.x / window.devicePixelRatio;
        const y = p.position.y / window.devicePixelRatio;
        const where = targetAt(x, y);
        if (p.type === "enter" || p.type === "over") {
          setTarget(where);
        } else if (p.type === "drop") {
          setTarget("none");
          if (where === "board") {
            const images = p.paths.filter(isImagePath);
            if (images.length > 0) ref.current.onImages(images, x, y);
          } else {
            const pdf = p.paths.find(isPdfPath);
            if (pdf) ref.current.onPdf(pdf);
          }
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

  return target;
}
