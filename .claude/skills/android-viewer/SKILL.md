---
name: android-viewer
description: PaperBoard Android 뷰어·번들 내보내기 설계(M6~M8). 번들 형식(paperboard-library.zip, library.json, boards/*.svg, schemaVersion), 폰 화면 구성, SAF/Drive 파일 가져오기, 코드 구조, Android 빌드. M6 내보내기·M7 Android 뷰어·M8 새로고침 작업이나 번들 형식을 다룰 때 먼저 읽는다.
---

# Android 보기 전용 (M6~M8)

**목적은 단어장 열람.** 폰에서 논문을 다시 읽는 게 아니라, 맥에서 정리한 문구·노트를 훑어보는 것.

### 번들 형식 ([`paperboard-library.zip`](http://paperboard-library.zip))

```
library.json        // 문서 목록, 하이라이트, 노트 본문
boards/<highlightId>.svg   // 보드 탭은 내보낼 때 SVG로 렌더링해 둔다 (폰에서 Excalidraw 불필요)

```

- `library.json`의 노트 본문은 TipTap JSON과 함께 **렌더링된 HTML**도 넣는다. 폰은 HTML만 보여주면 된다.
- 수식(KaTeX)은 HTML에 렌더링된 상태로 넣거나 폰 쪽에 KaTeX CSS만 포함한다.
- PDF 원본은 기본적으로 **넣지 않는다**(용량). 나중에 옵션으로.
- `schemaVersion` 필드를 둔다. 폰은 모르는 버전이면 안내 메시지를 띄운다.

### 폰 화면

- **단어장 목록** (메인): 모든 문서의 하이라이트를 한 목록으로. 각 항목 = 원문 문구 + 문서 제목·페이지 + 노트 첫 줄. 문서별 필터, 문구·노트 내용 검색.
- **노트 상세**: 원문 문구, 노트 HTML, 보드 SVG(있으면). 편집 UI 없음.
- 상단에 "새로고침"과 마지막으로 읽은 시각.

### 파일 가져오기 방식

1. **1순위 (M7)**: Android 파일 선택기(SAF)로 Google Drive에 있는 번들 파일을 고른다. 고른 URI의 영구 읽기 권한(`takePersistableUriPermission`)을 받아 저장하고, 앱 내부 저장소에 복사본을 캐시한다. "새로고침"은 같은 URI를 다시 읽는다.
   - Drive 문서 제공자가 영구 권한과 재읽기 시 최신 내용을 주는지 **실기기로 먼저 확인**한다. Tauri dialog/fs 플러그인으로 부족하면 작은 Kotlin 플러그인을 쓴다.
2. **대안 (M8에서 1순위가 안 될 때만)**: Google Drive API(`drive.file` 또는 읽기 전용 범위) + OAuth로 `PaperBoard/` 폴더의 번들을 직접 다운로드. 개인용이라 OAuth 앱은 테스트 모드, 내 계정만 등록. 이 방식으로 갈 때는 먼저 나에게 물어본다(Google Cloud 설정을 내가 해야 함).

### 코드 구조

- 하나의 저장소, 하나의 React 앱. 플랫폼에 따라 모드 분기: 데스크톱 = 편집기, Android = 뷰어.
- 뷰어는 DB(SQLite)를 쓰지 않고 캐시된 번들의 `library.json`만 읽는다.
- 번들 생성(맥)과 번들 읽기(폰)는 같은 타입 정의를 공유하고, 왕복 테스트(vitest)를 붙인다.

### Android 빌드

- 사전 준비(없으면 설치하고 보고): Android Studio, Android SDK·NDK, JDK(Android Studio 내장 JBR 사용), rustup Android 타깃. Tauri 공식 문서의 Android 준비 절차를 따른다. 환경변수(`JAVA_HOME`, `ANDROID_HOME`, `NDK_HOME`)는 `scripts/android-env.sh`가 설정하고 `pnpm android …`/`pnpm adb …` 스크립트로만 쓴다(`~/.zshrc` 수정 불필요).
- `pnpm android init` → `pnpm android build --apk`
- 설치는 APK 직접 설치(adb 또는 파일 전송). 스토어 배포 안 함.
- 릴리스 APK: `pnpm android build --apk --target aarch64` → `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk` (약 28MB, 디버그는 약 390MB)
  - 서명 키: `src-tauri/gen/android/paperboard-release.jks` + `keystore.properties`(비밀번호). 둘 다 git 제외. **잃어버리면 같은 앱으로 업데이트 설치가 안 된다**(지우고 새로 설치해야 하고, 폰의 번들 캐시·선택 파일 정보가 사라진다). 따로 백업한다.
  - 디버그 APK 와 서명이 달라 서로 덮어쓸 수 없다(전환하려면 `pnpm adb uninstall com.paperboard.app` 후 설치).
  - 릴리스는 R8 축소가 켜져 있다. Rust 에서 이름으로 찾는 Kotlin 플러그인은 `app/proguard-rules.pro` 의 keep 규칙으로 보존한다(플러그인을 추가하면 규칙도 추가).
- 번들 선택은 Tauri 기본 파일 선택기 대신 `BundlePickerPlugin.kt`(ACTION_OPEN_DOCUMENT + takePersistableUriPermission)를 쓴다. 기본 선택기로 고른 주소는 앱을 다시 켜면 읽기가 거부된다(실기기 확인).
