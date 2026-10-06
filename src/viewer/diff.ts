import type { BundleLibrary } from "../bundle/schema";

// 새로고침 전후 번들 비교(순수 함수). "새 하이라이트 2개 · 수정 1개" 같은 안내에 쓴다.
export interface LibraryDiff {
  added: number; // 새 하이라이트
  removed: number; // 지워진 하이라이트
  changed: number; // 노트·보드·색이 바뀐 하이라이트
}

export function diffLibraries(prev: BundleLibrary, next: BundleLibrary): LibraryDiff {
  const before = new Map(prev.highlights.map((h) => [h.id, h]));
  const afterIds = new Set(next.highlights.map((h) => h.id));
  let added = 0;
  let changed = 0;
  for (const h of next.highlights) {
    const old = before.get(h.id);
    if (!old) added++;
    else if (
      old.color !== h.color ||
      (old.note?.updatedAt ?? null) !== (h.note?.updatedAt ?? null) ||
      old.boardSvg !== h.boardSvg
    )
      changed++;
  }
  const removed = prev.highlights.filter((h) => !afterIds.has(h.id)).length;
  return { added, removed, changed };
}

export function describeDiff(d: LibraryDiff, sameExport: boolean): string {
  const parts = [
    d.added && `새 하이라이트 ${d.added}개`,
    d.changed && `수정 ${d.changed}개`,
    d.removed && `삭제 ${d.removed}개`,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  // 내보낸 시각까지 같으면 Drive 가 아직 새 파일을 주지 않은 것일 수 있다.
  return sameExport ? "바뀐 내용 없음 (맥에서 방금 바꿨다면 Drive 동기화를 조금 기다려 주세요)" : "바뀐 내용 없음";
}

// 앱으로 돌아왔을 때 자동 새로고침할지: 마지막으로 읽은 지 minGapMs 이상 지났을 때만.
export function shouldAutoRefresh(lastReadAt: string | null, now: number, minGapMs = 60_000): boolean {
  if (!lastReadAt) return true;
  return now - new Date(lastReadAt).getTime() >= minGapMs;
}
