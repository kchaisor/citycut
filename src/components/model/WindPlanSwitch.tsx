import type { WindPlanState } from "../useWindPlan";

const MODES = [
  ["speed", "Wind speed"],
  ["comfort", "Comfort"],
] as const;

export function WindPlanSwitch({ plan }: { plan: Pick<WindPlanState, "mode" | "setMode" | "vectorsOn" | "setVectorsOn"> }) {
  return (
    <>
      <div className="wind-plan-switch" role="group" aria-label="Plan wind diagram">
        {MODES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={plan.mode === id ? "wind-plan-switch-btn is-active" : "wind-plan-switch-btn"}
            aria-pressed={plan.mode === id}
            onClick={() => plan.setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="wind-plan-switch wind-plan-vector-switch" role="group" aria-label="Plan wind vectors">
        <button
          type="button"
          className={plan.vectorsOn ? "wind-plan-switch-btn is-active" : "wind-plan-switch-btn"}
          aria-pressed={plan.vectorsOn}
          data-testid="wind-plan-vector-toggle"
          onClick={() => plan.setVectorsOn(!plan.vectorsOn)}
        >
          Arrows
        </button>
      </div>
    </>
  );
}
