import { useId } from "react";
import {
  setWindStreakDensity,
  useWindStreakDensity,
  WIND_STREAK_DENSITY_MAX,
  WIND_STREAK_DENSITY_MIN,
  WIND_STREAK_DENSITY_STEP,
  windStreakDensityIsDefault,
} from "../lib/windStreakDensity";

export function WindStreaksSlider() {
  const density = useWindStreakDensity();
  const titleId = useId();
  return (
    <div className="wind-streaks" role="group" aria-labelledby={titleId}>
      <div className="wind-streaks-head">
        <span id={titleId} className="wind-streaks-title">
          Wind streaks
        </span>
        {windStreakDensityIsDefault(density) ? <span className="wind-streaks-caption">Default</span> : null}
      </div>
      <div className="wind-streaks-row">
        <span aria-hidden="true">Fewer</span>
        <input
          className="wind-streaks-input"
          type="range"
          aria-label="Wind streaks"
          aria-valuetext={`${density.toFixed(1)}×${windStreakDensityIsDefault(density) ? ", default" : ""}`}
          min={WIND_STREAK_DENSITY_MIN}
          max={WIND_STREAK_DENSITY_MAX}
          step={WIND_STREAK_DENSITY_STEP}
          value={density}
          onChange={(event) => setWindStreakDensity(Number(event.target.value))}
        />
        <span aria-hidden="true">More</span>
      </div>
    </div>
  );
}
