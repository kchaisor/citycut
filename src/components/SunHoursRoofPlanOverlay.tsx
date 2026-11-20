import type { SunHoursGroundRaster } from "../lib/sunHoursGroundRaster";

export function SunHoursRoofPlanOverlay({ raster }: { raster: SunHoursGroundRaster }) {
  return (
    <image
      className="sun-hours-roof-heatmap"
      aria-hidden
      data-sun-hours-roof-overlay
      data-sun-hours-roof-cell-count={raster.cellCount}
      href={raster.href}
      x={raster.east}
      y={-(raster.north + raster.heightM)}
      width={raster.widthM}
      height={raster.heightM}
      preserveAspectRatio="none"
    />
  );
}
