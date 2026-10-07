"""src-tauri/capabilities/default.json 생성기.

권한(특히 파일 경로 범위)은 macOS·Windows 경로 패턴이 많아 손으로 고치기 어렵다.
이 파일을 고친 뒤 실행한다:  python3 scripts/capabilities.py

경로 범위 원칙(최소 권한):
  - 읽기: PDF·이미지(보드에 넣기)만
  - 쓰기: 마크다운 내보내기(.md), 번들 zip 과 그 임시 파일, 번들 폴더의 pdfs/*.pdf, PC 간 동기화 파일(sync/*.json) 만
  - 위치: 홈 폴더 아래 + macOS 외장 볼륨(/Volumes) + Windows 드라이브(C:~Z:, Google Drive 의 G: 등)
"""
import json
import string
from pathlib import Path

ROOTS = ["$HOME", "/Volumes"] + [f"{d}:" for d in string.ascii_uppercase[2:]]  # C: ~ Z:


def both_cases(exts):
    out = []
    for e in exts:
        out += [e, e.upper()] if e != e.upper() else [e]
    return out


def under_roots(*suffixes):
    return [{"path": f"{root}/**/{s}"} for root in ROOTS for s in suffixes]


PDF = [f"*.{e}" for e in both_cases(["pdf"])]
IMAGES = [f"*.{e}" for e in both_cases(["png", "jpg", "jpeg", "gif", "webp", "svg"])]
BUNDLE = ["paperboard-library.zip", "paperboard-library.zip.tmp"]
SYNC = ["sync/*.json", "sync/*.json.tmp"]  # PC 간 동기화(src/sync)

capability = {
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "default",
    "description": "Capability for the main window (scripts/capabilities.py 가 생성 — 직접 고치지 말 것)",
    "windows": ["main"],
    "permissions": [
        "core:default",
        "dialog:allow-open",
        "dialog:allow-confirm",
        "dialog:allow-save",
        "sql:default",
        "sql:allow-execute",
        {"identifier": "fs:allow-read-file", "allow": under_roots(*PDF, *IMAGES)},
        # 최근 문서 경로 확인(PDF), 번들 폴더의 PDF 원문이 이미 있는지 확인
        {"identifier": "fs:allow-exists", "allow": under_roots(*PDF)},
        {"identifier": "fs:allow-write-text-file", "allow": under_roots("*.md", *SYNC)},
        {"identifier": "fs:allow-read-text-file", "allow": under_roots("sync/*.json")},
        {"identifier": "fs:allow-read-dir", "allow": [{"path": f"{root}/**/sync"} for root in ROOTS]},
        {"identifier": "fs:allow-write-file", "allow": under_roots(*BUNDLE, "pdfs/*.pdf")},
        {"identifier": "fs:allow-rename", "allow": under_roots(*BUNDLE, *SYNC)},
        {"identifier": "fs:allow-mkdir", "allow": [{"path": f"{root}/**/{d}"} for root in ROOTS for d in ("pdfs", "sync")]},
    ],
}

# 데스크톱 전용(자동 업데이트·재시작). 이 플러그인들은 Android 빌드에 없어서 따로 둔다.
desktop = {
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "desktop",
    "description": "데스크톱 전용 권한 (scripts/capabilities.py 가 생성 — 직접 고치지 말 것)",
    "windows": ["main"],
    "platforms": ["macOS", "windows", "linux"],
    # 창 닫기 전에 동기화 파일을 마저 쓰려고 닫기 요청을 받아 직접 닫는다(onCloseRequested → destroy)
    "permissions": ["updater:default", "process:allow-restart", "core:window:allow-destroy"],
}

caps = Path(__file__).resolve().parent.parent / "src-tauri/capabilities"
for name, cap in [("default.json", capability), ("desktop.json", desktop)]:
    (caps / name).write_text(json.dumps(cap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {caps} ({sum(len(p['allow']) for p in capability['permissions'] if isinstance(p, dict))} path patterns)")
