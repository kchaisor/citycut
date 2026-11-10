import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { SUN_HOURS_LOST_LEGEND } from "../lib/sunHoursLost";

export function SunHoursLostLegendList({ compact = false }: { compact?: boolean }) {
  useColourRevision();
  return (
    <ul
      className={compact ? "sun-hours-lost-legend is-compact" : "sun-hours-lost-legend"}
      aria-label="Hours lost legend"
      data-sun-hours-lost-legend
    >
      {SUN_HOURS_LOST_LEGEND.map((entry) => (
        <li key={entry.key}>
          <svg className="solar-legend-swatch" viewBox="0 0 24 12" aria-hidden>
            <rect
              x="0"
              y="0"
              width="24"
              height="12"
              fill={getColour(entry.key)}
              fillOpacity={entry.key === "--sun-hours-lost-0" ? 0.35 : 0.9}
              stroke={entry.key === "--sun-hours-lost-0" ? getColour("--sun-compass-label") : "none"}
              strokeWidth="0.5"
            />
          </svg>
          {entry.label} h
        </li>
      ))}
    </ul>
  );
}
