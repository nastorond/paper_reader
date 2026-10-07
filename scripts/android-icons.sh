#!/bin/sh
# Android 적응형 아이콘 앞면을 밀도별 PNG 로 만든다(rsvg-convert 필요: brew install librsvg).
# 순서: pnpm tauri icon src-tauri/icons/app-icon.svg → sh scripts/android-icons.sh
set -e
cd "$(dirname "$0")/.."
SRC=src-tauri/icons/app-icon-android-foreground.svg
RES=src-tauri/gen/android/app/src/main/res
for pair in mdpi:108 hdpi:162 xhdpi:216 xxhdpi:324 xxxhdpi:432; do
  d=${pair%%:*}; px=${pair##*:}
  rsvg-convert -w "$px" -h "$px" "$SRC" -o "$RES/mipmap-$d/ic_launcher_foreground.png"
done
# 뒷면: 앱 아이콘 배경 그라데이션의 가운데 색
cat > "$RES/values/ic_launcher_background.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#4568E2</color>
</resources>
XML
echo "android icons updated"
