# Android 빌드용 환경변수. ~/.zshrc 를 고치지 않고 `pnpm android ...` 스크립트에서만 쓴다.
# (package.json 의 "android" 스크립트가 이 파일을 source 한 뒤 `tauri android` 를 실행)
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ -z "$NDK_HOME" ] && [ -d "$ANDROID_HOME/ndk" ]; then
  # 설치된 NDK 중 가장 높은 버전
  NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 "$ANDROID_HOME/ndk" | sort -V | tail -1)"
  export NDK_HOME
fi
export PATH="$ANDROID_HOME/platform-tools:$HOME/.cargo/bin:$PATH"
