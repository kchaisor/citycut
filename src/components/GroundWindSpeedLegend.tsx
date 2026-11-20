import { getColour } from "../lib/colours";
import { groundWindLegendGradient } from "../lib/groundWindRamp";
import { useColourRevision } from "../lib/useColourRevision";

export function GroundWindSpeedLegend() {
  useColourRevision();
  return (
    <div className="ground-wind-legend" aria-label="Ground wind speed: sheltered, open, speeding up">
      <span className="ground-wind-legend-bar" aria-hidden="true" style={{ background: groundWindLegendGradient(getColour) }} />
      <span className="ground-wind-legend-labels mono" aria-hidden="true">
        <span>sheltered</span>
        <span>open</span>
        <span>speeding up</span>
      </span>
    </div>
  );
}
