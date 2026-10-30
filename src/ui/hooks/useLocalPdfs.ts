import { useCallback, useRef, useState } from "react";
import { displayNameOf, forgetLocalPdf, rememberLocalPdf, type LocalPdf } from "../../logic/viewer/localPdfs";
import { pickPdfFile, readLocalPdf, releaseUri, saveLocalPdfs, savedLocalPdfs } from "../../services/viewer/localPdf";

// 폰·태블릿 PDF 리더: 기기의 PDF 고르기·열기와 최근 연 파일 목록.
export function useLocalPdfs() {
  const [list, setList] = useState<LocalPdf[]>(() => savedLocalPdfs());
  const [message, setMessage] = useState<string | null>(null);
  const listRef = useRef(list);
  // 방금 연 파일의 바이트(해시 계산에 읽은 것). 원문 화면이 같은 파일을 다시 읽지 않게 한 개만 둔다.
  const lastRead = useRef<{ uri: string; data: Uint8Array } | null>(null);

  const commit = useCallback((next: LocalPdf[]) => {
    listRef.current = next;
    setList(next);
    saveLocalPdfs(next);
  }, []);

  // 파일을 읽어 문서 id(내용 해시)를 구하고 최근 목록 맨 앞에 둔다. 실패하면 null.
  const open = useCallback(
    async (uri: string, name: string): Promise<LocalPdf | null> => {
      setMessage(null);
      try {
        const { data, documentId } = await readLocalPdf(uri);
        lastRead.current = { uri, data };
        const entry: LocalPdf = { uri, name, documentId, openedAt: new Date().toISOString() };
        const { list: next, dropped } = rememberLocalPdf(listRef.current, entry);
        commit(next);
        for (const d of dropped) void releaseUri(d.uri);
        return entry;
      } catch (e) {
        console.error("local pdf open failed", e);
        setMessage(
          `PDF 를 열지 못했습니다. 파일이 옮겨졌거나 지워졌을 수 있습니다. (${e instanceof Error ? e.message : String(e)})`,
        );
        return null;
      }
    },
    [commit],
  );

  const pick = useCallback(async (): Promise<LocalPdf | null> => {
    const picked = await pickPdfFile();
    if (!picked.uri) return null;
    const entry = await open(picked.uri, displayNameOf(picked.name, picked.uri));
    if (entry && !picked.persisted) setMessage("이 파일은 영구 권한을 받지 못해, 앱을 다시 켜면 다시 골라야 할 수 있습니다.");
    return entry;
  }, [open]);

  const remove = useCallback(
    (uri: string) => {
      commit(forgetLocalPdf(listRef.current, uri));
      void releaseUri(uri);
    },
    [commit],
  );

  // 원문 화면용 바이트: 방금 연 파일이면 그대로, 아니면 다시 읽는다.
  const load = useCallback(async (uri: string): Promise<Uint8Array> => {
    const last = lastRead.current;
    if (last?.uri === uri) return last.data;
    return (await readLocalPdf(uri)).data;
  }, []);

  return { list, message, pick, open, remove, load };
}
