import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Info } from "lucide-react";
import {
  setWindStreakDensity,
  useWindStreakDensity,
  WIND_STREAK_DENSITY_DEFAULT,
  WIND_STREAK_DENSITY_MAX,
  WIND_STREAK_DENSITY_MIN,
  WIND_STREAK_DENSITY_STEP,
  windStreakDensityIsDefault,
} from "../lib/windStreakDensity";

export type WindStreaksReducedMotion = {
  animateAnyway: boolean;
  onAnimateAnyway: (value: boolean) => void;
};

const TOOLTIP_HOVER_DELAY_MS = 300;

function rangeFraction(value: number): number {
  return (value - WIND_STREAK_DENSITY_MIN) / (WIND_STREAK_DENSITY_MAX - WIND_STREAK_DENSITY_MIN);
}

export function formatWindStreakDensity(density: number): string {
  return `${density.toFixed(1)}×`;
}

function ReducedMotionInfo({ animateAnyway, onAnimateAnyway }: WindStreaksReducedMotion) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef<number | null>(null);
  const tipId = useId();
  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);
  const open = hovered || focused;
  return (
    <span
      className="wind-streaks-info"
      onPointerEnter={() => {
        timer.current = window.setTimeout(() => setHovered(true), TOOLTIP_HOVER_DELAY_MS);
      }}
      onPointerLeave={() => {
        if (timer.current != null) window.clearTimeout(timer.current);
        setHovered(false);
      }}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setHovered(false);
          setFocused(false);
        }
      }}
    >
      <button
        type="button"
        className="wind-streaks-info-btn"
        aria-label="Streaks paused by the system reduced-motion setting"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={() => setFocused(true)}
      >
        <Info size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open ? (
        <span id={tipId} className="wind-streaks-tip" role="tooltip">
          <span>Streaks paused (system reduced-motion setting)</span>
          <label className="wind-streaks-tip-toggle">
            <input
              type="checkbox"
              aria-label="Animate anyway"
              checked={animateAnyway}
              onChange={(event) => onAnimateAnyway(event.target.checked)}
            />
            Animate anyway
          </label>
        </span>
      ) : null}
    </span>
  );
}

export function WindStreaksSlider({ reducedMotion = null }: { reducedMotion?: WindStreaksReducedMotion | null }) {
  const density = useWindStreakDensity();
  const titleId = useId();
  const readout = formatWindStreakDensity(density);
  const trackStyle = {
    "--wind-streaks-fill": `${rangeFraction(density) * 100}%`,
    "--wind-streaks-tick": rangeFraction(WIND_STREAK_DENSITY_DEFAULT),
  } as CSSProperties;
  return (
    <div className="wind-streaks" role="group" aria-labelledby={titleId}>
      <div className="wind-streaks-head">
        <span id={titleId} className="wind-streaks-title">
          Wind streaks
        </span>
        <output className="wind-streaks-value mono" aria-live="polite">
          {readout}
        </output>
      </div>
      <div className="wind-streaks-row">
        <span aria-hidden="true">Fewer</span>
        <span className="wind-streaks-track" style={trackStyle}>
          <span className="wind-streaks-tick" aria-hidden="true" />
          <input
            className="wind-streaks-input"
            type="range"
            aria-label="Wind streaks"
            aria-valuetext={`${readout}${windStreakDensityIsDefault(density) ? ", default" : ""}`}
            min={WIND_STREAK_DENSITY_MIN}
            max={WIND_STREAK_DENSITY_MAX}
            step={WIND_STREAK_DENSITY_STEP}
            value={density}
            onChange={(event) => setWindStreakDensity(Number(event.target.value))}
          />
        </span>
        <span aria-hidden="true">More</span>
        {reducedMotion ? <ReducedMotionInfo {...reducedMotion} /> : null}
      </div>
    </div>
  );
}
