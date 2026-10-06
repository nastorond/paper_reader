import { useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { NoteEditor } from "./NoteEditor";
import { createDebouncedSaver } from "./debouncedSaver";
import { getDb } from "../store/tauriDb";
import { getNote, saveNoteBody } from "../store/db";
import type { Highlight } from "../store/types";
import { devLog } from "../dev/devLog";

interface Props {
  highlight: Highlight;
  autoFocus: boolean;
  onClose(): void;
  onJump(): void;
}

type SaveState = "idle" | "editing" | "saved" | "error";

// 오른쪽 노트 패널. 하이라이트마다 key 로 새로 만들어지므로(App.tsx) 상태가 섞이지 않는다.
export function NotePanel({ highlight, autoFocus, onClose, onJump }: Props) {
  const [body, setBody] = useState<JSONContent | null | undefined>(undefined); // undefined = 불러오는 중
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    let cancelled = false;
    getDb()
      .then((db) => getNote(db, highlight.id))
      .then((note) => !cancelled && setBody((note?.body as JSONContent | undefined) ?? null))
      .catch((e) => {
        console.error(e);
        if (!cancelled) setBody(null);
      });
    return () => {
      cancelled = true;
    };
  }, [highlight.id]);

  // 입력이 멈추고 500ms 뒤 저장. 패널이 닫히거나 다른 노트로 바뀌면 남은 변경을 바로 저장한다.
  const saver = useMemo(
    () =>
      createDebouncedSaver<JSONContent>(async (b) => {
        try {
          await saveNoteBody(await getDb(), highlight.id, b, new Date().toISOString());
          setSaveState("saved");
          devLog(`note saved ${highlight.id}: ${JSON.stringify(b).slice(0, 200)}`);
        } catch (e) {
          console.error(e);
          setSaveState("error");
        }
      }, 500),
    [highlight.id],
  );
  useEffect(() => () => void saver.flush(), [saver]);

  return (
    <aside className="note-panel">
      <header className="note-header">
        <button className="note-quote" onClick={onJump} title="본문 위치로 이동">
          “{highlight.text}”
        </button>
        <button className="note-close" onClick={onClose} title="닫기 (Esc)">
          ×
        </button>
      </header>
      <div className="note-meta">
        <span>p.{highlight.pageIndex + 1}</span>
        <span className={`save-state ${saveState}`}>
          {saveState === "editing" ? "편집 중…" : saveState === "saved" ? "저장됨" : saveState === "error" ? "저장 실패" : ""}
        </span>
      </div>
      <nav className="note-tabs">
        <button className="active">노트</button>
        <button disabled title="M3에서 추가">
          보드
        </button>
      </nav>
      {body === undefined ? (
        <div className="note-loading">불러오는 중…</div>
      ) : (
        <NoteEditor
          initialBody={body}
          autoFocus={autoFocus}
          onChange={(b) => {
            setSaveState("editing");
            saver.schedule(b);
          }}
        />
      )}
    </aside>
  );
}
