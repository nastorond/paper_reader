import type { Highlight } from "../../logic/types";

interface Props {
  highlights: Highlight[]; // 이미 읽기 순서로 정렬된 목록(order.ts)
  selectedId: string | null;
  onSelect(h: Highlight): void;
  onDelete(h: Highlight): void;
}

// 왼쪽: 현재 PDF 의 하이라이트 목록. 클릭하면 본문 위치로 이동하고 노트를 연다.
export function HighlightList({ highlights, selectedId, onSelect, onDelete }: Props) {
  return (
    <aside className="hl-list">
      <div className="hl-list-head">하이라이트 {highlights.length}</div>
      {highlights.length === 0 ? (
        <p className="hl-list-empty">본문을 선택하고 H 를 누르면 여기에 모입니다.</p>
      ) : (
        <ul>
          {highlights.map((h) => (
            <li key={h.id} className={h.id === selectedId ? "selected" : ""}>
              <button className="hl-item" onClick={() => onSelect(h)} title={h.text}>
                <span className="hl-swatch" style={{ background: h.color }} />
                <span className="hl-text">{h.text}</span>
                <span className="hl-page">p.{h.pageIndex + 1}</span>
              </button>
              <button className="hl-delete" onClick={() => onDelete(h)} title="삭제">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
