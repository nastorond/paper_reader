import type { LocalPdf } from "../../logic/viewer/localPdfs";

// 기기의 PDF(PDF 리더): "PDF 파일 열기" 버튼과 최근 연 파일 목록.
// highlightCounts: 번들 문서 id → 하이라이트 수(PC 에서 노트를 단 논문이면 표시)
export function LocalPdfList({
  list,
  highlightCounts,
  onPick,
  onOpen,
  onRemove,
}: {
  list: LocalPdf[];
  highlightCounts: Map<string, number>;
  onPick(): void;
  onOpen(p: LocalPdf): void;
  onRemove(p: LocalPdf): void;
}) {
  return (
    <section className="local-pdfs">
      <div className="local-pdfs-head">
        <strong>기기의 PDF</strong>
        <button onClick={onPick}>PDF 파일 열기</button>
      </div>
      {list.length === 0 ? (
        <p className="viewer-hint">내 파일·다운로드·Drive 의 PDF 를 골라 읽을 수 있습니다.</p>
      ) : (
        <ul className="vocab-list">
          {list.map((p) => {
            const count = p.documentId ? highlightCounts.get(p.documentId) ?? 0 : 0;
            return (
              <li key={p.uri} className="local-pdf-row">
                <button className="paper-item" onClick={() => onOpen(p)}>
                  <span className="vocab-text">{p.name}</span>
                  <span className="vocab-meta">
                    {fmtDate(p.openedAt)}
                    {count > 0 ? ` · 하이라이트 ${count}` : ""}
                  </span>
                </button>
                <button className="link" aria-label={`${p.name} 목록에서 지우기`} onClick={() => onRemove(p)}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
