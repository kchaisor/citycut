import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { COMFORT_CLASSES, COMFORT_CLASS_LABELS, unsafeAreasLabel } from "../lib/windComfort";
import { WIND_PLAN_SPEED_MAX_MS, WIND_PLAN_SPEED_TICKS_MS, windPlanLegendGradient } from "../lib/windPlanField";
import { monthPeriodLabel, type WindPeriodId } from "../lib/windRose";
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

export function windPlanTitle(plan: Pick<WindPlanState, "mode">): string {
  return plan.mode === "comfort" ? "Pedestrian comfort" : "Plan wind";
}

export function WindPlanRows({ plan, period }: { plan: WindPlanState; period: WindPeriodId }) {
  const speedMode = plan.mode === "speed";
  return (
    <div className="wind-plan-rows" aria-label={windPlanTitle(plan)}>
      <p className="wind-plan-title">{windPlanTitle(plan)}</p>
      <dl className="wind-plan-list">
        <div className="wind-plan-row">
          <dt>Season</dt>
          <dd>{windPlanSeasonLabel(period)}</dd>
        </div>
        <div className="wind-plan-row">
          <dt>Direction</dt>
          <dd>
            {speedMode && plan.sector != null ? (
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

export function WindPlanLegend({ plan }: { plan: Pick<WindPlanState, "mode"> }) {
  if (plan.mode === "speed") return null;
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
        <dt>Season</dt>
        <dd>{windPlanSeasonLabel(period)}</dd>
      </div>
    </dl>
  );
}

export function WindPlanVelocityLegend() {
  useColourRevision();
  return (
    <div className="wind-plan-velocity hud-card" aria-label="Wind speed, metres per second">
      <p className="wind-plan-legend-title">
        Velocity <span className="wind-plan-unit">(m/s)</span>
      </p>
      <div className="wind-plan-velocity-scale">
        <span className="wind-plan-velocity-bar" aria-hidden="true" style={{ background: windPlanLegendGradient(getColour) }} />
        <span className="wind-plan-velocity-ticks mono" aria-hidden="true">
          {WIND_PLAN_SPEED_TICKS_MS.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / WIND_PLAN_SPEED_MAX_MS) * 100}%` }}>
              {tick}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
