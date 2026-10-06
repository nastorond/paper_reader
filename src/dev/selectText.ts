import { devLog } from "./devLog";

// 개발 자가 테스트: 텍스트 레이어에서 needle 을 찾아(없으면 아무것도 안 함) 브라우저 선택 영역으로 잡는다.
// 마우스 드래그와 같은 선택 하이라이트가 그려지므로, 화면 캡처로 글자와 맞는지 확인할 수 있다.
// 텍스트 레이어는 단어마다 span 이 나뉘므로 여러 텍스트 노드에 걸친 문구도 찾는다.
export function selectTextInLayer(container: HTMLElement, needle: string): void {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let all = "";
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
    starts.push(all.length);
    all += n.textContent ?? "";
  }
  const at = all.indexOf(needle);
  if (at < 0) return;

  const locate = (offset: number): [Text, number] => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > offset) i--;
    return [nodes[i], offset - starts[i]];
  };
  const range = document.createRange();
  range.setStart(...locate(at));
  range.setEnd(...locate(at + needle.length));
  range.startContainer.parentElement?.scrollIntoView({ block: "center" });
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  const r = range.getBoundingClientRect();
  devLog(`selected "${needle}" at x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} w=${r.width.toFixed(1)} h=${r.height.toFixed(1)}`);
}
