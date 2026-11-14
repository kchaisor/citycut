import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import type { WindPeriodStats } from "../lib/windRose";
import {
  DEFAULT_WIND_ROSE_LAYOUT,
  WIND_ROSE_FREQUENCY_GUIDES,
  windRoseCardinalPositions,
  windRoseGuideLabelPositions,
  windRoseStackedWedges,
} from "../lib/windRoseChart";

export function WindRoseSvgChart({
  stats,
  hubFill,
  className,
}: {
  stats: WindPeriodStats;
  hubFill: string;
  className?: string;
}) {
  useColourRevision();
  const layout = DEFAULT_WIND_ROSE_LAYOUT;
  const wedges = windRoseStackedWedges(stats, layout);
  const cardinals = windRoseCardinalPositions(layout);
  const guides = windRoseGuideLabelPositions(layout);
  const ringStroke = getColour("--wind-rose-ring");
  const guideStroke = getColour("--wind-rose-guide");

  return (
    <svg viewBox="0 0 240 240" role="img" aria-hidden="true" className={className}>
      <circle
        cx={layout.cx}
        cy={layout.cy}
        r={layout.outerR}
        fill="none"
        stroke={ringStroke}
        strokeWidth={1}
      />
      {WIND_ROSE_FREQUENCY_GUIDES.map((frac) => (
        <circle
          key={frac}
          cx={layout.cx}
          cy={layout.cy}
          r={layout.petalMaxR * frac}
          fill="none"
          stroke={guideStroke}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      ))}
      {wedges.map((w, index) => (
        <path key={index} d={w.d} fill={w.fill} fillOpacity={0.95} />
      ))}
      <circle cx={layout.cx} cy={layout.cy} r={layout.hubR} fill={hubFill} />
      {guides.map((g) => (
        <text
          key={g.pct}
          x={g.x + 6}
          y={g.y - 4}
          fontSize={10}
          fill={guideStroke}
          fontFamily="var(--mono)"
        >
          {g.pct}%
        </text>
      ))}
      <text
        x={cardinals.n.x}
        y={cardinals.n.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={600}
        fill={getColour("--wind-rose-n-label")}
      >
        N
      </text>
      <text
        x={cardinals.e.x}
        y={cardinals.e.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={600}
        fill={getColour("--wind-rose-h-label")}
      >
        E
      </text>
      <text
        x={cardinals.s.x}
        y={cardinals.s.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={600}
        fill={getColour("--wind-rose-h-label")}
      >
        S
      </text>
      <text
        x={cardinals.w.x}
        y={cardinals.w.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={600}
        fill={getColour("--wind-rose-h-label")}
      >
        W
      </text>
    </svg>
  );
}