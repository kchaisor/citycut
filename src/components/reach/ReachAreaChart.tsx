import { getColour } from "../../lib/colours";
import type { ReachMinuteSeries } from "../../lib/reach/types";

export function ReachAreaChart({ series, budgetMin }: { series: ReachMinuteSeries; budgetMin: number }) {
  const walkFill = getColour("--reach-walk-fill");
  const transitFill = getColour("--reach-transit-fill");
  const axis = getColour("--reach-panel-muted");
  const width = 280;
  const height = 120;
  const pad = { l: 28, r: 8, t: 8, b: 22 };
  const maxY = Math.max(...series.transitExtraKm2, 1);
  const maxX = series.minutes[series.minutes.length - 1] ?? 30;
  const x = (m: number) => pad.l + ((width - pad.l - pad.r) * m) / maxX;
  const y = (km2: number) => height - pad.b - ((height - pad.t - pad.b) * km2) / maxY;
  const walkPoints = series.minutes.map((m, i) => `${x(m)},${y(series.walkCumulativeKm2[i]!)}`).join(" ");
  const transitTop = series.minutes.map((m, i) => `${x(m)},${y(series.transitExtraKm2[i]!)}`).join(" ");
  const transitBase = series.minutes
    .slice()
    .reverse()
    .map((m, rev) => {
      const i = series.minutes.length - 1 - rev;
      return `${x(m)},${y(series.walkCumulativeKm2[i]!)}`;
    })
    .join(" ");
  const budgetX = x(budgetMin);
  return (
    <svg className="reach-area-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Area reached by minute">
      <line x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} stroke={axis} strokeWidth="1" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={height - pad.b} stroke={axis} strokeWidth="1" />
      <polygon points={`${walkPoints} ${transitBase}`} fill={transitFill} fillOpacity="0.35" />
      <polyline points={transitTop} fill="none" stroke={transitFill} strokeWidth="1.5" />
      <polyline points={walkPoints} fill="none" stroke={walkFill} strokeWidth="2" />
      <line
        x1={budgetX}
        y1={pad.t}
        x2={budgetX}
        y2={height - pad.b}
        stroke={axis}
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text x={budgetX + 2} y={pad.t + 10} className="reach-chart-tag mono" fill={axis}>
        {budgetMin} min
      </text>
    </svg>
  );
}
