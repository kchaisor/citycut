import { getColour } from "../lib/colours";
import { SUN_HOURS_LOST_LEGEND } from "../lib/sunHoursLost";
import type { PlanViewport } from "../lib/planViewport";

export function SunHoursLostPlanLegend({ view }: { view: PlanViewport }) {
  const pad = view.w * 0.018;
  const rowH = view.h * 0.032;
  const swatch = view.w * 0.036;
  const labelX = view.x + pad + swatch + view.w * 0.012;
  const fontSize = view.h * 0.026;
  const totalH = SUN_HOURS_LOST_LEGEND.length * rowH;
  const baseY = view.y + view.h - pad - totalH;

  return (
    <g className="sun-hours-lost-plan-legend" aria-label="Hours lost legend" data-sun-hours-lost-legend>
      <rect
        x={view.x + pad - view.w * 0.008}
        y={baseY - view.h * 0.01}
        width={view.w * 0.2}
        height={totalH + view.h * 0.02}
        fill={getColour("--sheet-fill")}
        fillOpacity={0.88}
        rx={view.w * 0.006}
        stroke={getColour("--sun-compass-label")}
        strokeWidth={view.w * 0.0012}
        vectorEffect="non-scaling-stroke"
      />
      {SUN_HOURS_LOST_LEGEND.map((entry, index) => {
        const y = baseY + index * rowH;
        return (
          <g key={entry.key}>
            <rect
              x={view.x + pad}
              y={y}
              width={swatch}
              height={rowH * 0.72}
              fill={getColour(entry.key)}
              fillOpacity={entry.key === "--sun-hours-lost-0" ? 0.35 : 0.92}
              stroke={entry.key === "--sun-hours-lost-0" ? getColour("--sun-compass-label") : "none"}
              strokeWidth={view.w * 0.0008}
            />
            <text
              x={labelX}
              y={y + rowH * 0.55}
              fill={getColour("--sun-compass-label")}
              fontSize={fontSize}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {entry.label} h
            </text>
          </g>
        );
      })}
    </g>
  );
}
