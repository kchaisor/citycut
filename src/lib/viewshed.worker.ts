import { viewshedFrame, type HeightGrid } from "./viewshed";

export type ViewshedWorkerRequest = {
  grid: HeightGrid;
  samples: Float64Array;
  eyeZ: Float64Array;
  radius: number;
};

export type ViewshedWorkerMessage =
  | { type: "frame"; index: number; frame: Uint8Array }
  | { type: "done"; ms: number };

type WorkerScope = {
  onmessage: ((event: MessageEvent<ViewshedWorkerRequest>) => void) | null;
  postMessage: (message: ViewshedWorkerMessage, transfer?: Transferable[]) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<ViewshedWorkerRequest>) => {
  const { grid, samples, eyeZ, radius } = event.data;
  const started = performance.now();
  const count = samples.length / 2;
  for (let i = 0; i < count; i++) {
    const frame = viewshedFrame(grid, samples[2 * i]!, samples[2 * i + 1]!, eyeZ[i]!, radius);
    scope.postMessage({ type: "frame", index: i, frame } satisfies ViewshedWorkerMessage, [frame.buffer]);
  }
  scope.postMessage({ type: "done", ms: performance.now() - started } satisfies ViewshedWorkerMessage);
};
