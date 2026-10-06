import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { NoteEditor } from "./NoteEditor";
import { createDebouncedSaver } from "./debouncedSaver";
import { getDb } from "../store/tauriDb";
import { getNote, saveNoteBoard, saveNoteBody } from "../store/db";
import { HIGHLIGHT_COLORS, type Highlight } from "../store/types";
import { devLog } from "../dev/devLog";
import { notifyLibraryChanged } from "../bundle/libraryEvents";

// Excalidraw 는 무거워서 보드 탭을 처음 열 때 불러온다.
const BoardEditor = lazy(() => import("./BoardEditor"));

export type NoteTab = "note" | "board";

interface Props {
  highlight: Highlight;
  autoFocus: boolean;
  tab: NoteTab;
  onTabChange(tab: NoteTab): void;
  onClose(): void;
  onJump(): void;
  onColorChange(color: string): void;
  onDelete(): void;
}

type SaveState = "idle" | "editing" | "saved" | "error";

// 오른쪽 노트 패널. 하이라이트마다 key 로 새로 만들어지므로(App.tsx) 상태가 섞이지 않는다.
export function NotePanel({ highlight, autoFocus, tab, onTabChange, onClose, onJump, onColorChange, onDelete }: Props) {
  const [loaded, setLoaded] = useState(false);
  // 탭을 바꾸면 편집기가 다시 만들어지므로, 최신 내용을 ref 에 들고 있다가 초기값으로 넘긴다.
  const bodyRef = useRef<JSONContent | null>(null);
  const boardRef = useRef<unknown | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    let cancelled = false;
    getDb()
      .then((db) => getNote(db, highlight.id))
      .then((note) => {
        if (cancelled) return;
        bodyRef.current = (note?.body as JSONContent | null | undefined) ?? null;
        boardRef.current = note?.board ?? null;
        setLoaded(true);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [highlight.id]);

  // 입력이 멈추고 500ms 뒤 저장. 패널이 닫히거나 다른 노트로 바뀌면 남은 변경을 바로 저장한다.
  const savers = useMemo(() => {
    const wrap = (what: string, save: (v: unknown) => Promise<void>) =>
      createDebouncedSaver<unknown>(async (v) => {
        try {
          await save(v);
          setSaveState("saved");
          notifyLibraryChanged();
          devLog(`${what} saved ${highlight.id}: ${JSON.stringify(v).slice(0, 160)}`);
        } catch (e) {
          console.error(e);
          setSaveState("error");
        }
      }, 500);
    return {
      body: wrap("note", async (v) => saveNoteBody(await getDb(), highlight.id, v, new Date().toISOString())),
      board: wrap("board", async (v) => saveNoteBoard(await getDb(), highlight.id, v, new Date().toISOString())),
    };
  }, [highlight.id]);
  useEffect(
    () => () => {
      void savers.body.flush();
      void savers.board.flush();
    },
    [savers],
  );

  return (
    <aside className={tab === "board" ? "note-panel wide" : "note-panel"}>
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
        <span className="note-colors">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              className={c.value === highlight.color ? "swatch active" : "swatch"}
              style={{ background: c.value }}
              title={c.name}
              onClick={() => onColorChange(c.value)}
            />
          ))}
        </span>
        <button className="note-delete" onClick={onDelete} title="하이라이트와 노트 삭제">
          삭제
        </button>
        <span className={`save-state ${saveState}`}>
          {saveState === "editing" ? "편집 중…" : saveState === "saved" ? "저장됨" : saveState === "error" ? "저장 실패" : ""}
        </span>
      </div>
      <nav className="note-tabs">
        <button className={tab === "note" ? "active" : ""} onClick={() => onTabChange("note")}>
          노트
        </button>
        <button className={tab === "board" ? "active" : ""} onClick={() => onTabChange("board")}>
          보드
        </button>
      </nav>
      {!loaded ? (
        <div className="note-loading">불러오는 중…</div>
      ) : tab === "note" ? (
        <NoteEditor
          initialBody={bodyRef.current}
          autoFocus={autoFocus}
          onChange={(b) => {
            bodyRef.current = b;
            setSaveState("editing");
            savers.body.schedule(b);
          }}
        />
      ) : (
        <Suspense fallback={<div className="note-loading">보드 불러오는 중…</div>}>
          <BoardEditor
            initialBoard={boardRef.current}
            onChange={(b) => {
              boardRef.current = b;
              setSaveState("editing");
              savers.board.schedule(b);
            }}
          />
        </Suspense>
      )}
    </aside>
  );
}
