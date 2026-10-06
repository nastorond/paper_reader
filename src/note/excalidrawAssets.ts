// Excalidraw 글꼴을 앱에 포함된 파일에서 읽게 한다(기본값은 외부 CDN → "네트워크 호출 없음" 규칙 위반).
// 개발 중엔 Vite 가 node_modules 를 그대로 서빙하고, 빌드 때는 vite.config.ts 가 dist/excalidraw/ 로 복사한다.
// 보드 편집기(BoardEditor)와 번들 SVG 내보내기(exportBundle) 둘 다 Excalidraw 를 쓰기 전에 import 한다.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}
window.EXCALIDRAW_ASSET_PATH = import.meta.env.DEV ? "/node_modules/@excalidraw/excalidraw/dist/prod/" : "/excalidraw/";

export {};
