import { memo, useMemo } from "react";
import { rasterizeSunHoursLostGrid } from "../lib/sunHoursLostRaster";
import type { SunHoursLostGrid } from "../lib/sunHoursLostPlan";

export const SunHoursLostPlanOverlay = memo(function SunHoursLostPlanOverlay({ grid }: { grid: SunHoursLostGrid }) {
  const raster = useMemo(() => rasterizeSunHoursLostGrid(grid), [grid]);

  if (!raster || raster.cellCount === 0) return null;

  return (
    <image
      className="sun-hours-lost-heatmap"
      aria-hidden
      data-sun-hours-lost-overlay
      data-sun-hours-lost-cell-count={raster.cellCount}
      href={raster.href}
      x={raster.east}
      y={-(raster.north + raster.heightM)}
      width={raster.widthM}
      height={raster.heightM}
      preserveAspectRatio="none"
    />
  );
});
