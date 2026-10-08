import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";

// 개발 자가 테스트(VITE_DEV_TYPE_NOTE): 새 노트(autoFocus)에 글을 입력한다. 입력 규칙을 거치지 않는 경로라
// (한글 입력기와 같은 상황) MathAutoConvert 가 $$...$$ 를 바꾸는지 확인할 수 있다.
export function useDevTypeNote(editor: Editor | null, autoFocus: boolean): void {
  const devTypedRef = useRef(false); // StrictMode 의 effect 이중 실행으로 두 번 입력되지 않게
  useEffect(() => {
    const text = import.meta.env.DEV ? import.meta.env.VITE_DEV_TYPE_NOTE : undefined;
    if (!editor || !autoFocus || !text || devTypedRef.current) return;
    devTypedRef.current = true;
    editor.chain().focus("end").insertContent(text).run();
  }, [editor, autoFocus]);
}
