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
  // 개발 자가 테스트: 새로 만든 하이라이트의 노트에 이 글을 입력한다($...$ 는 수식)
  readonly VITE_DEV_TYPE_NOTE?: string;
  // 개발 자가 테스트: PDF 를 연 뒤 첫 하이라이트의 노트를 연다
  readonly VITE_DEV_OPEN_NOTE?: string;
  // 개발 자가 테스트: 노트를 열 때 보드 탭으로 연다
  readonly VITE_DEV_OPEN_BOARD?: string;
  // 개발 자가 테스트: 빈 보드에 도형·텍스트를 그린다
  readonly VITE_DEV_DRAW?: string;
  // 개발 자가 테스트: 보드가 열리면 이 이미지 파일을 보드 가운데에 드롭(drop) 또는 붙여넣기(paste)
  readonly VITE_DEV_BOARD_IMAGE?: string;
  readonly VITE_DEV_BOARD_IMAGE_MODE?: "drop" | "paste";
  // 개발 자가 테스트: 목록 첫 하이라이트의 색을 바꾸거나(값=색) 확인창 없이 삭제한다
  readonly VITE_DEV_COLOR_FIRST?: string;
  readonly VITE_DEV_DELETE_FIRST?: string;
  // 개발 자가 테스트: 저장 창 없이 노트 마크다운을 .dev-data/export/ 에 쓴다(개발 서버 경유)
  readonly VITE_DEV_EXPORT_MD?: string;
  // 개발 자가 테스트: 번들 내보내기 폴더(자동 내보내기 켬). 시작하면 한 번 내보낸다.
  readonly VITE_DEV_BUNDLE_DIR?: string;
  // 개발 자가 테스트: 번들 내보내기에 PDF 원문 포함
  readonly VITE_DEV_BUNDLE_PDFS?: string;
  // 개발 자가 테스트: 첫 하이라이트 위에서 ctrl+휠 핀치(확대)를 보내고 위치 변화를 로그로 남긴다
  readonly VITE_DEV_PINCH?: string;
}
