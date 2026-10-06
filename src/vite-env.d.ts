/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 개발 모드에서 시작하자마자 열 PDF 경로 (예: fixtures/two-column.pdf 의 절대 경로)
  readonly VITE_DEV_OPEN_PDF?: string;
  // 개발 자가 테스트: 텍스트 레이어에서 이 문구를 찾으면 자동 선택하고 그 위치로 스크롤한다(src/dev/selectText.ts)
  readonly VITE_DEV_SELECT_TEXT?: string;
  // 개발 자가 테스트: PDF를 연 뒤 1.5초 후 이 배율로 바꾼다(확대/축소 경로 확인용)
  readonly VITE_DEV_ZOOM?: string;
}
