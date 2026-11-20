import { useColourRevision } from "../lib/useColourRevision";
import { WIND_BAND_COLOUR_VARS, windSpeedLegendTickLine } from "../lib/windBins";
import { getColour } from "../lib/colours";

export function WindRoseSpeedLegend() {
  useColourRevision();
  return (
    <div className="wind-speed-step-legend" aria-label="Wind speed scale">
      <div className="wind-speed-step-bar" aria-hidden="true">
        {WIND_BAND_COLOUR_VARS.map((token) => (
          <span key={token} style={{ background: getColour(token) }} />
        ))}
      </div>
      <p className="wind-speed-step-ticks mono">{windSpeedLegendTickLine()}</p>
    </div>
  );
}