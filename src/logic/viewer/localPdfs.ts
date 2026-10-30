// 폰·태블릿 PDF 리더의 "최근 연 파일" 목록 규칙(순수 함수, 테스트 대상).

export interface LocalPdf {
  uri: string; // content:// 주소(영구 읽기 권한을 받아 둔 것)
  name: string; // 표시 이름(파일 이름)
  documentId: string | null; // 내용 해시. 한 번 열어 계산하기 전에는 null
  openedAt: string; // ISO
}

// 앱이 붙잡을 수 있는 영구 권한 수에 한도가 있어 최근 목록도 이 수로 자른다.
export const MAX_LOCAL_PDFS = 30;

// 연 파일을 맨 앞에 넣는다(같은 주소는 하나만). 개수를 넘쳐 밀려난 항목은 dropped 로 돌려준다(권한 해제용).
export function rememberLocalPdf(
  list: LocalPdf[],
  entry: LocalPdf,
  max = MAX_LOCAL_PDFS,
): { list: LocalPdf[]; dropped: LocalPdf[] } {
  const rest = list.filter((p) => p.uri !== entry.uri);
  const next = [entry, ...rest];
  return { list: next.slice(0, max), dropped: next.slice(max) };
}

export function forgetLocalPdf(list: LocalPdf[], uri: string): LocalPdf[] {
  return list.filter((p) => p.uri !== uri);
}

// 저장된 문자열 → 목록. 깨진 값·모양이 다른 항목은 버린다.
export function parseLocalPdfs(saved: string | null): LocalPdf[] {
  if (!saved) return [];
  try {
    const raw: unknown = JSON.parse(saved);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is LocalPdf =>
        !!p &&
        typeof p.uri === "string" &&
        typeof p.name === "string" &&
        (p.documentId === null || typeof p.documentId === "string") &&
        typeof p.openedAt === "string",
    );
  } catch {
    return [];
  }
}

// 파일 이름에서 .pdf 를 뗀 표시 이름. 이름을 모르면 주소 끝부분.
export function displayNameOf(name: string | null, uri: string): string {
  const base = name ?? decodeURIComponent(uri.split("/").pop() ?? "").split(/[:/]/).pop() ?? "";
  return base.replace(/\.pdf$/i, "") || "PDF";
}
