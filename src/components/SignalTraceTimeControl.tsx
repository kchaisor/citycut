import type { SignalTraceTimeSpeed } from "./useSignalTrace";

const SPEEDS: SignalTraceTimeSpeed[] = [1, 10, 60];

export function SignalTraceTimeControl({
  speed,
  onSpeedChange,
  sourceBuildingId,
}: {
  speed: SignalTraceTimeSpeed;
  onSpeedChange: (speed: SignalTraceTimeSpeed) => void;
  sourceBuildingId: number | null;
}) {
  return (
    <>
      <span className="v-sep hud-sep" aria-hidden="true" />
      <div className="solar-hours studio-quality-pills" role="group" aria-label="Signal trace time speed">
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            className={speed === value ? "h-tick studio-quality-tick active is-active" : "h-tick studio-quality-tick"}
            aria-pressed={speed === value}
            aria-label={`Signal trace ${value}x speed`}
            onClick={() => onSpeedChange(value)}
          >
            {value}x
          </button>
        ))}
      </div>
      <span className="studio-solar-time mono signal-trace-readout">
        {sourceBuildingId !== null ? "Source set · walk afterglow" : "Click a building for source"}
      </span>
    </>
  );
}
