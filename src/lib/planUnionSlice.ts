/** Yields during long plan-only unions so idle smooth work stays under ~150 ms per task. */
export type PlanSliceController = {
  maybeYield: () => Promise<boolean>;
};

export class PlanUnionCancelled extends Error {
  override name = "PlanUnionCancelled";
}

const SLICE_BUDGET_MS = 90;

async function yieldToIdle(): Promise<void> {
  await new Promise<void>((resolve) => {
    const idle = globalThis.requestIdleCallback;
    if (typeof idle !== "function") {
      setTimeout(resolve, 0);
      return;
    }
    const started = performance.now();
    const step = (deadline: IdleDeadline) => {
      if (performance.now() - started >= SLICE_BUDGET_MS || deadline.timeRemaining() > 2) {
        resolve();
        return;
      }
      idle(step, { timeout: 100 });
    };
    idle(step, { timeout: 100 });
  });
}

export function createPlanSliceController(
  shouldContinue: () => boolean,
  budgetMs = SLICE_BUDGET_MS,
): PlanSliceController {
  let sliceStart = performance.now();
  return {
    async maybeYield() {
      if (!shouldContinue()) return false;
      if (performance.now() - sliceStart < budgetMs) return true;
      sliceStart = performance.now();
      await yieldToIdle();
      return shouldContinue();
    },
  };
}

export async function sliceStep(slice: PlanSliceController | undefined): Promise<void> {
  if (!slice) return;
  if (!(await slice.maybeYield())) throw new PlanUnionCancelled();
}
