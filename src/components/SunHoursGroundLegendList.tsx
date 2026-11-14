import { useMemo } from "react";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { SUN_HOURS_GROUND_CELL_M } from "../lib/sunHoursGround";

export const SUN_HOURS_DIRECT_LEGEND_DOCK_TICKS = 5;

function legendTicks(maxHours: number, count = 11, decimals = 2): string[] {
  if (!(maxHours > 0)) return ["0"];
  if (count <= 1) return [maxHours.toFixed(decimals)];
  return Array.from({ length: count }, (_, index) => {
    const value = (maxHours * index) / (count - 1);
    return value.toFixed(decimals);
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
  const ticks = useMemo(() => legendTicks(maxHours, tickCount, tickDecimals), [maxHours, tickCount, tickDecimals]);
  const gradient = `linear-gradient(to top, ${getColour("--sun-hours-direct-0")}, ${getColour("--sun-hours-direct-30")}, ${getColour("--sun-hours-direct-50")}, ${getColour("--sun-hours-direct-70")}, ${getColour("--sun-hours-direct-max")})`;
  return (
    <div
      className={compact ? "sun-hours-direct-legend is-compact" : "sun-hours-direct-legend"}
      aria-label="Direct Sun Hours legend"
      data-sun-hours-ground-legend
      data-sun-hours-direct-legend
    >
      <p className="sun-hours-direct-legend-title">Direct Sun Hours</p>
      <div className="sun-hours-direct-legend-body">
        <span className="sun-hours-direct-legend-unit">hours</span>
        <div className="sun-hours-direct-legend-bar" style={{ background: gradient }} aria-hidden />
        <ol className="sun-hours-direct-legend-ticks" aria-hidden>
          {[...ticks].reverse().map((tick) => (
            <li key={tick}>{tick}</li>
          ))}
        </ol>
      </div>
      <p className="field-note" data-sun-hours-ground-note>
        Full daylight · {SUN_HOURS_GROUND_CELL_M} m grid on ground, roofs, and walls.
        {pending ? " Computing…" : ""}
      </p>
    </div>
  );
}
