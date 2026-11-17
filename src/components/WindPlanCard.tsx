import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { COMFORT_CLASSES, COMFORT_CLASS_LABELS, unsafeAreasLabel } from "../lib/windComfort";
import { windPlanLegendGradient, windPlanSpeedTicks } from "../lib/windPlanField";
import { monthPeriodLabel, type WindPeriodId } from "../lib/windRose";
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
          <dd>
            {design ? (
              <span className="wind-plan-dir mono">{`${design.label} · ${design.headingDeg}°`}</span>
            ) : speedMode && plan.sector != null ? (
              <span className="wind-plan-stepper">
                <button type="button" aria-label="Previous wind direction" onClick={() => plan.stepSector(-1)}>
                  ‹
                </button>
                <span className="wind-plan-dir">{plan.dirLabel}</span>
                <button type="button" aria-label="Next wind direction" onClick={() => plan.stepSector(1)}>
                  ›
                </button>
              </span>
            ) : (
              plan.dirLabel
            )}
          </dd>
        </div>
        <div className="wind-plan-row">
          <dt>{speedMode ? "Reference" : "Criteria"}</dt>
          <dd className={speedMode ? "mono" : undefined}>
            {speedMode ? windPlanReferenceLabel(plan.referenceMs) : "Lawson"}
          </dd>
        </div>
      </dl>
      <p className="wind-plan-note">Indicative only, not a CFD study</p>
      {plan.overWater ? <p className="wind-plan-note">Faster over water (smoother surface)</p> : null}
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

const COMFORT_SWATCH: Record<(typeof COMFORT_CLASSES)[number], string> = {
  sitting: "--wind-plan-sitting",
  standing: "--wind-plan-standing",
  walking: "--wind-plan-walking",
  uncomfortable: "--wind-plan-uncomfortable",
  unsafe: "--wind-plan-unsafe",
};

export function WindPlanLegend({ plan }: { plan: Pick<WindPlanState, "mode" | "scaleMaxMs"> }) {
  if (plan.mode === "speed") return <WindPlanVelocityLegend scaleMaxMs={plan.scaleMaxMs} />;
  return (
    <div className="wind-plan-legend" aria-label="Pedestrian comfort, Lawson">
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

export function WindPlanInfo({ plan, period }: { plan: WindPlanState; period: WindPeriodId }) {
  const design = plan.mode === "speed" ? plan.designWind : null;
  return (
    <dl className="wind-plan-info hud-card" aria-label="Plan wind conditions">
      <div className="wind-plan-row">
        <dt>Wind speed</dt>
        <dd className="mono">{windPlanReferenceLabel(plan.referenceMs)}</dd>
      </div>
      <div className="wind-plan-row">
        <dt>Direction</dt>
        <dd>{plan.dirLabel}</dd>
      </div>
      <div className="wind-plan-row">
        <dt>{design ? "Design wind" : "Season"}</dt>
        <dd>{design ? `${design.label} · ${Math.round(design.sharePct)}%` : windPlanSeasonLabel(period)}</dd>
      </div>
    </dl>
  );
}

export function WindPlanVelocityLegend({ scaleMaxMs }: { scaleMaxMs: number | null }) {
  useColourRevision();
  return (
    <div className="wind-plan-legend wind-plan-velocity" aria-label="Wind speed, metres per second">
      <p className="wind-plan-legend-title">
        Velocity <span className="wind-plan-unit">(m/s)</span>
      </p>
      <span className="wind-plan-velocity-bar" aria-hidden="true" style={{ background: windPlanLegendGradient(getColour) }} />
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
