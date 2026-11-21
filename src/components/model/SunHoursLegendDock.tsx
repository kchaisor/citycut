import { SunHoursGroundLegendList } from "../SunHoursGroundLegendList";
import type { useSunHoursGround } from "../useSunHoursGround";

export function SunHoursLegendDock({
  stackClassName,
  sunHoursGround,
}: {
  stackClassName: "sun-hours-direct-dock-stack" | "plan-solar-dock-stack";
  sunHoursGround: ReturnType<typeof useSunHoursGround>;
}) {
  const { grid, resolution, targetResolution } = sunHoursGround;
  const pending = sunHoursGround.pending || sunHoursGround.pendingSurfaces;
  if (!grid && !pending) return null;
  return (
    <div className={stackClassName}>
      <div className="plan-solar-legend-dock hud-card" data-sun-hours-ground-legend-dock>
        <SunHoursGroundLegendList
          compact
          maxHours={sunHoursGround.scaleMaxHours || (grid?.maxSunHours ?? 0)}
          resolution={grid ? resolution : null}
          pending={pending}
          pendingResolution={targetResolution}
        />
      </div>
    </div>
  );
}
