# PaperBoard — 논문 문구별 노트 앱 (macOS·Windows 편집 + Android 보기 전용)

## 이 프로젝트가 뭔지

논문 PDF를 읽으면서 **특정 단어·문장마다 전용 노트(미니 화이트보드)**를 붙이고, 나중에 본문에서 그 문구를 **클릭하면 노트가 옆에 열리는** 개인용 맥 앱. 맥에서 만든 노트를 **Android 폰에서 읽기만** 할 수 있게 한다. 단어장을 두 번 만들지 않는 게 목적.

- 사용자는 1명(나). 편집은 맥(주)·Windows 데스크톱 앱에서, 폰은 **읽기 전용**. 계정·서버 없음.
- Windows 지원(2026-10 추가): 같은 데스크톱 코드. 단축키는 맥 ⌘ = Windows Ctrl(`src/platform.ts`), 파일 권한은 드라이브 문자(C:~Z:)까지(`scripts/capabilities.py`가 생성). 각 PC의 DB는 따로 있고, 아래 "PC 간 동기화"로 맞춘다.
- 데스크톱 → 폰 전달은 Google Drive에 파일 하나를 올려두는 방식(한 방향).
- **PC 간 동기화**(2026-10 추가, 데스크톱끼리만): 같은 Drive 폴더의 `sync/<PC>.json`에 **각 PC가 자기 파일만** 라이브러리 전체 스냅숏을 쓰고, 다른 PC 파일을 읽어 합친다. 규칙은 항목(하이라이트, 노트 본문, 노트 보드)별 **나중에 고친 쪽이 이김**, 삭제는 지운 표시(tombstone)로 전파, 동기화 전에 양쪽에서 고친 노트는 진 쪽을 `note_backups`에 보관. 사용자는 PC를 **번갈아** 쓴다(동시 편집·실시간 협업은 하지 않는다). SQLite 파일 자체를 Drive에 두는 방식은 쓰지 않는다(깨짐). 설계: `src/sync/merge.ts` 주석.
- MarginNote의 "하이라이트 → 카드" 경험에서 핵심만 가져온다. 마인드맵·카드 재배열은 만들지 않는다.
- 인용·참고문헌 관리는 Zotero가 담당하므로 이 앱의 범위가 아니다.

## 핵심 사용 흐름 (이게 되면 성공)

1. PDF를 연다 (파일 열기 또는 창에 드래그).
2. 본문에서 단어/문장을 드래그로 선택하고 `H` 키(또는 버튼)를 누른다.
3. 하이라이트가 생기고, 오른쪽에 그 문구 전용 노트 패널이 열리며 바로 입력할 수 있다.
4. 앱을 껐다 켜고 같은 PDF를 열면 하이라이트가 같은 자리에 그대로 있다.
5. 하이라이트를 클릭하면 해당 노트가 오른쪽에 열린다. `Esc`로 닫는다.

## 기술 스택

- **Tauri v2** (Rust 쉘) + **React + TypeScript (strict)** + **Vite**
- PDF 렌더링: **pdfjs-dist** (canvas + text layer)
- 노트 편집기: **TipTap** (헤딩, 목록, 코드, 표, 수식은 KaTeX 확장)
- 화이트보드: **Excalidraw** (노트 패널의 두 번째 탭)
- 저장: **SQLite** (`tauri-plugin-sql`), 파일 접근은 `tauri-plugin-dialog`, `tauri-plugin-fs`
- 패키지 매니저: pnpm

선택 이유: 화이트보드(Excalidraw)와 리치 노트(TipTap)를 웹 라이브러리로 바로 쓰기 위해 웹 스택을 쓰고, 맥 앱 형태(.app)는 Tauri로 얻는다. Rust 코드는 플러그인 설정 수준으로 최소화한다.

라이브러리 버전은 추측하지 말고 설치 시점의 최신 안정 버전을 확인해서 쓴다.

## 화면 구성

```
┌────────────┬──────────────────────────┬──────────────────┐
│ 하이라이트 │                          │ 노트 패널        │
│ 목록       │      PDF 뷰어            │ [노트] [보드] 탭 │
│ (현재 PDF) │  (하이라이트 오버레이)   │                  │
│            │                          │ (선택 시만 열림) │
└────────────┴──────────────────────────┴──────────────────┘

```

- 왼쪽: 현재 PDF의 하이라이트 목록 (페이지 순). 항목 클릭 → 해당 위치로 스크롤 + 노트 열기.
- 가운데: PDF. 확대/축소, 페이지 이동, 본문 검색(`Cmd+F`).
- 오른쪽: 노트 패널. 상단에 원문 문구(클릭하면 본문 위치로 이동), 아래에 탭 2개.
  - **노트**: TipTap 리치 텍스트
  - **보드**: Excalidraw 캔버스
- UI 문자열은 한국어.

## 데이터 모델

```ts
Document {
  id: string            // PDF 파일 내용의 SHA-256 (파일이 이동·이름변경돼도 같은 문서로 인식)
  path: string          // 마지막으로 연 경로
  title: string
  addedAt: string
  lastOpenedAt: string
}

Highlight {
  id: string            // uuid
  documentId: string
  pageIndex: number     // 0부터
  rects: Rect[]         // PDF 좌표계(user space, 확대율 무관). 여러 줄이면 여러 개
  text: string          // 선택한 원문
  prefix: string        // 앞 32자 문맥 (재정렬용)
  suffix: string        // 뒤 32자 문맥
  color: string
  createdAt: string
}

Note {
  highlightId: string   // Highlight와 1:1
  body: JSON            // TipTap 문서 JSON
  board: JSON | null    // Excalidraw scene JSON
  updatedAt: string
}

```

- DB 위치: `~/Library/Application Support/PaperBoard/paperboard.db`
- PDF 원본은 복사하지 않고 경로만 저장. 경로가 깨지면 다시 선택하게 하고 해시로 매칭.

## 하이라이트 위치 저장 (가장 까다로운 부분)

- 선택 영역의 `Range.getClientRects()`를 페이지 viewport 기준으로 변환한 뒤 `viewport.convertToPdfPoint()`로 **PDF 좌표계**에 저장한다. 화면 픽셀로 저장하지 않는다.
- 렌더링할 때는 현재 viewport로 다시 변환해 오버레이 div를 그린다. 확대/축소해도 위치가 맞아야 한다.
- 같은 줄에 붙은 rect들은 하나로 합친다.
- 2단 편집 논문, 여러 줄 선택, 하이픈으로 끊긴 단어에서 반드시 테스트한다.
- `text/prefix/suffix`는 지금은 표시·검색용이고, 나중에 좌표가 어긋날 때 재정렬에 쓴다.
- 오버레이는 클릭은 받되 텍스트 선택을 막지 않게 레이어 순서와 `pointer-events`를 조정한다.

## 마일스톤 (한 번에 하나씩, 끝날 때마다 내가 확인)

- **M0 뼈대**: Tauri+React+TS 생성, PDF 열기(다이얼로그·드래그), pdf.js로 렌더링(텍스트 레이어 포함), 확대/축소, 페이지 이동. pdf.js worker 설정이 Vite/Tauri에서 동작하는지 확인.
- **M1 하이라이트**: 선택 + `H` → 하이라이트 생성, SQLite 저장, 재실행 후 복원, 확대/축소 시 위치 유지.
- **M2 노트**: 하이라이트 클릭 → 오른쪽 패널에 TipTap 노트. 자동 저장(500ms 디바운스). `Esc`로 닫기.
- **M3 보드**: 노트 패널에 Excalidraw 탭 추가, scene 저장/복원.
- **M4 목록·관리**: 왼쪽 하이라이트 목록, 하이라이트 삭제(노트도 함께, 확인창), 색상 변경.
- **M5 편의**: 최근 문서 목록, 노트 전체를 마크다운으로 내보내기(문구 + 페이지 + 노트 본문).
- **M6 내보내기 (맥)**: 라이브러리 전체를 **번들 파일 하나**로 내보내기. 설정에서 고른 폴더 (보통 Google Drive 데스크톱 앱의 동기화 폴더, 예: `~/Library/CloudStorage/GoogleDrive-…/내 드라이브/PaperBoard/`)에 [`paperboard-library.zip`](http://paperboard-library.zip)으로 저장. 노트를 저장할 때마다 자동으로 다시 쓰는 옵션 포함(디바운스 5초). 번들 형식은 `android-viewer` 스킬 참고.
- **M7 Android 뷰어**: 같은 코드베이스의 Tauri v2 Android 빌드. 읽기 전용 모드. 번들 파일을 열어 단어장 화면 표시.
- **M8 새로고침**: 폰에서 같은 번들을 다시 읽어 최신 내용 반영.

이후 후보 (요청 전엔 하지 말 것): 노트 간 `[[링크]]`, 노트 전체 검색(맥), 폰에서 PDF 원문 보기, 폰에서 편집.

## Android 보기 전용 (M6~M8)

번들 형식·폰 화면·파일 가져오기·코드 구조·Android 빌드 상세는 `android-viewer` 스킬(`.claude/skills/android-viewer/SKILL.md`)에 있다. M6~M8 작업 전에 반드시 읽는다.

- Google Drive API + OAuth 방식(대안)으로 갈 때는 먼저 나에게 물어본다(Google Cloud 설정을 내가 해야 함).

## 명령어

- 개발 실행: `pnpm tauri dev`
- 빌드: `pnpm tauri build`
- 타입체크: `pnpm tsc --noEmit`
- 테스트: `pnpm vitest run`
- Windows 크로스 빌드(맥에서): `PATH="/opt/homebrew/opt/llvm/bin:$PATH" pnpm build:app --runner cargo-xwin --target x86_64-pc-windows-msvc` → `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe`
- 권한(capabilities) 수정: `scripts/capabilities.py`를 고치고 실행(생성된 JSON 직접 수정 금지)
- 데스크톱 앱 빌드(로컬): `pnpm build:app` (업데이트 서명 키 `.keys/updater.key`를 넣어 `tauri build`. 그냥 `pnpm tauri build`는 서명 키가 없어 실패)
- 릴리스: `sh scripts/release.sh X.Y.Z` → `git push origin master && git push origin vX.Y.Z` (태그 푸시로 GitHub Actions가 macOS·Windows 빌드 + Release + latest.json 업로드, 설치된 앱이 자동 업데이트)
- 비밀 키 위치: 업데이트 서명 `.keys/`(git 제외), Android 서명 `src-tauri/gen/android/*.jks`·`keystore.properties`(git 제외). 둘 다 따로 백업
- Android: `pnpm android init|dev|build`, `pnpm adb devices` (환경변수는 `scripts/android-env.sh`가 설정. `~/.zshrc`는 건드리지 않는다)

사전 준비(없으면 설치하고 보고): Xcode Command Line Tools, Rust(rustup), Node, pnpm. Android 빌드 도구는 `android-viewer` 스킬 참고.

## 작업 규칙

### 파일 접근 범위 (최우선)

- **이 프로젝트 폴더(이 [CLAUDE.md](http://CLAUDE.md)가 있는 폴더와 그 하위) 밖의 파일은 읽지도 쓰지도 않는다.** 홈 디렉터리, `~/Library`, `~/Documents`, Google Drive 동기화 폴더, 다른 프로젝트 모두 포함.
- 개발·테스트 중 앱이 쓰는 데이터도 프로젝트 안에 둔다.
  - 개발 실행 시 DB 경로: `./.dev-data/paperboard.db` (개발 모드에서는 `~/Library/Application Support/`를 쓰지 않도록 분기)
  - 내보내기 테스트 대상 폴더: `./.dev-data/export/` (실제 Google Drive 폴더에 쓰지 않는다)
  - 테스트용 PDF: `./fixtures/` 안에 둔 파일만 사용
  - `.dev-data/`는 `.gitignore`에 넣는다.
- 위 규칙에 걸리는 작업이 필요하면 **실행하지 말고 먼저 물어본다.** 예:
  - 전역 설정 파일 수정(`~/.zshrc`, `~/.gitconfig`, `~/.cargo/config.toml` 등)
  - 프로젝트 밖 경로를 탐색하는 `find`, `ls`, `cat` 등
- 예외(묻지 않고 해도 됨):
  - pnpm·cargo가 의존성을 설치하면서 자체 캐시(`~/.pnpm-store`, `~/.cargo/registry`)에 쓰는 것.
  - **개발 도구·패키지 설치**: Homebrew(`brew install`), rustup 툴체인·타깃, Android SDK 구성요소(`sdkmanager`, SDK 라이선스 동의 포함) 등. 설치한 뒤 무엇을 설치했는지 짧게 보고한다. 이 도구들이 설치 과정에서 자기 위치(`/opt/homebrew`, `~/.rustup`, `~/Library/Android/sdk` 등)에 쓰는 것과, 설치 확인을 위해 그 위치를 조회하는 것도 허용.
  - (앱에 넣는 무거운 라이브러리 의존성은 아래 "일반"의 규칙대로 먼저 물어본다.)
- 완성된 앱이 **실행될 때** 사용자가 고른 PDF를 읽고, `~/Library/Application Support/PaperBoard/`와 설정에서 고른 내보내기 폴더에 쓰는 것은 앱의 정상 동작이다. 이 규칙은 개발 작업(Claude Code)에 대한 것이다.

### 일반

- 마일스톤 하나씩 진행한다. 끝나면 타입체크·테스트·`pnpm tauri dev` 실행까지 확인하고, 내가 직접 해볼 수동 테스트 체크리스트를 짧게 남긴다.
- 무거운 의존성을 새로 추가할 때는 먼저 물어본다. 위 스택에 있는 건 바로 써도 된다.
- 네트워크 호출 없음. 텔레메트리·외부 API 금지. 모든 데이터는 로컬.
  - 예외(2026-10): 데스크톱 앱의 **자동 업데이트 확인·다운로드**(GitHub Releases 의 `latest.json`, tauri-plugin-updater)만 허용. 내 데이터는 보내지 않는다.
- 요청과 상관없는 코드는 리팩터링하지 않는다.
- 좌표 변환, DB 저장/로드 같은 순수 로직은 vitest로 테스트를 붙인다.
- 컴포넌트는 작게 나누고, PDF 렌더링 / 하이라이트 레이어 / 노트 패널 / 저장소를 분리한다.
- 나는 C++ 배경이고 Rust·React는 깊게 안 써봤다. Rust 쪽이나 낯선 패턴을 쓰면 왜 그렇게 했는지 한두 줄로 설명한다.
- 커밋은 마일스톤 단위로, 메시지는 한국어로 무엇을 했는지 한 줄.

## 하지 않을 것

- 계정, 자체 서버, 실시간 동기화·협업(PC 간 동기화는 위의 Drive 파일 방식만)
- 폰에서 편집
- PDF 원본 수정(하이라이트를 PDF 파일에 박지 않는다. 모두 DB에만 저장)
- 마인드맵, 카드 재배열, 플래시카드
- 리눅스·iOS 대응