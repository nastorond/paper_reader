import { describe, expect, it } from "vitest";
import { parseSource } from "./cache";

describe("parseSource", () => {
  it("폴더·파일 저장값, 예전 파일 주소, 깨진 값", () => {
    expect(parseSource(JSON.stringify({ kind: "folder", treeUri: "content://t" }), null)).toEqual({
      kind: "folder",
      treeUri: "content://t",
    });
    expect(parseSource(JSON.stringify({ kind: "file", uri: "content://f" }), "content://old")).toEqual({
      kind: "file",
      uri: "content://f",
    });
    expect(parseSource(null, "content://old")).toEqual({ kind: "file", uri: "content://old" });
    expect(parseSource("{broken", "content://old")).toEqual({ kind: "file", uri: "content://old" });
    expect(parseSource(JSON.stringify({ kind: "folder" }), null)).toBeNull();
    expect(parseSource(null, null)).toBeNull();
  });
});
