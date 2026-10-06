// 개발 모드 전용 로그 전달. vite.config.ts 의 devLogEndpoint 로 보내 터미널에서 본다.
export function devLog(...args: unknown[]): void {
  if (!import.meta.env.DEV) return;
  const text = args
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}\n${a.stack ?? ""}` : typeof a === "string" ? a : safeJson(a)))
    .join(" ");
  void fetch("/__devlog", { method: "POST", body: text }).catch(() => {});
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// console.error/warn 과 잡히지 않은 오류를 터미널로도 보낸다.
export function installDevLog(): void {
  if (!import.meta.env.DEV) return;
  for (const level of ["error", "warn"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      orig(...args);
      devLog(`console.${level}:`, ...args);
    };
  }
  window.addEventListener("error", (e) => devLog("window.error:", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => devLog("unhandledrejection:", e.reason));
}
