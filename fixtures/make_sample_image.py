"""보드 이미지 테스트용 PNG(160x100, 파랑→주황 그라데이션)를 만든다 (외부 라이브러리 없음).

    python3 fixtures/make_sample_image.py   ->  fixtures/sample.png
"""
import struct
import zlib
from pathlib import Path

W, H = 160, 100


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


rows = b"".join(
    b"\x00" + b"".join(bytes((int(30 + 220 * x / W), int(100 + 60 * y / H), int(220 - 200 * x / W))) for x in range(W))
    for y in range(H)
)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
out = Path(__file__).with_name("sample.png")
out.write_bytes(png)
print(out)
