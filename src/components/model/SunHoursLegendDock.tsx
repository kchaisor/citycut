import { SunHoursGroundLegendList } from "../SunHoursGroundLegendList";
import type { useSunHoursGround } from "../useSunHoursGround";

export function SunHoursLegendDock({ sunHoursGround }: { sunHoursGround: ReturnType<typeof useSunHoursGround> }) {
  const { grid, resolution, targetResolution } = sunHoursGround;
  const pending = sunHoursGround.pending || sunHoursGround.pendingSurfaces;
  if (!grid && !pending) return null;
  return (
    <div className="sun-hours-hud-card hud-card" aria-label="Direct Sun Hours panel" data-sun-hours-ground-legend-dock>
      <SunHoursGroundLegendList
        compact
        maxHours={sunHoursGround.scaleMaxHours || (grid?.maxSunHours ?? 0)}
        resolution={grid ? resolution : null}
        pending={pending}
        pendingResolution={targetResolution}
      />
    </div>
  );
}
