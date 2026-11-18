import type { PlanViewport } from "./planViewport";

export function createThrottledViewportSink(
  sink: (view: PlanViewport) => void,
  intervalMs = 120,
): { push: (view: PlanViewport) => void; flush: () => void } {
  let latest: PlanViewport | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (latest) {
      sink(latest);
      latest = null;
    }
  };
  const push = (view: PlanViewport) => {
    latest = view;
    if (!timer) timer = setTimeout(flush, intervalMs);
  };
  return { push, flush };
}
