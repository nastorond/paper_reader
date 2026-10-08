import { useEffect, useRef } from "react";
import { isModKey } from "../../services/platform";

interface Handlers {
  hasDocument: boolean;
  onHighlight(): void; // H
  onCloseNote(): void; // Esc (노트 입력 중에도)
  onDeleteSelected?(): void; // Delete/Backspace — 하이라이트가 선택돼 있을 때만 넘긴다
  onOpen(): void; // ⌘O / Ctrl+O
  onZoomIn(): void; // ⌘= / Ctrl+=
  onZoomOut(): void; // ⌘- / Ctrl+-
  onFitWidth(): void; // ⌘0 / Ctrl+0
}

// 데스크톱 단축키. 보드(Excalidraw) 안의 키 입력은 Excalidraw 단축키(H=손 도구, Esc=선택 해제,
// ⌘± = 캔버스 확대)라 건드리지 않는다. H 는 e.code 로 본다: 한글 입력 상태에서는 e.key 가 "ㅗ" 가 된다.
export function useShortcuts(handlers: Handlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      if (inBoard(e.target)) return;
      if (isModKey(e)) {
        if (e.key === "o") {
          e.preventDefault();
          h.onOpen();
        } else if (!h.hasDocument) {
          return;
        } else if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          h.onZoomIn();
        } else if (e.key === "-") {
          e.preventDefault();
          h.onZoomOut();
        } else if (e.key === "0") {
          e.preventDefault();
          h.onFitWidth();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (e.key === "Escape") {
        h.onCloseNote();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "KeyH") {
        e.preventDefault();
        h.onHighlight();
      } else if ((e.key === "Backspace" || e.key === "Delete") && h.onDeleteSelected) {
        e.preventDefault();
        h.onDeleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function inBoard(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".board-host") !== null;
}
