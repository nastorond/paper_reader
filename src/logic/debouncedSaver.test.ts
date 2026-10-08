import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedSaver } from "./debouncedSaver";

describe("createDebouncedSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("연속 입력은 마지막 값만, 500ms 뒤에 한 번 저장", async () => {
    const save = vi.fn(async () => {});
    const s = createDebouncedSaver(save, 500);
    s.schedule("a");
    await vi.advanceTimersByTimeAsync(300);
    s.schedule("ab");
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("ab");
    expect(s.pending()).toBe(false);
  });

  it("flush 는 대기 중인 값을 즉시 저장하고, 이후 타이머는 다시 저장하지 않는다", async () => {
    const save = vi.fn(async () => {});
    const s = createDebouncedSaver(save, 500);
    s.schedule("x");
    await s.flush();
    expect(save).toHaveBeenCalledWith("x");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("대기 중인 값이 없으면 flush 는 아무것도 안 한다", async () => {
    const save = vi.fn(async () => {});
    await createDebouncedSaver(save).flush();
    expect(save).not.toHaveBeenCalled();
  });
});
