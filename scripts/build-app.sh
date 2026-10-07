#!/bin/sh
# 로컬 데스크톱 앱 빌드(맥). 자동 업데이트 파일(.app.tar.gz + .sig)을 만들려면 업데이트 서명 키가 필요해서,
# .keys/ 의 키를 환경변수로 넘긴 뒤 `tauri build` 를 실행한다. 추가 인자는 tauri build 로 넘어간다.
#   pnpm build:app
set -e
cd "$(dirname "$0")/.."
if [ ! -f .keys/updater.key ]; then
  echo "업데이트 서명 키(.keys/updater.key)가 없습니다. README 의 '자동 업데이트' 참고." >&2
  exit 1
fi
TAURI_SIGNING_PRIVATE_KEY="$(cat .keys/updater.key)"
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat .keys/updater.key.password)"
export TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
export PATH="$HOME/.cargo/bin:$PATH"
exec pnpm tauri build "$@"
