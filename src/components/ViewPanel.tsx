import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { VIEWSHED_RADIUS_OPTIONS_M, VIEWSHED_SAMPLE_SPACING_M } from "../lib/viewshed";
import { useWalkPlayback, WALK_EYE_MAX_M, WALK_EYE_MIN_M, WALK_SPEEDS, type WalkViewshed } from "./useWalkViewshed";

function metres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export function ViewPanel({ walk }: { walk: WalkViewshed }) {
  const [eyeText, setEyeText] = useState(walk.eyeM.toFixed(1));
  useEffect(() => setEyeText(walk.eyeM.toFixed(1)), [walk.eyeM]);
  const at = useWalkPlayback(walk);
  const ready = walk.status === "ready" || walk.status === "computing";
  const last = Math.max(0, walk.sampleCount - 1);

  return (
    <div className="sun-study view-walk" role="group" aria-label="View along a walk">
      <h4 className="sun-study-kicker">Path</h4>
      <p className="field-note view-walk-hint">
        {walk.drawing
          ? "Click the ground in the 3D view to add points. The path is smoothed through them."
          : walk.clickCount
            ? "Path drawn. Add points or clear it to redraw."
            : "Draw a path to see what a person walking it would see."}
      </p>
      <div className="view-walk-actions">
        <button
          type="button"
          className={walk.drawing ? "shape-btn on" : "shape-btn"}
          aria-pressed={walk.drawing}
          onClick={() => walk.setDrawing(!walk.drawing)}
        >
          {walk.drawing ? "Stop drawing" : walk.clickCount ? "Add points" : "Draw path"}
        </button>
        <button type="button" className="shape-btn" disabled={!walk.clickCount} onClick={walk.clear}>
          Clear and redraw
        </button>
      </div>

      <h4 className="sun-study-kicker">Settings</h4>
      <label className="view-walk-field">
        <span>Eye height</span>
        <span>
          <input
            className="view-walk-eye"
            type="number"
            inputMode="decimal"
            min={WALK_EYE_MIN_M}
            max={WALK_EYE_MAX_M}
            step={0.1}
            aria-label="Eye height in metres"
            value={eyeText}
            onChange={(event) => {
              setEyeText(event.target.value);
              const v = Number(event.target.value);
              if (event.target.value !== "" && Number.isFinite(v) && v >= WALK_EYE_MIN_M && v <= WALK_EYE_MAX_M) walk.setEyeM(v);
            }}
            onBlur={() => setEyeText(walk.eyeM.toFixed(1))}
          />{" "}
          m
        </span>
      </label>
      <div className="view-walk-field">
        <span>Radius</span>
        <div className="view-walk-radius" role="radiogroup" aria-label="Radius">
          {VIEWSHED_RADIUS_OPTIONS_M.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={walk.radiusM === r}
              className={walk.radiusM === r ? "shape-btn on" : "shape-btn"}
              onClick={() => walk.setRadiusM(r)}
            >
              {r} m
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="shape-btn view-walk-compute"
        disabled={walk.sampleCount < 2 || walk.status === "computing" || (walk.status === "ready" && !walk.stale)}
        onClick={walk.compute}
      >
        {walk.status === "computing"
          ? `Computing ${Math.round(walk.progress * 100)}%`
          : walk.stale
            ? "Recompute with new settings"
            : walk.status === "ready"
              ? "Computed"
              : "Compute view"}
      </button>

      <h4 className="sun-study-kicker">Walk</h4>
      <div className="sun-study-row">
        <button
          type="button"
          className="sun-study-play"
          aria-label={walk.playing ? "Pause walk" : "Play walk"}
          aria-pressed={walk.playing}
          disabled={!ready}
          onClick={() => walk.setPlaying(!walk.playing)}
        >
          {walk.playing ? <Pause size={16} strokeWidth={1.75} /> : <Play size={16} strokeWidth={1.75} />}
        </button>
        <input
          className="sun-study-scrub"
          type="range"
          aria-label="Position along the walk"
          min={0}
          max={last}
          step={1}
          disabled={!ready}
          value={Math.min(at.index, last)}
          onChange={(event) => {
            walk.setPlaying(false);
            walk.seek(Number(event.target.value));
          }}
        />
        <span className="sun-study-time">{ready ? metres(at.distanceM) : "–"}</span>
      </div>
      <div className="sun-study-speed view-walk-speed" role="radiogroup" aria-label="Playback speed">
        {WALK_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={walk.speed === s}
            className={walk.speed === s ? "shape-btn on" : "shape-btn"}
            onClick={() => walk.setSpeed(s)}
          >
            {s}× walk
          </button>
        ))}
      </div>

      <dl className="stats view-walk-stats">
        <dt>Path length</dt>
        <dd>{walk.sampleCount > 1 ? metres(walk.lengthM) : "–"}</dd>
        <dt>Viewpoints, every {VIEWSHED_SAMPLE_SPACING_M} m</dt>
        <dd>{walk.sampleCount > 1 ? `${walk.sampleCount}` : "–"}</dd>
        <dt>Compute time</dt>
        <dd>{walk.computeMs !== null ? `${(walk.computeMs / 1000).toFixed(1)} s` : "–"}</dd>
        <dt>Visible now, ground in radius</dt>
        <dd>{at.visiblePercent !== null ? `${Math.round(at.visiblePercent)}%` : "–"}</dd>
        <dt>Seen on walk</dt>
        <dd>{at.seenHa !== null ? `${at.seenHa.toFixed(2)} ha` : "–"}</dd>
      </dl>

      <p className="field-note view-walk-limits">
        <strong>Estimate limits.</strong> Buildings are solid blocks from ground to roof (no overhangs, arcades or
        windows). Trees are ignored. A point on the path inside a building looks out from its edge. Only open ground is scored, from {walk.eyeM.toFixed(1)} m eye height to 0.3 m
        above the ground.
      </p>
    </div>
  );
}

export function ViewLegend() {
  return (
    <div className="view-legend" aria-label="View legend">
      <span>
        <i style={{ background: "var(--view-visible)" }} /> Visible now
      </span>
      <span>
        <i style={{ background: "var(--view-seen)" }} /> Seen on walk
      </span>
      <span>
        <i style={{ background: "var(--view-blocked)" }} /> Not visible
      </span>
      <span>
        <i className="view-legend-path" /> Path
      </span>
    </div>
  );
}
