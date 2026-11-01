import { WALK_RIPPLE_SPEED_MPM, WALK_RIPPLE_BANDS_MIN } from "../lib/walkRippleNetwork";
import { WALK_RIPPLE_MAX_ORIGINS } from "../lib/walkRippleMultiSource";
import type { WalkRipple } from "./useWalkRipple";

const ORIGIN_LABELS = ["Yellow", "Cyan", "White"] as const;

export function WalkRipplePanel({ ripple }: { ripple: WalkRipple }) {
  const ready = ripple.status === "ready" || ripple.status === "animating" || ripple.status === "computing";
  const rival = ripple.originPoints.length >= 2;
  return (
    <div className="sun-study walk-ripple-panel" role="group" aria-label="Walk ripple">
      <h4 className="sun-study-kicker">Walk Ripple</h4>
      <p className="field-note">
        {ripple.placing
          ? "Click the ground in the 3D view to set the walk origin."
          : rival
            ? "Shift-click a building or the ground to add a rival origin (up to 3). Drag a marker to move it."
            : "A yellow wave spreads along walkable streets and footpaths; buildings tint by walk time."}
      </p>
      <label className="view-walk-field">
        <span>Walking speed</span>
        <span className="mono">{WALK_RIPPLE_SPEED_MPM} m/min</span>
      </label>
      {!rival ? (
        <div className="walk-ripple-legend" aria-label="Walk time bands">
          {WALK_RIPPLE_BANDS_MIN.map((min) => (
            <span key={min}>
              <i className={`walk-ripple-swatch band-${min}`} aria-hidden="true" />0 – {min} min
            </span>
          ))}
        </div>
      ) : (
        <div className="walk-ripple-rival-origins" aria-label="Rival origin shares">
          {ripple.originPoints.map((_, index) => (
            <div key={index} className="walk-ripple-origin-row">
              <span className="walk-ripple-origin-chip">
                <i className={`walk-ripple-swatch origin-${index}`} aria-hidden="true" />
                {ORIGIN_LABELS[index]} origin
              </span>
              <span className="mono walk-ripple-origin-share">{ripple.originShareLabels[index] ?? "–"}</span>
              <button type="button" className="shape-btn walk-ripple-origin-remove" onClick={() => ripple.removeOrigin(index)}>
                Remove
              </button>
            </div>
          ))}
          {ripple.canAddOrigin ? (
            <p className="field-note">Shift-click to add origin {ripple.originPoints.length + 1} of {WALK_RIPPLE_MAX_ORIGINS}.</p>
          ) : null}
        </div>
      )}
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
        <dt>Origins</dt>
        <dd>{ripple.originPoints.length > 0 ? `${ripple.originPoints.length}` : "–"}</dd>
        {ripple.workerMs != null ? (
          <>
            <dt>Worker</dt>
            <dd>{`${Math.round(ripple.workerMs)} ms`}</dd>
          </>
        ) : null}
        <dt>Status</dt>
        <dd>
          {ripple.status === "computing"
            ? "Computing…"
            : ripple.status === "animating"
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

export function WalkRippleRivalLegend({ originCount }: { originCount: number }) {
  if (originCount < 2) return null;
  return (
    <div className="view-legend walk-ripple-legend-float walk-ripple-rival-legend" aria-label="Rival origin legend">
      <span>
        <i style={{ background: "var(--walk-ripple-origin-0)" }} /> Origin 1
      </span>
      {originCount >= 2 ? (
        <span>
          <i style={{ background: "var(--walk-ripple-origin-1)" }} /> Origin 2
        </span>
      ) : null}
      {originCount >= 3 ? (
        <span>
          <i style={{ background: "var(--walk-ripple-origin-2)" }} /> Origin 3
        </span>
      ) : null}
      <span>
        <i style={{ background: "var(--walk-ripple-seam)" }} /> Seam
      </span>
    </div>
  );
}
