import { useCallback, useEffect, useState } from "react";
import {
  listRecent,
  locateDocumentFile,
  openDocument,
  type OpenedDocument,
  type RecentDocument,
} from "../../services/documents";
import { pickPdfPath } from "../../services/files/openPdf";
import { confirmRepickMissingFile } from "../../services/dialogs";
import { devLog } from "../../dev/devLog";
import type { Status } from "./useStatus";

// 열린 문서와 최근 문서 목록.
// onOpened: 문서를 연 직후(배율 맞추기, 하이라이트 상태 초기화 등 화면 쪽 처리)
export function useDocument(status: Status, driveDir: string | null, onOpened: (doc: OpenedDocument) => void) {
  const [doc, setDoc] = useState<OpenedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);

  const refreshRecent = useCallback(async () => {
    try {
      const docs = await listRecent();
      setRecentDocs(docs);
      devLog(`recent: ${docs.map((d) => `${d.title}(${d.highlightCount})`).join(", ")}`);
    } catch (e) {
      console.error(e);
    }
  }, []);
  useEffect(() => void refreshRecent(), [refreshRecent]);

  // expectId: 최근 문서를 다른 위치에서 다시 고른 경우, 원래 문서와 같은 파일인지(내용 해시) 확인한다.
  const openPath = useCallback(
    async (path: string, expectId?: string) => {
      setLoading(true);
      try {
        const opened = await openDocument(path, expectId);
        if (opened.differentFromExpected) status.showNotice("고른 파일이 원래 문서와 내용이 달라 새 문서로 열었습니다.");
        devLog(`opened ${opened.title}: ${opened.highlights.length} highlights`);
        setDoc(opened);
        onOpened(opened);
        void refreshRecent();
      } catch (e) {
        status.showError("PDF를 열 수 없습니다", e);
      } finally {
        setLoading(false);
      }
    },
    [status, onOpened, refreshRecent],
  );

  const openDialog = useCallback(async () => {
    const path = await pickPdfPath();
    if (path) await openPath(path);
  }, [openPath]);

  // 최근 문서 열기. 이 PC 에 없으면 Drive 사본, 그래도 없으면 다시 고르게 한다(내용 해시로 같은 문서인지 확인).
  const openRecent = useCallback(
    async (d: RecentDocument) => {
      const path = await locateDocumentFile(d, driveDir);
      if (path) return openPath(path, path === d.path ? undefined : d.id);
      if (!(await confirmRepickMissingFile(d.title, d.path))) return;
      const picked = await pickPdfPath();
      if (picked) await openPath(picked, d.id);
    },
    [driveDir, openPath],
  );

  // 다른 PDF 로 바뀌거나 앱이 닫힐 때 이전 문서의 pdf.js 워커 자원을 해제한다.
  useEffect(() => () => void doc?.pdf.loadingTask.destroy(), [doc]);

  useEffect(() => {
    document.title = doc ? `${doc.title} — PaperBoard` : "PaperBoard";
  }, [doc]);

  return { doc, loading, recentDocs, refreshRecent, openPath, openDialog, openRecent };
}
