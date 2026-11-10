import { memo, useMemo } from "react";
import { getColour } from "../lib/colours";
import { sunHoursLostColourKey } from "../lib/sunHoursLost";
import type { SunHoursLostGrid } from "../lib/sunHoursLostPlan";

export const SunHoursLostPlanOverlay = memo(function SunHoursLostPlanOverlay({ grid }: { grid: SunHoursLostGrid }) {
  const cells = useMemo(() => {
    const out: { key: string; east: number; north: number; hours: number; fill: string }[] = [];
    const { cellM, originEast, originNorth, cols, rows, lossHours } = grid;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const hours = lossHours[row * cols + col]!;
        const colourKey = sunHoursLostColourKey(hours);
        if (!colourKey) continue;
        const east = originEast + col * cellM;
        const north = originNorth + row * cellM;
        out.push({
          key: `${row}-${col}`,
          east,
          north,
          hours,
          fill: getColour(colourKey),
        });
      }
    }
    return out;
  }, [grid]);

  if (cells.length === 0) return null;

  return (
    <g className="sun-hours-lost-heatmap" aria-hidden data-sun-hours-lost-overlay>
      {cells.map((cell) => (
        <rect
          key={cell.key}
          data-sun-hours-lost
          data-sun-hours-lost-hours={cell.hours.toFixed(2)}
          x={cell.east}
          y={-(cell.north + grid.cellM)}
          width={grid.cellM}
          height={grid.cellM}
          fill={cell.fill}
          fillOpacity={0.82}
          stroke="none"
        />
      ))}
    </g>
  );
});
