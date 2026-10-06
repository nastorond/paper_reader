"""2단 편집 + 줄끝 하이픈이 있는 테스트용 PDF를 만든다 (외부 라이브러리 없음).

    python3 fixtures/make_two_column.py   ->  fixtures/two-column.pdf
"""
from pathlib import Path

PAGE_W, PAGE_H = 612, 792  # US Letter (pt)
MARGIN, GAP, FONT_SIZE, LEADING = 54, 24, 10, 13
COL_W = (PAGE_W - 2 * MARGIN - GAP) / 2

TITLE = "Attention-Free Reading: A Test Document for Highlight Positioning"
PARAGRAPHS = [
    "Abstract. This document exists to test text selection across two columns, "
    "multiple lines, and words that are hyphen- ated at the end of a line. "
    "Transformer models rely on self-attention to relate tokens.",
    "1 Introduction. Highlights must stay anchored to the same words when the "
    "reader zooms in or out. Coordinates are therefore stored in PDF user space "
    "rather than in screen pixels, and converted back with the current viewport.",
    "The quick brown fox jumps over the lazy dog. Pack my box with five dozen "
    "liquor jugs. Sphinx of black quartz, judge my vow. How vexingly quick daft "
    "zebras jump. The five boxing wizards jump quickly.",
    "2 Method. We select a phrase, press H, and expect a note panel to open. "
    "Representation learning, contrastive objectives, and positional encod- ing "
    "are typical vocabulary items a reader may want to annotate.",
]


def wrap(text: str, width_chars: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        if len(cur) + len(word) + 1 > width_chars:
            lines.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}".strip()
    if cur:
        lines.append(cur)
    return lines


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def page_stream(page_no: int) -> bytes:
    chars = int(COL_W / (FONT_SIZE * 0.5))
    body: list[str] = []
    for i in range(3):
        for p in PARAGRAPHS:
            body += wrap(p, chars) + [""]
    per_col = int((PAGE_H - 2 * MARGIN - 40) / LEADING)
    ops = ["BT", f"/F2 14 Tf {MARGIN} {PAGE_H - MARGIN} Td ({esc(TITLE if page_no == 1 else f'Page {page_no}')}) Tj", "ET"]
    for col in range(2):
        x = MARGIN + col * (COL_W + GAP)
        y = PAGE_H - MARGIN - 36
        ops += ["BT", f"/F1 {FONT_SIZE} Tf {LEADING} TL {x:.1f} {y} Td"]
        for line in body[col * per_col:(col + 1) * per_col]:
            ops.append(f"({esc(line)}) Tj T*")
        ops.append("ET")
    return "\n".join(ops).encode("latin-1")


def build(n_pages: int = 3) -> bytes:
    objs: list[bytes] = []
    def add(b: bytes) -> int:
        objs.append(b)
        return len(objs)
    catalog = add(b"")
    pages = add(b"")
    f1 = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>")
    f2 = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    kids = []
    for n in range(1, n_pages + 1):
        s = page_stream(n)
        c = add(b"<< /Length %d >>\nstream\n" % len(s) + s + b"\nendstream")
        kids.append(add(
            f"<< /Type /Page /Parent {pages} 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
            f"/Resources << /Font << /F1 {f1} 0 R /F2 {f2} 0 R >> >> /Contents {c} 0 R >>".encode()))
    objs[catalog - 1] = f"<< /Type /Catalog /Pages {pages} 0 R >>".encode()
    objs[pages - 1] = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>".encode()
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{off:010d} 00000 n \n".encode() for off in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


if __name__ == "__main__":
    out = Path(__file__).with_name("two-column.pdf")
    out.write_bytes(build())
    print(out)
