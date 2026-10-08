import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

// 커서 바로 앞 글자가 $$...$$ 로 끝나면 인라인 수식으로, 문단 전체가 $$$...$$$ 이면 블록 수식으로 바꾼다.
//
// 왜 필요한가: TipTap 수식 확장의 입력 규칙은 키 입력 경로(handleTextInput)에서만 검사한다.
// 한글 입력기가 켜져 있으면 WebKit 이 영문·기호도 입력기 조합(composition)으로 넣는데,
// 조합이 끝난 직후 검사 시점에 마지막 글자가 아직 문서에 반영되지 않아 변환을 놓친다.
// 여기서는 문서가 바뀐 "후"에 검사하므로 입력 방식과 무관하게 동작한다.

export const INLINE_MATH_AT_END = /(^|[^$])\$\$([^$\n]+?)\$\$$/;
export const BLOCK_MATH_PARAGRAPH = /^\$\$\$([^$]+)\$\$\$$/;

// 순수 함수(테스트용): 커서 앞 텍스트에서 변환할 수식을 찾는다. from 은 textBefore 안의 시작 위치.
export function findMathAtCursor(textBefore: string): { from: number; latex: string } | null {
  const m = INLINE_MATH_AT_END.exec(textBefore);
  if (!m) return null;
  return { from: m.index + m[1].length, latex: m[2] };
}

const key = new PluginKey("mathAutoConvert");

export const MathAutoConvert = Extension.create({
  name: "mathAutoConvert",
  addProseMirrorPlugins() {
    let view: EditorView | null = null;
    return [
      new Plugin({
        key,
        view(v) {
          view = v;
          return { destroy: () => (view = null) };
        },
        appendTransaction(trs, _old, state) {
          if (!trs.some((tr) => tr.docChanged) || view?.composing) return null;
          const { $cursor } = state.selection as { $cursor?: import("@tiptap/pm/model").ResolvedPos };
          if (!$cursor || $cursor.parent.type.spec.code) return null;
          const inlineMath = state.schema.nodes.inlineMath;
          const blockMath = state.schema.nodes.blockMath;
          // 수식 노드 같은 인라인 노드는 "￼" 로 채워 위치 계산을 맞춘다.
          const textBefore = $cursor.parent.textBetween(0, $cursor.parentOffset, undefined, "￼");
          const start = $cursor.start();

          const block = BLOCK_MATH_PARAGRAPH.exec(textBefore);
          if (blockMath && block && $cursor.parentOffset === $cursor.parent.content.size) {
            const from = $cursor.before();
            return state.tr.replaceWith(from, from + $cursor.parent.nodeSize, blockMath.create({ latex: block[1].trim() }));
          }
          const hit = findMathAtCursor(textBefore);
          if (inlineMath && hit) {
            return state.tr.replaceWith(start + hit.from, $cursor.pos, inlineMath.create({ latex: hit.latex }));
          }
          return null;
        },
      }),
    ];
  },
});
