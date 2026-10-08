import { useCallback, useMemo, useRef, useState } from "react";
import { createHighlight, removeHighlight, setHighlightColor } from "../../services/highlights";
import { loadHighlights } from "../../services/documents";
import { confirmDeleteHighlight } from "../../services/dialogs";
import { readingOrder } from "../../logic/highlight/order";
import type { Highlight } from "../../logic/types";
import type { MergeResult } from "../../services/sync/syncFiles";
import type { DraftResult } from "../pdf/fromSelection";
import type { NoteTab } from "../desktop/note/NotePanel";
import { devLog } from "../../dev/devLog";
import type { Status } from "./useStatus";

// 현재 문서의 하이라이트, 선택(=열린 노트), 노트/보드 탭.
export function useHighlights(documentId: string | null, status: Status) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 방금 만든 하이라이트면 노트 편집기에 바로 포커스(핵심 흐름 3번)
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  // 노트/보드 탭. 다른 하이라이트로 바꿔도 마지막 탭을 유지한다.
  const [noteTab, setNoteTab] = useState<NoteTab>(
    import.meta.env.DEV && import.meta.env.VITE_DEV_OPEN_BOARD ? "board" : "note",
  );
  // 다른 PC 에서 바뀐 노트를 열고 있으면 패널을 다시 만들어 새 내용을 읽게 한다(NotePanel key)
  const [panelVersion, setPanelVersion] = useState(0);

  const ordered = useMemo(() => readingOrder(highlights), [highlights]);
  const selected = highlights.find((h) => h.id === selectedId) ?? null;

  // 문서를 새로 열었을 때
  const reset = useCallback((list: Highlight[]) => {
    setHighlights(list);
    setSelectedId(null);
  }, []);

  // 하이라이트를 눌러 노트 열기(포커스는 주지 않음). null 이면 닫기.
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setFocusNoteId(null);
  }, []);

  // 선택 영역 → 하이라이트 저장 → 노트 열고 바로 입력
  const create = useCallback(
    async (result: DraftResult | undefined) => {
      if (!documentId || !result) return;
      if (!result.ok) {
        status.showNotice(
          result.reason === "cross-page" ? "한 페이지 안에서만 하이라이트할 수 있습니다." : "하이라이트할 문구를 먼저 선택하세요.",
        );
        return;
      }
      try {
        const h = await createHighlight(documentId, result.draft);
        devLog(`highlight saved p${h.pageIndex + 1} "${h.text}" rects=${JSON.stringify(h.rects)}`);
        window.getSelection()?.removeAllRanges();
        setHighlights((prev) => [...prev, h]);
        setSelectedId(h.id);
        setFocusNoteId(h.id);
        setNoteTab("note");
      } catch (e) {
        status.showError("하이라이트를 저장하지 못했습니다", e);
      }
    },
    [documentId, status],
  );

  const changeColor = useCallback(
    async (id: string, color: string) => {
      setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, color } : h)));
      try {
        await setHighlightColor(id, color);
      } catch (e) {
        status.showError("색상을 저장하지 못했습니다", e);
      }
    },
    [status],
  );

  // 확인 없이 삭제. 열려 있던 노트 패널을 먼저 닫아서 남은 노트 변경이 저장된 뒤 지워지게 한다.
  const remove = useCallback(
    async (h: Highlight) => {
      setSelectedId((cur) => (cur === h.id ? null : cur));
      await new Promise((r) => setTimeout(r, 0));
      try {
        await removeHighlight(h.id);
        setHighlights((prev) => prev.filter((x) => x.id !== h.id));
        devLog(`highlight deleted ${h.id} "${h.text}"`);
      } catch (e) {
        status.showError("삭제하지 못했습니다", e);
      }
    },
    [status],
  );

  const requestDelete = useCallback(
    async (h: Highlight) => {
      if (await confirmDeleteHighlight(h)) await remove(h);
    },
    [remove],
  );

  // PC 간 동기화로 DB 가 바뀌었을 때: 하이라이트를 다시 읽고, 열린 노트가 바뀌었으면 패널을 새로 만든다.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const applyRemote = useCallback(
    async (results: MergeResult[]) => {
      if (documentId) setHighlights(await loadHighlights(documentId));
      const sel = selectedRef.current;
      if (
        sel &&
        results.some((r) => r.plan.highlights.some((h) => h.id === sel) || r.plan.notes.some((n) => n.highlightId === sel))
      ) {
        setPanelVersion((v) => v + 1);
      }
    },
    [documentId],
  );

  return {
    highlights,
    ordered,
    selected,
    selectedId,
    focusNoteId,
    noteTab,
    setNoteTab,
    panelVersion,
    reset,
    select,
    create,
    changeColor,
    remove,
    requestDelete,
    applyRemote,
  };
}

export type Highlights = ReturnType<typeof useHighlights>;
