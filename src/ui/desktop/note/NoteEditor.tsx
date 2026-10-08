import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Mathematics } from "@tiptap/extension-mathematics";
import { Placeholder } from "@tiptap/extensions";
import "katex/dist/katex.min.css";
import { MathAutoConvert } from "./mathAutoConvert";
import { modLabel } from "../../../services/platform";
import { useDevTypeNote } from "../../../dev/useDevTypeNote";

interface Props {
  initialBody: JSONContent | null;
  autoFocus: boolean;
  onChange(body: JSONContent): void;
}

interface MathEdit {
  kind: "inline" | "block";
  pos: number;
  latex: string;
}

// TipTap 리치 텍스트 노트. 헤딩·목록·코드(StarterKit), 표(TableKit), 수식(KaTeX).
// 수식 입력: 인라인 $$x^2$$, 블록은 줄 처음에 $$$...$$$ . 수식을 클릭하면 아래 입력창에서 고친다.
export function NoteEditor({ initialBody, autoFocus, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [mathEdit, setMathEdit] = useState<MathEdit | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TableKit.configure({ table: { resizable: false } }),
      Mathematics.configure({
        katexOptions: { throwOnError: false },
        inlineOptions: { onClick: (node, pos) => setMathEdit({ kind: "inline", pos, latex: node.attrs.latex }) },
        blockOptions: { onClick: (node, pos) => setMathEdit({ kind: "block", pos, latex: node.attrs.latex }) },
      }),
      MathAutoConvert,
      Placeholder.configure({ placeholder: "이 문구에 대한 노트를 적으세요…" }),
    ],
    content: initialBody ?? "",
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
  });

  useDevTypeNote(editor, autoFocus);

  if (!editor) return null;
  return (
    <div className="note-editor">
      <EditorToolbar editor={editor} onMath={(m) => setMathEdit(m)} />
      <EditorContent editor={editor} className="note-content" />
      {mathEdit && <MathEditBox editor={editor} edit={mathEdit} onDone={() => setMathEdit(null)} />}
    </div>
  );
}

function EditorToolbar({ editor, onMath }: { editor: Editor; onMath(m: MathEdit): void }) {
  // 버튼을 눌러도 편집기 포커스·선택이 유지되도록 mousedown 기본 동작을 막는다.
  const btn = (label: string, title: string, run: () => void, active = false) => (
    <button className={active ? "active" : ""} title={title} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  const chain = () => editor.chain().focus();
  return (
    <div className="note-toolbar">
      {btn("B", `굵게 (${modLabel("B")})`, () => chain().toggleBold().run(), editor.isActive("bold"))}
      {btn("I", `기울임 (${modLabel("I")})`, () => chain().toggleItalic().run(), editor.isActive("italic"))}
      {btn("H", "제목", () => chain().toggleHeading({ level: 3 }).run(), editor.isActive("heading"))}
      {btn("•", "글머리 목록", () => chain().toggleBulletList().run(), editor.isActive("bulletList"))}
      {btn("1.", "번호 목록", () => chain().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {btn("</>", "코드 블록", () => chain().toggleCodeBlock().run(), editor.isActive("codeBlock"))}
      {btn("표", "표 넣기", () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      {btn("∑", "수식 넣기 (또는 $$x^2$$ 입력)", () => {
        const pos = editor.state.selection.from;
        chain().insertInlineMath({ latex: "x", pos }).run();
        onMath({ kind: "inline", pos, latex: "x" });
      })}
      {editor.isActive("table") && (
        <>
          {btn("+행", "아래에 행 추가", () => chain().addRowAfter().run())}
          {btn("+열", "오른쪽에 열 추가", () => chain().addColumnAfter().run())}
          {btn("−표", "표 삭제", () => chain().deleteTable().run())}
        </>
      )}
    </div>
  );
}

function MathEditBox({ editor, edit, onDone }: { editor: Editor; edit: MathEdit; onDone(): void }) {
  const [latex, setLatex] = useState(edit.latex);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const apply = () => {
    const chain = editor.chain().focus();
    if (edit.kind === "inline") {
      if (latex.trim()) chain.updateInlineMath({ latex, pos: edit.pos }).run();
      else chain.deleteInlineMath({ pos: edit.pos }).run();
    } else {
      if (latex.trim()) chain.updateBlockMath({ latex, pos: edit.pos }).run();
      else chain.deleteBlockMath({ pos: edit.pos }).run();
    }
    onDone();
  };

  return (
    <div className="math-edit">
      <span>수식</span>
      <input
        ref={inputRef}
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
          if (e.key === "Escape") {
            // 패널 닫기(Esc)로 번지지 않게 여기서 멈춘다.
            e.stopPropagation();
            onDone();
          }
        }}
        spellCheck={false}
      />
      <button onClick={apply}>확인</button>
    </div>
  );
}
