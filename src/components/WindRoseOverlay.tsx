import { useMemo } from "react";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { type WindPeriodId } from "../lib/windRose";
import type { SiteWindSelection } from "../lib/windRoseData";
import { analyzeSiteWind } from "../lib/windRoseStats";
import { windRoseArrowLines, windRoseStackedWedges, windRoseStationCaption } from "../lib/windRoseSvg";
import { WindReducedMotionNote } from "./WindReducedMotionNote";

export function WindRoseOverlay({
  selection,
  period,
  className = "wind-rose-overlay",
  streaksPaused = false,
  animateAnyway = false,
  onAnimateAnyway,
}: {
  selection: SiteWindSelection;
  period: WindPeriodId;
  className?: string;
  streaksPaused?: boolean;
  animateAnyway?: boolean;
  onAnimateAnyway?: (value: boolean) => void;
}) {
  useColourRevision();
  const stroke = getColour("--wind-rose");
  const stats = useMemo(() => analyzeSiteWind(selection, period), [selection, period]);
  const caption = useMemo(() => windRoseStationCaption(selection, period), [selection, period]);
  const wedges = useMemo(() => (stats ? windRoseStackedWedges(stats, 50, 52, 4, 46) : []), [stats]);
  const arrows = useMemo(() => (stats ? windRoseArrowLines(stats, 3, 50, 52, 14) : []), [stats]);

  if (!stats) return null;

  return (
    <div className={className} aria-label={caption}>
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
        <text x={50} y={11} textAnchor="middle" fontSize={9} fontWeight={600} fill={stroke}>
          N
        </text>
        <circle cx={50} cy={52} r={42} fill="none" stroke={stroke} strokeWidth={0.8} opacity={0.45} />
        {wedges.map((w, index) => (
          <path key={index} d={w.d} fill={w.fill} fillOpacity={w.opacity} />
        ))}
        {arrows.map((a, i) => (
          <line
            key={i}
            x1={a.x1}
            y1={a.y1}
            x2={a.x2}
            y2={a.y2}
            stroke={stroke}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        ))}
        <text x={50} y={54} textAnchor="middle" fontSize={10} fontWeight={700} fill={stroke}>
          {stats.calmPercent.toFixed(0)}%
        </text>
      </svg>
      <p className="wind-rose-caption">{caption}</p>
      <p className="wind-rose-caption wind-rose-meta-note">Regional station wind, not site wind.</p>
      {streaksPaused && onAnimateAnyway && (
        <WindReducedMotionNote animateAnyway={animateAnyway} onAnimateAnyway={onAnimateAnyway} />
      )}
    </div>
  );
}