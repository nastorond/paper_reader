import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { installDevLog } from "./dev/devLog";

installDevLog();

// 플랫폼에 따라 모드 분기: 데스크톱 = 편집기, Android = 읽기 전용 뷰어.
// 둘 다 lazy 로 불러와, 폰에는 pdf.js·Excalidraw·SQLite 코드가, 맥에는 뷰어 코드가 실리지 않게 한다.
const isAndroid = /Android/i.test(navigator.userAgent);
const Root = isAndroid ? lazy(() => import("./ui/mobile/ViewerApp")) : lazy(() => import("./ui/desktop/App"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </React.StrictMode>,
);
