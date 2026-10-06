// Tauri 가 가로챈 파일 드롭을 Excalidraw 에 HTML 드롭 이벤트로 다시 전달한다.
// Excalidraw 가 원래 하던 대로 이미지 크기 조정·저장·위치 지정을 처리한다.
export function dropFilesOnBoard(files: File[], clientX: number, clientY: number): boolean {
  const target = document.elementFromPoint(clientX, clientY);
  if (!target?.closest(".board-host")) return false;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX, clientY, dataTransfer: dt }));
  return true;
}
