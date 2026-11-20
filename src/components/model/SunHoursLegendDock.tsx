import { SunHoursGroundLegendList } from "../SunHoursGroundLegendList";
import type { useSunHoursGround } from "../useSunHoursGround";

export function SunHoursLegendDock({
  stackClassName,
  sunHoursGround,
}: {
  stackClassName: "sun-hours-direct-dock-stack" | "plan-solar-dock-stack";
  sunHoursGround: ReturnType<typeof useSunHoursGround>;
}) {
  const grid = sunHoursGround.grid;
  if (!grid) return null;
  return (
    <div className={stackClassName}>
      <div className="plan-solar-legend-dock hud-card" data-sun-hours-ground-legend-dock>
        <SunHoursGroundLegendList
          compact
          maxHours={sunHoursGround.scaleMaxHours || grid.maxSunHours}
          pending={sunHoursGround.pending || sunHoursGround.pendingSurfaces}
        />
      </div>
    </div>
  );
}
