import { describe, expect, it } from "vitest";
import { displayNameOf, forgetLocalPdf, parseLocalPdfs, rememberLocalPdf, type LocalPdf } from "./localPdfs";

const p = (uri: string, openedAt = "2026-10-30T00:00:00Z"): LocalPdf => ({ uri, name: uri, documentId: null, openedAt });

describe("rememberLocalPdf", () => {
  it("맨 앞에 넣고 같은 주소는 하나만 남긴다", () => {
    const { list, dropped } = rememberLocalPdf([p("a"), p("b"), p("c")], p("b", "2026-10-31T00:00:00Z"));
    expect(list.map((x) => x.uri)).toEqual(["b", "a", "c"]);
    expect(list[0].openedAt).toBe("2026-10-31T00:00:00Z");
    expect(dropped).toEqual([]);
  });

  it("개수를 넘치면 오래된 것을 밀어내고 돌려준다", () => {
    const { list, dropped } = rememberLocalPdf([p("a"), p("b")], p("c"), 2);
    expect(list.map((x) => x.uri)).toEqual(["c", "a"]);
    expect(dropped.map((x) => x.uri)).toEqual(["b"]);
  });
});

describe("forgetLocalPdf", () => {
  it("주소로 지운다", () => {
    expect(forgetLocalPdf([p("a"), p("b")], "a").map((x) => x.uri)).toEqual(["b"]);
  });
});

describe("parseLocalPdfs", () => {
  it("저장값을 읽고 깨진 값·모양이 다른 항목은 버린다", () => {
    const ok = { uri: "content://x", name: "논문", documentId: "abc", openedAt: "2026-10-30T00:00:00Z" };
    expect(parseLocalPdfs(JSON.stringify([ok, { uri: 1 }, null]))).toEqual([ok]);
    expect(parseLocalPdfs("{")).toEqual([]);
    expect(parseLocalPdfs(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(parseLocalPdfs(null)).toEqual([]);
  });
});

describe("displayNameOf", () => {
  it("파일 이름에서 .pdf 를 떼고, 이름이 없으면 주소 끝부분", () => {
    expect(displayNameOf("Attention.PDF", "content://x")).toBe("Attention");
    expect(displayNameOf(null, "content://com.android.providers.downloads.documents/document/raw%3A%2Fstorage%2FDownload%2Fpaper.pdf")).toBe(
      "paper",
    );
  });
});
