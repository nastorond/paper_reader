// "라이브러리 내용이 바뀌었다" 알림. 자동 번들 내보내기(useBundleExport)가 구독한다.
// 노트·보드 저장, 하이라이트 생성·삭제·색 변경 뒤에 부른다.
type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyLibraryChanged(): void {
  for (const l of listeners) l();
}

export function onLibraryChanged(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
