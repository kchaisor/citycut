import { useMemo } from "react";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import {
  analyzeWindPeriod,
  sectorCenterDeg,
  type WindPeriodId,
  type WindRoseTable,
  WIND_SECTOR_COUNT,
} from "../lib/windRose";
import { windRoseCaption } from "../lib/windRoseSvg";
import { WindReducedMotionNote } from "./WindReducedMotionNote";

export function WindRoseOverlay({
  table,
  period,
  className = "wind-rose-overlay",
  streaksPaused = false,
  animateAnyway = false,
  onAnimateAnyway,
}: {
  table: WindRoseTable;
  period: WindPeriodId;
  className?: string;
  streaksPaused?: boolean;
  animateAnyway?: boolean;
  onAnimateAnyway?: (value: boolean) => void;
}) {
  useColourRevision();
  const fill = getColour("--wind-rose");
  const stats = useMemo(() => analyzeWindPeriod(table, period), [table, period]);
  const caption = windRoseCaption(table, period);
  const maxFreq = Math.max(...stats.sectorFrequency, 0.001);

  const wedges = useMemo(() => {
    const items: { d: string; opacity: number }[] = [];
    const cx = 50;
    const cy = 50;
    const inner = 4;
    for (let sector = 0; sector < WIND_SECTOR_COUNT; sector++) {
      const freq = stats.sectorFrequency[sector] ?? 0;
      if (freq <= 0) continue;
      const outer = inner + (freq / maxFreq) * 42;
      const centre = sectorCenterDeg(sector);
      const half = 22.5 / 2;
      const start = ((centre - half - 90) * Math.PI) / 180;
      const end = ((centre + half - 90) * Math.PI) / 180;
      const x1 = cx + Math.cos(start) * inner;
      const y1 = cy + Math.sin(start) * inner;
      const x2 = cx + Math.cos(start) * outer;
      const y2 = cy + Math.sin(start) * outer;
      const x3 = cx + Math.cos(end) * outer;
      const y3 = cy + Math.sin(end) * outer;
      const x4 = cx + Math.cos(end) * inner;
      const y4 = cy + Math.sin(end) * inner;
      items.push({
        d: `M ${x1} ${y1} L ${x2} ${y2} A ${outer} ${outer} 0 0 1 ${x3} ${y3} L ${x4} ${y4} Z`,
        opacity: 0.35 + (freq / maxFreq) * 0.55,
      });
    }
    return items;
  }, [stats, maxFreq]);

  const fromDeg = sectorCenterDeg(stats.prevailingSector);
  const rad = ((fromDeg + 180 - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  return (
    <div className={className} aria-label={caption}>
      <svg viewBox="0 0 100 100" width={120} height={120} role="img" aria-hidden="true">
        <text x={50} y={11} textAnchor="middle" fontSize={9} fontWeight={600} fill={fill}>
          N
        </text>
        <circle cx={50} cy={52} r={42} fill="none" stroke={fill} strokeWidth={0.8} opacity={0.45} />
        {wedges.map((w, index) => (
          <path key={index} d={w.d} fill={fill} fillOpacity={w.opacity} />
        ))}
        {[0, 1, 2].map((i) => {
          const offset = (i - 1) * 6;
          const px = 50 + offset * -dy;
          const py = 52 + offset * dx;
          const len = 14 + i * 3;
          return (
            <line
              key={i}
              x1={px - dx * len * 0.35}
              y1={py - dy * len * 0.35}
              x2={px + dx * len}
              y2={py + dy * len}
              stroke={fill}
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <p className="wind-rose-caption">{caption}</p>
      {streaksPaused && onAnimateAnyway && (
        <WindReducedMotionNote animateAnyway={animateAnyway} onAnimateAnyway={onAnimateAnyway} />
      )}
    </div>
  );
}
