// 마지막 변경 후 delay(ms) 동안 추가 변경이 없으면 저장한다.
// flush(): 대기 중인 값을 즉시 저장(패널을 닫거나 다른 노트로 바꿀 때 유실 방지).
export interface DebouncedSaver<T> {
  schedule(value: T): void;
  flush(): Promise<void>;
  pending(): boolean;
}

export function createDebouncedSaver<T>(save: (value: T) => Promise<void>, delay = 500): DebouncedSaver<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: { value: T } | null = null;

  const run = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const item = latest;
    latest = null;
    if (item) await save(item.value);
  };

  return {
    schedule(value) {
      latest = { value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), delay);
    },
    flush: run,
    pending: () => latest !== null,
  };
}
