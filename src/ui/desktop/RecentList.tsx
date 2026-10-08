import type { RecentDocument } from "../../services/db/db";
import { formatDate } from "../../logic/format";

interface Props {
  docs: RecentDocument[];
  onOpen(doc: RecentDocument): void;
}

// 최근 문서 목록. 빈 화면과 툴바의 "최근" 메뉴에서 같이 쓴다.
export function RecentList({ docs, onOpen }: Props) {
  if (docs.length === 0) return <p className="recent-empty">최근에 연 문서가 없습니다.</p>;
  return (
    <ul className="recent-list">
      {docs.map((d) => (
        <li key={d.id}>
          <button onClick={() => onOpen(d)} title={d.path}>
            <span className="recent-title">{d.title}</span>
            <span className="recent-meta">
              하이라이트 {d.highlightCount} · {formatDate(d.lastOpenedAt)}
            </span>
            <span className="recent-path">{d.path}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
