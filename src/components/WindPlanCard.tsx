import { getColour, type ColourKey } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { COMFORT_CLASSES, COMFORT_CLASS_LABELS, unsafeAreasLabel, type ComfortClass } from "../lib/windComfort";
import { windPlanLegendGradient, windPlanSpeedTicks } from "../lib/windPlanField";
import { monthPeriodLabel, sectorCenterDeg, sectorLabel, type WindPeriodId } from "../lib/windRose";
import type { DesignWind } from "../lib/windDesignWinds";
import type { WindPlanState } from "./useWindPlan";

const SEASON_SHORT: Record<string, string> = {
  annual: "Annual",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
  spring: "Spring",
};

export function windPlanSeasonLabel(period: WindPeriodId): string {
  if (period.startsWith("month-")) return monthPeriodLabel(Number(period.slice("month-".length)));
  return SEASON_SHORT[period] ?? period;
}

export function designWindValue(wind: DesignWind): string {
  return `${wind.label} · ${Math.round(wind.sharePct)}% of hours`;
}

export function windPlanTitle(plan: Pick<WindPlanState, "mode">): string {
  return plan.mode === "comfort" ? "Pedestrian comfort" : "Plan wind";
}

export function windPlanDirectionValue(plan: Pick<WindPlanState, "mode" | "sector" | "dirLabel">): string {
  if (plan.mode !== "speed" || plan.sector == null) return plan.dirLabel;
  return `${sectorLabel(plan.sector)} · ${sectorCenterDeg(plan.sector)}°`;
}

export function WindPlanRows({ plan, period }: { plan: WindPlanState; period: WindPeriodId }) {
  const speedMode = plan.mode === "speed";
  const design = speedMode ? plan.designWind : null;
  return (
    <div className="wind-plan-rows" aria-label={windPlanTitle(plan)}>
      <p className="wind-plan-title">{windPlanTitle(plan)}</p>
      <dl className="wind-plan-list">
        <div className="wind-plan-row">
          <dt>{design ? "Design wind" : "Season"}</dt>
          <dd>{design ? designWindValue(design) : windPlanSeasonLabel(period)}</dd>
        </div>
        <div className="wind-plan-row">
          <dt>Direction</dt>
          <dd className={speedMode ? "wind-plan-dir mono" : undefined}>{windPlanDirectionValue(plan)}</dd>
        </div>
        <div className="wind-plan-row">
          <dt>{speedMode ? "Reference" : "Criteria"}</dt>
          <dd className={speedMode ? "mono" : undefined}>
            {speedMode ? windPlanReferenceLabel(plan.referenceMs) : "Lawson"}
          </dd>
        </div>
      </dl>
      <p className="wind-plan-note">Indicative only, not a CFD study</p>
      {plan.designWind && !speedMode ? <p className="wind-plan-note">Comfort uses all winds (annual)</p> : null}
      {!plan.hasData ? (
        <p className="wind-plan-note">No wind records for this season.</p>
      ) : speedMode && plan.referenceMs == null ? (
        <p className="wind-plan-note">No wind from {plan.dirLabel} this season.</p>
      ) : !plan.ready ? (
        <p className="wind-plan-note" role="status">
          Computing…
        </p>
      ) : !speedMode && plan.comfort ? (
        <p className={plan.comfort.unsafeAreas.length > 0 ? "wind-plan-unsafe is-flagged" : "wind-plan-unsafe"}>
          {unsafeAreasLabel(plan.comfort.unsafeAreas.length)}
        </p>
      ) : null}
    </div>
  );
}

export const COMFORT_SWATCH: Record<ComfortClass, ColourKey> = {
  sitting: "--wind-plan-sitting",
  standing: "--wind-plan-standing",
  strolling: "--wind-plan-strolling",
  walking: "--wind-plan-walking",
  uncomfortable: "--wind-plan-uncomfortable",
};

export function WindPlanLegend({ plan }: { plan: Pick<WindPlanState, "mode" | "scaleMaxMs"> }) {
  if (plan.mode === "speed") return <WindPlanVelocityLegend scaleMaxMs={plan.scaleMaxMs} />;
  return <WindPlanComfortSwatches />;
}

export function WindPlanComfortSwatches() {
  return (
    <div className="wind-plan-legend wind-plan-comfort-legend" aria-label="Pedestrian comfort, Lawson">
      <p className="wind-plan-legend-title">Comfort</p>
      <ul className="wind-plan-swatches">
        {COMFORT_CLASSES.map((cls) => (
          <li key={cls}>
            <span className="wind-plan-swatch" aria-hidden="true" style={{ background: `var(${COMFORT_SWATCH[cls]})` }} />
            {COMFORT_CLASS_LABELS[cls]}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function windPlanReferenceLabel(referenceMs: number | null): string {
  return referenceMs != null ? `${referenceMs.toFixed(1)} m/s` : "—";
}

export function WindPlanVelocityLegend({ scaleMaxMs }: { scaleMaxMs: number | null }) {
  useColourRevision();
  return (
    <div className="wind-plan-legend wind-plan-velocity" aria-label="Wind speed, metres per second">
      <p className="wind-plan-legend-title">
        Velocity <span className="wind-plan-unit">(m/s)</span>
      </p>
      <span className="wind-plan-velocity-bar" aria-hidden="true" style={{ background: windPlanLegendGradient(getColour, scaleMaxMs ?? undefined) }} />
      <span className="wind-plan-velocity-ticks mono" aria-hidden="true">
        {scaleMaxMs != null
          ? windPlanSpeedTicks(scaleMaxMs).map((tick) => {
              const pct = (tick / scaleMaxMs) * 100;
              return (
                <span key={tick} style={{ left: `${pct}%`, transform: `translateX(-${pct}%)` }}>
                  {tick}
                </span>
              );
            })
          : null}
      </span>
    </div>
  );
}
