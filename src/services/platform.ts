// 데스크톱 플랫폼 차이(맥 / Windows). 단축키 기본 키: 맥 ⌘, Windows Ctrl.
export const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

// 단축키 기본 키가 눌렸는지(맥 ⌘, Windows Ctrl)
export function isModKey(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

// 안내 문구용: modLabel("O") → 맥 "⌘O", Windows "Ctrl+O"
export function modLabel(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}
