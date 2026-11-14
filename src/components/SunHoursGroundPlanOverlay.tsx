import { memo, useMemo } from "react";
import { rasterizeSunHoursGroundGrid } from "../lib/sunHoursGroundRaster";
import type { SunHoursGroundGrid } from "../lib/sunHoursGroundPlan";

export const SunHoursGroundPlanOverlay = memo(function SunHoursGroundPlanOverlay({
  grid,
  scaleMaxHours,
}: {
  grid: SunHoursGroundGrid;
  scaleMaxHours: number;
}) {
  const raster = useMemo(() => rasterizeSunHoursGroundGrid(grid, 0.86, scaleMaxHours), [grid, scaleMaxHours]);

  if (!raster || raster.cellCount === 0) return null;

  return (
    <image
      className="sun-hours-ground-heatmap"
      aria-hidden
      data-sun-hours-ground-overlay
      data-sun-hours-ground-cell-count={raster.cellCount}
      href={raster.href}
      x={raster.east}
      y={-(raster.north + raster.heightM)}
      width={raster.widthM}
      height={raster.heightM}
      preserveAspectRatio="none"
    />
  );
});
