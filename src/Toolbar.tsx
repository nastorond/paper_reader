import { useEffect, useState } from "react";

interface Props {
  title: string | null;
  pageIndex: number;
  numPages: number;
  scale: number;
  onOpen(): void;
  onGoToPage(index: number): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onFitWidth(): void;
}

export function Toolbar(props: Props) {
  const { title, pageIndex, numPages, scale } = props;
  const hasDoc = numPages > 0;
  // 입력 중인 값은 따로 들고 있다가 Enter/포커스 해제 때 이동한다.
  const [pageInput, setPageInput] = useState(String(pageIndex + 1));
  useEffect(() => setPageInput(String(pageIndex + 1)), [pageIndex]);

  const commitPage = () => {
    const n = Number.parseInt(pageInput, 10);
    if (Number.isFinite(n) && n >= 1 && n <= numPages) props.onGoToPage(n - 1);
    else setPageInput(String(pageIndex + 1));
  };

  return (
    <header className="toolbar">
      <button onClick={props.onOpen} title="PDF 열기 (⌘O)">
        열기
      </button>
      <div className="toolbar-group">
        <button disabled={!hasDoc || pageIndex <= 0} onClick={() => props.onGoToPage(pageIndex - 1)} title="이전 페이지">
          ◀
        </button>
        <input
          className="page-input"
          value={hasDoc ? pageInput : ""}
          disabled={!hasDoc}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commitPage()}
          onBlur={commitPage}
          aria-label="페이지 번호"
        />
        <span className="page-count">/ {hasDoc ? numPages : "-"}</span>
        <button
          disabled={!hasDoc || pageIndex >= numPages - 1}
          onClick={() => props.onGoToPage(pageIndex + 1)}
          title="다음 페이지"
        >
          ▶
        </button>
      </div>
      <div className="toolbar-group">
        <button disabled={!hasDoc} onClick={props.onZoomOut} title="축소 (⌘−)">
          −
        </button>
        <span className="zoom-label">{Math.round(scale * 100)}%</span>
        <button disabled={!hasDoc} onClick={props.onZoomIn} title="확대 (⌘+)">
          +
        </button>
        <button disabled={!hasDoc} onClick={props.onFitWidth} title="폭 맞춤 (⌘0)">
          폭 맞춤
        </button>
      </div>
      <div className="toolbar-title" title={title ?? undefined}>
        {title ?? ""}
      </div>
    </header>
  );
}
