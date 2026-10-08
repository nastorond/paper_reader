// PDF 파일 내용의 SHA-256 (hex). 문서 id 로 쓴다 — 파일을 옮기거나 이름을 바꿔도 같은 문서로 인식.
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
