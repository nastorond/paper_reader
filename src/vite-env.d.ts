/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 개발 모드에서 시작하자마자 열 PDF 경로 (예: fixtures/two-column.pdf 의 절대 경로)
  readonly VITE_DEV_OPEN_PDF?: string;
}
