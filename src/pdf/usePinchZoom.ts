import { useEffect, useRef, type RefObject } from "react";
import { clampZoom } from "./zoom";

export interface PinchRequest {
  scale: number;
  // 스크롤 컨테이너 기준 손가락 사이 지점(CSS px)
  viewX: number;
  viewY: number;
}

// 두 손가락 확대를 받아 onPinch(새 배율, 기준 지점)로 알린다. 화면 갱신은 프레임마다 한 번으로 묶는다.
//   - 맥 트랙패드(WebKit): gesturestart/gesturechange 의 scale
//   - 맥 트랙패드(그 밖), ctrl+휠: wheel + ctrlKey
//   - Android 터치: 두 손가락 거리 변화
// 브라우저 기본 확대(화면 전체가 커지는 것)는 막는다(CSS touch-action 과 preventDefault).
export function usePinchZoom(
  ref: RefObject<HTMLElement | null>,
  scale: number,
  onPinch: (req: PinchRequest) => void,
): void {
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const onPinchRef = useRef(onPinch);
  onPinchRef.current = onPinch;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let pending: PinchRequest | null = null;
    // 제스처 중 기준값: 이벤트가 시작 대비 비율을 주므로 시작 배율을 기억한다.
    // (scaleRef 는 프레임 단위로 늦게 갱신되므로 누적 계산에는 쓰지 않는다)
    let startScale = scaleRef.current;
    let latest = scaleRef.current;

    const view = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      return { viewX: clientX - r.left, viewY: clientY - r.top };
    };
    const request = (next: number, clientX: number, clientY: number) => {
      latest = clampZoom(next);
      pending = { scale: latest, ...view(clientX, clientY) };
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (pending && Math.abs(pending.scale - scaleRef.current) > 1e-3) onPinchRef.current(pending);
          pending = null;
        });
      }
    };

    // ctrl + 휠(트랙패드 핀치가 이렇게 오는 브라우저도 있다)
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const base = pending ? latest : scaleRef.current;
      request(base * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };

    // WebKit 제스처 이벤트(macOS 트랙패드). TS 타입에 없어 직접 정의.
    type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      startScale = scaleRef.current;
    };
    const onGestureChange = (e: Event) => {
      const g = e as GestureEvent;
      e.preventDefault();
      request(startScale * g.scale, g.clientX, g.clientY);
    };

    // 두 손가락 터치(Android)
    let startDist = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startScale = scaleRef.current;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startDist === 0) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      request(startScale * (dist(e.touches) / startDist), (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [ref]);
}
