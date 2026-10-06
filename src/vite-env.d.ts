/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 개발 모드에서 시작하자마자 열 PDF 경로 (예: fixtures/two-column.pdf 의 절대 경로)
  readonly VITE_DEV_OPEN_PDF?: string;
  // 개발 자가 테스트: 텍스트 레이어에서 이 문구를 찾으면 자동 선택하고 그 위치로 스크롤한다(src/dev/selectText.ts)
  readonly VITE_DEV_SELECT_TEXT?: string;
  // 개발 자가 테스트: PDF를 연 뒤 1.5초 후 이 배율로 바꾼다(확대/축소 경로 확인용)
  readonly VITE_DEV_ZOOM?: string;
  // 개발 자가 테스트: VITE_DEV_SELECT_TEXT 로 선택한 뒤 H 키를 누른 것처럼 한다(하이라이트 생성)
  readonly VITE_DEV_PRESS_H?: string;
  // 개발 자가 테스트: PDF 를 연 뒤 이 페이지(1부터)로 이동한다
  readonly VITE_DEV_GOTO_PAGE?: string;
}
