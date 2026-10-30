import { useEffect, useMemo, type ReactNode } from "react";
import type { VocabItem } from "../../logic/viewer/vocab";

// 노트 하나의 내용(원문 문구, 논문·쪽, 노트 HTML, 보드 그림). 노트 상세 화면과 원문 옆 노트 패널이 함께 쓴다.
// children: 문구 정보 아래에 끼워 넣을 안내(예: 폴더 연결 안내)
export function NoteContent({
  item,
  boards,
  children,
}: {
  item: VocabItem;
  boards: Map<string, string>;
  children?: ReactNode;
}) {
  const h = item.highlight;
  const svg = h.boardSvg ? boards.get(h.boardSvg) : undefined;
  // SVG 는 <img> 로 넣어 스크립트가 실행되지 않게 한다.
  const svgUrl = useMemo(() => (svg ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })) : null), [svg]);
  useEffect(() => () => void (svgUrl && URL.revokeObjectURL(svgUrl)), [svgUrl]);
  return (
    <article className="vocab-detail">
      <blockquote style={{ borderLeftColor: h.color }}>{h.text}</blockquote>
      <p className="vocab-meta">
        {item.documentTitle} · p.{h.pageIndex + 1}
      </p>
      {children}
      {h.note ? (
        // 노트 HTML 은 맥 앱이 만든 것(tiptapToHtml: 글자 이스케이프, 위험한 링크 제거)
        <div className="vocab-note-html" dangerouslySetInnerHTML={{ __html: h.note.html }} />
      ) : (
        <p className="viewer-hint">노트 없음</p>
      )}
      {svgUrl && <img className="vocab-board" src={svgUrl} alt="보드" />}
    </article>
  );
}
