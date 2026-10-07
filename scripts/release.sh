#!/bin/sh
# 새 버전 릴리스 준비: 버전 번호를 올려 커밋하고 태그(vX.Y.Z)를 만든다. 푸시는 직접 한다.
#   sh scripts/release.sh 0.2.0
#   git push origin master && git push origin v0.2.0   ← 태그 푸시가 GitHub Actions 릴리스 빌드를 시작한다
# 앱은 GitHub Releases 의 최신 릴리스(latest.json)를 보고 자동 업데이트한다.
set -e
cd "$(dirname "$0")/.."
VERSION="$1"
case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "사용법: sh scripts/release.sh X.Y.Z" >&2; exit 1 ;;
esac
if [ -n "$(git status --porcelain)" ]; then
  echo "커밋하지 않은 변경이 있습니다. 먼저 커밋하세요." >&2
  exit 1
fi
python3 -I - "$VERSION" <<'PY'
import json, re, sys
v = sys.argv[1]
for path in ["package.json", "src-tauri/tauri.conf.json"]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = v
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
path = "src-tauri/Cargo.toml"
with open(path, encoding="utf-8") as f:
    text = f.read()
text = re.sub(r'(?m)^version = "[^"]+"', f'version = "{v}"', text, count=1)
with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PY
# Cargo.lock 의 앱 버전도 맞춘다
(cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo update -p paperboard --offline >/dev/null 2>&1 || PATH="$HOME/.cargo/bin:$PATH" cargo update -p paperboard >/dev/null)
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -q -m "릴리스 v$VERSION"
git tag -a "v$VERSION" -m "PaperBoard v$VERSION"
echo "v$VERSION 커밋·태그 완료. 푸시: git push origin master && git push origin v$VERSION"
