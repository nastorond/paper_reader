import { useEffect, type RefObject } from "react";
import { devLog } from "./devLog";

// 개발 자가 테스트(VITE_DEV_PINCH): 첫 하이라이트 위에서 ctrl+휠 핀치를 보내 확대 전후 화면 위치를 비교한다.
// ready: 페이지 크기를 다 구한 뒤(PdfViewer)
export function useDevPinchTest(scrollRef: RefObject<HTMLDivElement | null>, ready: boolean): void {
  useEffect(() => {
    if (!import.meta.env.DEV || !import.meta.env.VITE_DEV_PINCH || !ready) return;
    const t = setTimeout(async () => {
      const el = scrollRef.current;
      const hl = el?.querySelector<HTMLElement>(".hl");
      if (!el || !hl) return devLog("pinch test: no highlight");
      const c = (e: HTMLElement) => {
        const r = e.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      };
      const [x0, y0] = c(hl);
      const w0 = el.querySelector<HTMLElement>(".pdf-page")!.offsetWidth;
      for (let i = 0; i < 12; i++) {
        el.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -8, clientX: x0, clientY: y0, bubbles: true, cancelable: true }));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      await new Promise((r) => setTimeout(r, 400));
      const [x1, y1] = c(el.querySelector<HTMLElement>(".hl")!);
      const w1 = el.querySelector<HTMLElement>(".pdf-page")!.offsetWidth;
      devLog(`pinch test: before (${x0.toFixed(1)}, ${y0.toFixed(1)}) after (${x1.toFixed(1)}, ${y1.toFixed(1)}) zoom x${(w1 / w0).toFixed(2)}`);
    }, 2500);
    return () => clearTimeout(t);
  }, [scrollRef, ready]);
}
