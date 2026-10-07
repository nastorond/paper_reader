# PaperBoard

논문 PDF를 읽다가 **단어나 문장마다 전용 노트(미니 화이트보드)를 붙이고**, 나중에 그 문구를 누르면 노트가 옆에 열리는 개인용 데스크톱 앱(macOS·Windows)입니다. 맥에서 정리한 노트는 **Android 폰에서 단어장처럼 읽을 수 있습니다.**

- 편집은 데스크톱(맥·Windows)에서, 폰은 읽기 전용입니다. 계정이나 서버는 없고, 데이터는 모두 내 기기에 있습니다.
- 맥에서 폰으로는 Google Drive 동기화 폴더에 파일 하나를 올리는 방식으로 전달합니다(한 방향).

---

## 데스크톱 앱 (편집기, macOS·Windows)

> 단축키의 ⌘는 Windows에서 Ctrl입니다.

### PDF 읽기
- 열기 버튼, `⌘O`, 창에 끌어다 놓기로 PDF를 엽니다.
- 확대/축소(`⌘+` / `⌘−` / `⌘0` 폭 맞춤)를 해도 보던 위치가 유지됩니다.
- 트랙패드 **두 손가락으로 확대·축소**할 수 있습니다. 손가락 사이에 있던 글자가 그 자리에 머뭅니다.
- 페이지 번호를 입력해 이동하거나 이전·다음 버튼을 씁니다.
- 2단 편집, 양쪽 정렬, 한글 논문에서도 드래그 선택이 글자에 정확히 맞습니다. 단어 위치를 PDF에서 직접 계산해 배치합니다.

### 하이라이트
- 문구를 드래그하고 **`H`**(또는 "하이라이트" 버튼)를 누르면 하이라이트가 생기고 노트가 바로 열립니다. 한글 입력 상태에서도 됩니다.
- 위치는 PDF 좌표로 저장되어 확대/축소해도, 앱을 다시 켜도 같은 자리에 있습니다.
- 여러 줄 선택이 되고, 원문과 앞뒤 문맥 32자를 함께 저장합니다.
- 색은 노랑·초록·파랑·분홍·주황 중에서 고릅니다.
- 하이라이트를 클릭하면 그 노트가 열립니다.
- 하이라이트를 선택하고 `Delete`/`Backspace`를 누르면 삭제됩니다(확인창이 뜨고, 노트도 함께 지워집니다).

### 노트
- 오른쪽 노트 패널 맨 위에 원문 문구가 있고, 누르면 본문 그 위치로 이동합니다.
- **노트 탭**: 리치 텍스트 편집기입니다.
  - 굵게, 기울임, 제목, 목록, 코드 블록, 표
  - 수식(KaTeX): 인라인은 `$$x^2$$`, 블록은 `$$$…$$$`. 수식을 클릭하면 고칠 수 있습니다.
- **보드 탭**: Excalidraw 화이트보드입니다. 도형, 화살표, 손글씨, 텍스트를 그리고 이미지를 끌어다 놓거나 붙여넣을 수 있습니다.
- 입력하면 자동 저장되고, `Esc`로 패널을 닫습니다.

### 정리·관리
- **왼쪽 하이라이트 목록**: 현재 PDF의 하이라이트가 페이지 순으로 나옵니다. 클릭하면 그 위치로 이동하고 노트가 열립니다.
- **최근 문서**: 하이라이트 개수와 마지막으로 연 시각을 보여줍니다.
  - 파일을 옮겼거나 이름을 바꿔도 같은 문서로 인식합니다(내용 해시로 구분).
  - 경로가 깨졌으면 다시 고르게 합니다.
- **마크다운 내보내기**: 현재 논문의 하이라이트(문구, 페이지)와 노트를 `.md` 파일 하나로 저장합니다.

### 폰용 번들 내보내기
- "번들" 메뉴에서 저장할 폴더를 고르면, 라이브러리 전체를 `paperboard-library.zip` 하나로 저장합니다.
  - 보통 Google Drive 데스크톱 앱의 동기화 폴더를 고릅니다.
  - 노트 본문은 HTML로 렌더링해 넣습니다(수식 포함).
  - 보드는 SVG 그림으로 바꿔 넣습니다.
- **자동 다시 쓰기**: 노트나 하이라이트가 바뀌면 5초 뒤 번들을 다시 씁니다.
- **PDF 원문도 함께 올리기**(선택): 논문 PDF를 같은 폴더의 `pdfs/`에 **처음 한 번만** 복사합니다. 폰에서 원문을 볼 때 씁니다.

---

## Android 앱 (단어장, 읽기 전용)

- **연결**: Google Drive의 PaperBoard 폴더를 한 번 연결하면, 앱을 다시 켜도 계속 그 폴더를 읽습니다.
- **단어장 탭**
  - 모든 논문의 하이라이트를 최근 순으로 보여줍니다. 각 항목에 문구, 논문 제목·페이지, 노트 첫 줄이 보입니다.
  - 문구와 노트 내용으로 검색하고, 논문별로 거를 수 있습니다.
- **논문 탭**: 논문 목록입니다. 논문을 누르면 그 논문의 하이라이트를 페이지 순으로 보여줍니다.
- **노트 상세**: 원문 문구, 노트(수식·표 포함), 보드 그림을 보여줍니다.
- **원문 보기**
  - PDF 원문을 열면 그 하이라이트 위치로 이동하고, 하이라이트가 칠해져 있습니다.
  - 하이라이트를 누르면 그 노트로 갑니다.
  - **두 손가락으로 확대·축소**할 수 있습니다. 위쪽 −/+ 버튼도 있습니다.
- **새로고침**
  - 버튼으로 새로고침하거나, 다른 앱에 갔다 돌아오면 자동으로 새로고침합니다.
  - 결과("새 하이라이트 2개 · 수정 1개")를 알려주고, 마지막으로 읽은 시각을 표시합니다.
- **오프라인**: 마지막으로 읽은 내용과 한 번 연 PDF는 폰에 저장되어 인터넷 없이도 볼 수 있습니다.
- Android 뒤로 가기로 한 단계씩 돌아갑니다.

---

## 쓰는 흐름

1. 맥에서 PDF를 열고, 모르는 단어나 중요한 문장을 드래그한 뒤 `H`를 누릅니다.
2. 열린 노트에 설명, 수식, 그림을 적습니다.
3. "번들"에서 Google Drive의 PaperBoard 폴더를 고르고 자동 다시 쓰기를 켭니다. 원문도 폰에서 보려면 "PDF 원문도 함께 올리기"도 켭니다.
4. 폰 앱에서 그 폴더를 연결하면, 이후로는 맥에서 정리한 내용이 Drive 동기화를 거쳐 폰 단어장에 들어옵니다.

---

## 설치·실행

필요한 것: Xcode Command Line Tools, Rust(rustup), Node, pnpm

```sh
pnpm install
pnpm tauri dev          # 맥 앱 개발 실행
pnpm tauri build        # 맥 앱(.app) 빌드
pnpm tsc --noEmit       # 타입체크
pnpm vitest run         # 테스트
```

Windows:

```sh
# Windows PC에서 (필요: Visual Studio Build Tools C++, Rust, Node, pnpm)
pnpm install
pnpm tauri build        # → src-tauri/target/release/bundle/ 의 .msi / .exe

# 또는 맥에서 크로스 빌드 (실험적, 필요: brew install nsis llvm, cargo install cargo-xwin,
#   rustup target add x86_64-pc-windows-msvc) → .exe 설치 파일만 만들어진다
PATH="/opt/homebrew/opt/llvm/bin:$PATH" pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc
```

Android(필요: Android Studio, SDK·NDK, rustup Android 타깃. 환경변수는 `scripts/android-env.sh`가 설정):

```sh
pnpm android build --apk --target aarch64   # 서명된 릴리스 APK
pnpm adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

릴리스 서명 키(`src-tauri/gen/android/paperboard-release.jks`, `keystore.properties`)는 저장소에 넣지 않습니다. 잃어버리면 폰 앱을 업데이트할 수 없으니 따로 백업하세요.

### GitHub Actions

- **CI**(`.github/workflows/ci.yml`): `master` 푸시와 PR마다 타입체크와 테스트를 돌립니다.
- **Build**(`.github/workflows/build.yml`): Actions 탭에서 "Run workflow"를 누르거나 `v0.2.0` 같은 태그를 올리면, macOS `.dmg`·Windows `.exe`/`.msi`·Android `.apk`를 빌드해 실행 결과의 Artifacts에 올립니다.
  - Android는 저장소 Settings → Secrets and variables → Actions에 서명 키를 넣었을 때만 빌드합니다:
    - `ANDROID_KEYSTORE_BASE64`: `base64 -i src-tauri/gen/android/paperboard-release.jks`의 출력
    - `ANDROID_KEYSTORE_PASSWORD`: `src-tauri/gen/android/keystore.properties`의 `password` 값

## 데이터 위치

- 맥 앱 DB: `~/Library/Application Support/PaperBoard/paperboard.db`. 개발 실행 중에는 프로젝트 안 `.dev-data/`를 씁니다.
- PDF 원본은 복사하지 않고 경로만 기억합니다. 하이라이트를 PDF 파일에 써 넣지 않습니다.
- 앱은 외부 서버와 통신하지 않습니다. 폰으로 전달하는 일은 Google Drive 데스크톱 앱이 맡습니다.

## 기술 스택

Tauri v2 · React · TypeScript · Vite · pdf.js · TipTap · KaTeX · Excalidraw · SQLite(tauri-plugin-sql) · fflate
