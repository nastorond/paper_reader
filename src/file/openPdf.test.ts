import { describe, expect, it } from "vitest";
import { fileNameOf, isImagePath, isPdfPath } from "./openPdf";

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

  it("이미지 확장자 판별(대소문자 무관)", () => {
    expect(isImagePath("/a/shot.png")).toBe(true);
    expect(isImagePath("/a/IMG_0001.JPG")).toBe(true);
    expect(isImagePath("/a/b.pdf")).toBe(false);
  });
});
