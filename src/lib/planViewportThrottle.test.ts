import { describe, expect, it, vi } from "vitest";
import { createThrottledViewportSink } from "./planViewportThrottle";

describe("planViewportThrottle", () => {
  it("batches sink calls until flush", () => {
    vi.useFakeTimers();
    const sink = vi.fn();
    const { push, flush } = createThrottledViewportSink(sink, 100);
    push({ x: 1, y: 2, w: 3, h: 4 });
    push({ x: 5, y: 6, w: 7, h: 8 });
    expect(sink).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith({ x: 5, y: 6, w: 7, h: 8 });
    flush();
    vi.useRealTimers();
  });
});
