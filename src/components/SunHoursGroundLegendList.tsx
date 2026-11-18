import { useMemo } from "react";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { SUN_HOURS_GROUND_CELL_M } from "../lib/sunHoursGround";

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

export function SunHoursGroundLegendList({
  maxHours,
  compact = false,
  pending = false,
}: {
  maxHours: number;
  compact?: boolean;
  pending?: boolean;
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
  const dockFootnote = `${SUN_HOURS_GROUND_CELL_M} m grid · ground, roofs, walls · full daylight`;
  const sidebarFootnote = `Full daylight · ${SUN_HOURS_GROUND_CELL_M} m grid on ground, roofs, and walls.`;
  return (
    <div
      className={compact ? "sun-hours-direct-legend is-compact" : "sun-hours-direct-legend"}
      aria-label="Direct Sun Hours legend"
      data-sun-hours-ground-legend
      data-sun-hours-direct-legend
    >
      <p className="sun-hours-direct-legend-title">Direct Sun Hours</p>
      {compact ? (
        <div className="sun-hours-direct-legend-scale">
          <div className="sun-hours-direct-legend-bar" style={{ background: gradient }} aria-hidden />
          <ol className="sun-hours-direct-legend-ticks" aria-hidden>
            {dockTicks.map((tick, index) => (
              <li key={index}>{tick}</li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="sun-hours-direct-legend-body">
          <span className="sun-hours-direct-legend-unit">hours</span>
          <div className="sun-hours-direct-legend-bar" style={{ background: gradient }} aria-hidden />
          <ol className="sun-hours-direct-legend-ticks" aria-hidden>
            {[...sidebarTicks].reverse().map((tick) => (
              <li key={tick}>{tick}</li>
            ))}
          </ol>
        </div>
      )}
      <p
        className={compact ? "sun-hours-direct-legend-footnote" : "field-note"}
        data-sun-hours-ground-note
      >
        {compact ? dockFootnote : sidebarFootnote}
        {pending ? " Computing…" : ""}
      </p>
    </div>
  );
}