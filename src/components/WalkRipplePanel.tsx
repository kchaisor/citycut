import { WALK_RIPPLE_SPEED_MPM, WALK_RIPPLE_BANDS_MIN } from "../lib/walkRippleNetwork";
import type { WalkRipple } from "./useWalkRipple";

export function WalkRipplePanel({ ripple }: { ripple: WalkRipple }) {
  const ready = ripple.status === "ready" || ripple.status === "animating";
  return (
    <div className="sun-study walk-ripple-panel" role="group" aria-label="Walk ripple">
      <h4 className="sun-study-kicker">Walk Ripple</h4>
      <p className="field-note">
        {ripple.placing
          ? "Click the ground in the 3D view to set the walk origin."
          : "A yellow wave spreads along walkable streets and footpaths; buildings tint by walk time."}
      </p>
      <label className="view-walk-field">
        <span>Walking speed</span>
        <span className="mono">{WALK_RIPPLE_SPEED_MPM} m/min</span>
      </label>
      <div className="walk-ripple-legend" aria-label="Walk time bands">
        {WALK_RIPPLE_BANDS_MIN.map((min) => (
          <span key={min}>
            <i className={`walk-ripple-swatch band-${min}`} aria-hidden="true" />0 – {min} min
          </span>
        ))}
      </div>
      <div className="view-walk-actions">
        <button
          type="button"
          className={ripple.placing ? "shape-btn on" : "shape-btn"}
          aria-pressed={ripple.placing}
          onClick={() => ripple.setPlacing(!ripple.placing)}
        >
          {ripple.placing ? "Cancel pick" : ready ? "Pick new origin" : "Pick origin"}
        </button>
        <button type="button" className="shape-btn" disabled={!ready && !ripple.times} onClick={ripple.clear}>
          Clear
        </button>
      </div>
      {ripple.modeLabel ? (
        <p className="field-note walk-ripple-mode" role="status">
          {ripple.modeLabel}
        </p>
      ) : null}
      <dl className="stats view-walk-stats">
        <dt>Buildings scored</dt>
        <dd>{ripple.arrivalCount > 0 ? `${ripple.arrivalCount}` : "–"}</dd>
        <dt>Status</dt>
        <dd>
          {ripple.status === "animating"
            ? "Wave spreading…"
            : ripple.status === "ready"
              ? "Complete"
              : ripple.status === "placing"
                ? "Pick origin"
                : "Idle"}
        </dd>
      </dl>
    </div>
  );
}

export function WalkRippleLegend() {
  return (
    <div className="view-legend walk-ripple-legend-float" aria-label="Walk ripple legend">
      <span>
        <i style={{ background: "var(--walk-ripple-band-0)" }} /> 0 – 5 min
      </span>
      <span>
        <i style={{ background: "var(--walk-ripple-band-1)" }} /> 5 – 10 min
      </span>
      <span>
        <i style={{ background: "var(--walk-ripple-band-2)" }} /> 10 – 15 min
      </span>
    </div>
  );
}
