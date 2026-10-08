import { useEffect, useRef, type RefObject } from "react";
import { clampZoom } from "../logic/pdf/zoom";
import { readingOrder } from "../logic/highlight/order";
import { safeFileName } from "../logic/export/notesMarkdown";
import { readImageFile } from "../services/files/openPdf";
import { buildNotesMarkdown } from "../services/export/exportNotes";
import { dropFilesOnBoard } from "../ui/desktop/note/boardDrop";
import type { PdfViewerHandle } from "../ui/pdf/PdfViewer";
import type { OpenedDocument } from "../services/documents";
import type { Highlights } from "../ui/hooks/useHighlights";
import { devLog } from "./devLog";

interface Deps {
  doc: OpenedDocument | null;
  hl: Highlights;
  openPath(path: string): Promise<void>;
  setScale(scale: number): void;
  viewerRef: RefObject<PdfViewerHandle | null>;
  bundleDir: string | null;
  exportBundleNow(): Promise<void>;
}

// 개발 모드 자가 테스트(VITE_DEV_* 환경변수, src/vite-env.d.ts 참고). 프로덕션 빌드에서는 아무것도 하지 않는다.
// 앱 화면 코드와 섞이지 않도록 여기에 모은다.
export function useDesktopDevHooks(d: Deps): void {
  const env = import.meta.env;
  const { doc, hl } = d;
  // 함수들은 ref 로 읽어서, effect 가 매 렌더마다 다시 걸리지 않게(타이머가 계속 미뤄지지 않게) 한다.
  const ref = useRef(d);
  ref.current = d;
  const { highlights, ordered, selectedId, noteTab } = hl;

  // PDF 자동 열기(StrictMode 의 effect 이중 실행에도 한 번만)
  const opened = useRef(false);
  useEffect(() => {
    if (!env.DEV || !env.VITE_DEV_OPEN_PDF || opened.current) return;
    opened.current = true;
    void ref.current.openPath(env.VITE_DEV_OPEN_PDF);
  }, [env]);

  // 열고 1.5초 뒤 배율 바꾸기
  useEffect(() => {
    const devZoom = env.DEV && env.VITE_DEV_ZOOM ? Number(env.VITE_DEV_ZOOM) : NaN;
    if (!doc || !Number.isFinite(devZoom)) return;
    const t = setTimeout(() => ref.current.setScale(clampZoom(devZoom)), 1500);
    return () => clearTimeout(t);
  }, [doc, env]);

  // 페이지로 이동
  useEffect(() => {
    const page = env.DEV ? Number(env.VITE_DEV_GOTO_PAGE) : NaN;
    if (!doc || !Number.isInteger(page)) return;
    const t = setTimeout(() => ref.current.viewerRef.current?.scrollToPage(page - 1), 500);
    return () => clearTimeout(t);
  }, [doc, env]);

  // 첫 하이라이트의 노트 열기
  useEffect(() => {
    if (!env.DEV || !env.VITE_DEV_OPEN_NOTE || !doc || highlights.length === 0 || selectedId) return;
    const first = highlights[0].id;
    const t = setTimeout(() => ref.current.hl.select(first), 800);
    return () => clearTimeout(t);
  }, [doc, highlights, selectedId, env]);

  // 목록 첫 하이라이트 색 바꾸기 / 확인창 없이 삭제
  const edited = useRef(false);
  useEffect(() => {
    if (!env.DEV || !doc || ordered.length === 0 || edited.current) return;
    const color = env.VITE_DEV_COLOR_FIRST;
    const del = env.VITE_DEV_DELETE_FIRST;
    if (!color && !del) return;
    edited.current = true;
    const first = ordered[0];
    const h = ref.current.hl;
    const t = setTimeout(() => void (del ? h.remove(first) : h.changeColor(first.id, color!)), 1000);
    return () => clearTimeout(t);
  }, [doc, ordered, env]);

  // 저장 창 없이 마크다운을 만들어 개발 서버가 .dev-data/export/ 에 쓰게 한다
  useEffect(() => {
    if (!env.DEV || !env.VITE_DEV_EXPORT_MD || !doc || highlights.length === 0) return;
    const t = setTimeout(async () => {
      const md = await buildNotesMarkdown(doc, readingOrder(highlights));
      await fetch(`/__devexport?name=${encodeURIComponent(safeFileName(doc.title))}.md`, { method: "POST", body: md });
      devLog(`dev export: ${md.length} chars`);
    }, 1500);
    return () => clearTimeout(t);
  }, [doc, highlights, env]);

  // 번들 폴더가 정해지면 한 번 바로 내보내기
  const bundled = useRef(false);
  useEffect(() => {
    if (!env.DEV || !env.VITE_DEV_BUNDLE_DIR || !d.bundleDir || bundled.current) return;
    bundled.current = true;
    void ref.current.exportBundleNow();
  }, [d.bundleDir, env]);

  // 보드에 이미지 넣기(드롭 경로 또는 붙여넣기 경로)
  useEffect(() => {
    const path = env.DEV ? env.VITE_DEV_BOARD_IMAGE : undefined;
    if (!path || noteTab !== "board" || !selectedId) return;
    const t = setTimeout(async () => {
      const host = document.querySelector(".board-host canvas.interactive") ?? document.querySelector(".board-host");
      if (!host) return devLog("dev board image: board not found");
      const r = host.getBoundingClientRect();
      const file = await readImageFile(path);
      if (env.VITE_DEV_BOARD_IMAGE_MODE === "paste") {
        // 실제 사용처럼: 보드에 포커스, 마우스가 캔버스 위에 있는 상태에서 붙여넣기
        document.querySelector<HTMLElement>(".board-host .excalidraw")?.focus();
        const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true };
        host.dispatchEvent(new PointerEvent("pointermove", at));
        const dt = new DataTransfer();
        dt.items.add(file);
        document.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
        devLog("dev board image: pasted");
      } else {
        devLog(`dev board image: dropped=${dropFilesOnBoard([file], r.left + r.width / 2, r.top + r.height / 2)}`);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [noteTab, selectedId, env]);
}
