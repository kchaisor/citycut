import { FlipHorizontal2, RotateCcw, RotateCw, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  formatOffset,
  lookingDirection,
  rotateAngle,
  type SectionCutStore,
  type SectionFill,
} from "../lib/sectionCut";

const FILLS: readonly [SectionFill, string][] = [
  ["solid", "Poché"],
  ["hatch", "Hatch"],
];

export function SectionCutToggle({ store }: { store: SectionCutStore }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  return (
    <button
      type="button"
      className={state.enabled ? "proj-btn active studio-submode-pill is-active section-cut-toggle" : "proj-btn studio-submode-pill section-cut-toggle"}
      aria-pressed={state.enabled}
      onClick={() => store.set({ enabled: !state.enabled })}
    >
      Section cut
    </button>
  );
}

export function SectionCutPanel({ store }: { store: SectionCutStore }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  if (!state.enabled) return null;
  return (
    <div
      className="section-cut-card hud-card"
      role="region"
      aria-label="Section cut"
      data-offset={state.offsetM.toFixed(2)}
      data-angle={state.angleDeg}
      data-flipped={state.flipped ? "true" : "false"}
      data-fill={state.fill}
    >
      <div className="section-cut-head">
        <span className="section-cut-tag mono">A–A′</span>
        <strong>Section cut</strong>
        <button type="button" className="section-cut-close" aria-label="Close section cut" onClick={() => store.set({ enabled: false })}>
          <X size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <div className="section-cut-readout mono">
        <span>
          Offset <b className="section-cut-offset">{formatOffset(state.offsetM)}</b>
        </span>
        <span>
          Bearing <b>{Math.round(state.angleDeg)}°</b>
        </span>
        <span>
          Looking <b className="section-cut-looking">{lookingDirection(state)}</b>
        </span>
      </div>
      <div className="section-cut-actions">
        <button
          type="button"
          className="section-cut-btn"
          aria-label="Rotate cut 15 degrees anticlockwise"
          onClick={() => store.set({ angleDeg: rotateAngle(state.angleDeg, 1) })}
        >
          <RotateCcw size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="section-cut-btn"
          aria-label="Rotate cut 15 degrees clockwise"
          onClick={() => store.set({ angleDeg: rotateAngle(state.angleDeg, -1) })}
        >
          <RotateCw size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="section-cut-btn section-cut-flip"
          aria-label={`Flip view direction, now looking ${lookingDirection(state)}`}
          onClick={() => store.set({ flipped: !state.flipped })}
        >
          <FlipHorizontal2 size={13} strokeWidth={2.2} aria-hidden="true" />
          <span>Flip</span>
        </button>
        <div className="section-cut-fill" role="group" aria-label="Cut face fill">
          {FILLS.map(([fill, label]) => (
            <button
              key={fill}
              type="button"
              className={state.fill === fill ? "section-cut-seg is-active" : "section-cut-seg"}
              aria-pressed={state.fill === fill}
              onClick={() => store.set({ fill })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="section-cut-hint">Drag the plane or its handle · snaps every 5 m · hold Alt for free</p>
    </div>
  );
}
