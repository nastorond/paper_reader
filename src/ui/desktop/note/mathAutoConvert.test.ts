import { describe, expect, it } from "vitest";
import { BLOCK_MATH_PARAGRAPH, findMathAtCursor } from "./mathAutoConvert";

describe("findMathAtCursor", () => {
  it("커서 앞이 $$...$$ 로 끝날 때만 찾는다", () => {
    expect(findMathAtCursor("테스트 $$x^2$$")).toEqual({ from: 4, latex: "x^2" });
    expect(findMathAtCursor("$$x^2$$")).toEqual({ from: 0, latex: "x^2" });
    expect(findMathAtCursor("$$x^2$")).toBeNull();
    expect(findMathAtCursor("$$x^2$$ 뒤에 글")).toBeNull();
  });

  it("$$$ 블록 수식 입력 중에는 인라인으로 바꾸지 않는다", () => {
    expect(findMathAtCursor("$$$x^2$$")).toBeNull();
    expect(BLOCK_MATH_PARAGRAPH.exec("$$$\\sum_i x_i$$$")?.[1]).toBe("\\sum_i x_i");
  });

  it("가격 같은 단일 $ 는 건드리지 않는다", () => {
    expect(findMathAtCursor("$5 and $6")).toBeNull();
  });
});
