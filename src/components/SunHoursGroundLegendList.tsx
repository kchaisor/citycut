import { useMemo } from "react";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import {
  prefersReducedMotion,
  sunHoursProgressPercent,
} from "../lib/sunHoursProgress";
import type { SunHoursResolution } from "../lib/sunHoursQuality";

export const SUN_HOURS_DIRECT_LEGEND_DOCK_TICKS = 5;

const DOCK_TICK_STOPS = [0, 0.25, 0.5, 0.75, 1] as const;

function legendTicks(maxHours: number, count = 11, decimals = 2): string[] {
  if (!(maxHours > 0)) return ["0"];
  if (count <= 1) return [maxHours.toFixed(decimals)];
  return Array.from({ length: count }, (_, index) => {
    const value = (maxHours * index) / (count - 1);
    return value.toFixed(decimals);
  });
}

function formatDockMidHour(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

function formatDockMaxHour(maxHours: number): string {
  if (!(maxHours > 0)) return "0";
  const rounded = Math.round(maxHours * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

export function dockCompactTickLabels(maxHours: number): string[] {
  return DOCK_TICK_STOPS.map((stop, index) => {
    if (index === 0) return "0 h";
    if (index === DOCK_TICK_STOPS.length - 1) return `${formatDockMaxHour(maxHours)} h`;
    return formatDockMidHour(maxHours * stop);
  });
}

function formatMetres(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function sunHoursResolutionLabel(resolution: SunHoursResolution): string {
  return `${formatMetres(resolution.cellM)} m grid · ${resolution.stepMinutes} min steps`;
}

export function sunHoursEasedLabel(resolution: SunHoursResolution): string | null {
  if (!resolution.degraded) return null;
  return `Eased from ${formatMetres(resolution.targetCellM)} m grid for this cut size`;
}

export function sunHoursCalculatingLabel(target: SunHoursResolution | null): string {
  return target ? `Calculating ${sunHoursResolutionLabel(target)}…` : "Calculating…";
}


export function SunHoursCalculatingMeter({
  progress,
  reducedMotion,
}: {
  progress: number | null;
  reducedMotion?: boolean;
}) {
  const reduced = reducedMotion ?? prefersReducedMotion();
  const determinate = progress != null;
  const percent = determinate ? sunHoursProgressPercent(progress) : null;
  const className = [
    "sun-hours-direct-legend-progress",
    determinate ? "is-determinate" : "is-indeterminate",
    reduced ? "is-reduced" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={className}
      data-sun-hours-progress={determinate ? percent : "indeterminate"}
      role="progressbar"
      aria-label="Sun hours calculation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(progress * 100) : undefined}
      aria-valuetext={determinate ? percent! : "Calculating"}
    >
      <div className="sun-hours-direct-legend-progress-track">
        <div className="sun-hours-direct-legend-progress-fill" style={determinate ? { width: percent! } : undefined} />
      </div>
      {percent ? <span className="sun-hours-direct-legend-progress-pct">{percent}</span> : null}
    </div>
  );
}

export function SunHoursGroundLegendList({
  maxHours,
  resolution,
  compact = false,
  pending = false,
  pendingResolution = null,
  progress = null,
  reducedMotion,
}: {
  maxHours: number;
  resolution: SunHoursResolution | null;
  compact?: boolean;
  pending?: boolean;
  pendingResolution?: SunHoursResolution | null;
  progress?: number | null;
  reducedMotion?: boolean;
}) {
  useColourRevision();
  const tickCount = compact ? SUN_HOURS_DIRECT_LEGEND_DOCK_TICKS : 11;
  const tickDecimals = compact ? 1 : 2;
  const sidebarTicks = useMemo(() => legendTicks(maxHours, tickCount, tickDecimals), [maxHours, tickCount, tickDecimals]);
  const dockTicks = useMemo(() => dockCompactTickLabels(maxHours), [maxHours]);
  const gradientStops = `${getColour("--sun-hours-direct-0")}, ${getColour("--sun-hours-direct-30")}, ${getColour("--sun-hours-direct-50")}, ${getColour("--sun-hours-direct-70")}, ${getColour("--sun-hours-direct-max")}`;
  const gradient = compact
    ? `linear-gradient(to right, ${gradientStops})`
    : `linear-gradient(to top, ${gradientStops})`;
  const eased = resolution ? sunHoursEasedLabel(resolution) : null;
  const dockFootnotes = resolution
    ? [sunHoursResolutionLabel(resolution), ...(eased ? [eased] : []), "ground, roofs, walls · full daylight"]
    : [];
  const sidebarFootnote = resolution
    ? `Full daylight · ${sunHoursResolutionLabel(resolution)} on ground, roofs, and walls.${eased ? ` ${eased}.` : ""}`
    : null;
  return (
    <div
      className={compact ? "sun-hours-direct-legend is-compact" : "sun-hours-direct-legend"}
      aria-label="Direct Sun Hours legend"
      data-sun-hours-ground-legend
      data-sun-hours-direct-legend
    >
      <p className="sun-hours-direct-legend-title">Direct Sun Hours</p>
      {resolution && compact ? (
        <div className="sun-hours-direct-legend-scale">
          <div className="sun-hours-direct-legend-bar" style={{ background: gradient }} aria-hidden />
          <ol className="sun-hours-direct-legend-ticks" aria-hidden>
            {dockTicks.map((tick, index) => (
              <li key={index}>{tick}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {resolution && !compact ? (
        <div className="sun-hours-direct-legend-body">
          <span className="sun-hours-direct-legend-unit">hours</span>
          <div className="sun-hours-direct-legend-bar" style={{ background: gradient }} aria-hidden />
          <ol className="sun-hours-direct-legend-ticks" aria-hidden>
            {[...sidebarTicks].reverse().map((tick) => (
              <li key={tick}>{tick}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {compact
        ? dockFootnotes.map((line) => (
            <p key={line} className="sun-hours-direct-legend-footnote" data-sun-hours-ground-note>
              {line}
            </p>
          ))
        : sidebarFootnote && (
            <p className="field-note" data-sun-hours-ground-note>
              {sidebarFootnote}
            </p>
          )}
      {pending ? (
        <div className="sun-hours-direct-legend-status" role="status" data-sun-hours-calculating>
          <p className="sun-hours-direct-legend-status-copy">{sunHoursCalculatingLabel(pendingResolution)}</p>
          <SunHoursCalculatingMeter progress={progress} reducedMotion={reducedMotion} />
        </div>
      ) : null}
    </div>
  );
}
