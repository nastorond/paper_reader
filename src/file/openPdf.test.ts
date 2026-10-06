import { describe, expect, it } from "vitest";
import { fileNameOf, isPdfPath } from "./openPdf";

describe("openPdf helpers", () => {
  it("경로에서 확장자 뺀 파일 이름", () => {
    expect(fileNameOf("/Users/me/papers/Attention Is All You Need.pdf")).toBe("Attention Is All You Need");
    expect(fileNameOf("paper.PDF")).toBe("paper");
  });

  it("PDF 확장자 판별", () => {
    expect(isPdfPath("/a/b.pdf")).toBe(true);
    expect(isPdfPath("/a/b.PDF")).toBe(true);
    expect(isPdfPath("/a/b.txt")).toBe(false);
  });
});
