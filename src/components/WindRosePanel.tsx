import { useMemo } from "react";
import type { WindPeriodId } from "../lib/windRose";
import type { SiteWindSelection } from "../lib/windRoseData";
import { analyzeSiteWind } from "../lib/windRoseStats";
import { windRoseStationLines } from "../lib/windRoseCaptions";
import { windRoseSectorSharePct, windRoseSectorTip } from "../lib/windRoseChart";
import { getColour } from "../lib/colours";
import { WindNearbyStations } from "./WindSkippedCloser";
import { WindRoseSvgChart, type WindRosePicker } from "./WindRoseSvgChart";
import { WindPlanLegend, WindPlanRows, WindPlanVelocityLegend, windPlanSeasonLabel } from "./WindPlanCard";
import type { WindPlanState } from "./useWindPlan";

export function windRosePickerOn(
  plan: Pick<WindPlanState, "active" | "mode"> | null,
  flowHeading: boolean,
): boolean {
  if (!plan) return false;
  return plan.active ? plan.mode === "speed" : flowHeading;
}

export function WindRosePanel({
  selection,
  period,
  plan = null,
  flowHeading = false,
}: {
  selection: SiteWindSelection;
  period: WindPeriodId;
  plan?: WindPlanState | null;
  flowHeading?: boolean;
}) {
  const stats = useMemo(() => analyzeSiteWind(selection, period), [selection, period]);
  const lines = useMemo(() => windRoseStationLines(selection), [selection]);
  const pickerOn = windRosePickerOn(plan, flowHeading);
  const picker = useMemo<WindRosePicker | undefined>(() => {
    if (!plan || !pickerOn || !stats) return undefined;
    return {
      selected: plan.sector,
      onSelect: plan.selectSector,
      onStep: plan.stepSector,
      tip: (sector) => {
        const design = plan.designWind;
        if (design && design.sector === sector) return windRoseSectorTip(sector, design.sharePct, design.referenceMs);
        return windRoseSectorTip(
          sector,
          windRoseSectorSharePct(stats, sector),
          plan.sectorReferenceMs(sector),
          windPlanSeasonLabel(period),
        );
      },
    };
  }, [
    pickerOn,
    plan?.sector,
    plan?.selectSector,
    plan?.stepSector,
    plan?.sectorReferenceMs,
    plan?.designWind,
    stats,
    period,
  ]);

  if (!stats) {
    return <p className="field-note">Wind data is not available for this period.</p>;
  }

  if (plan?.active) {
    return (
      <div className="wind-rose-panel is-plan" aria-label={lines.line1}>
        <WindPlanRows plan={plan} period={period} />
        <WindRoseSvgChart
          stats={stats}
          hubFill={getColour("--wind-rose-card-surface")}
          className="wind-rose-panel-svg"
          picker={picker}
        />
        <WindRoseFootnote stationLine={lines.line1} />
        <WindNearbyStations selection={selection} className="wind-rose-meta" />
        <WindPlanLegend plan={plan} />
      </div>
    );
  }

  return (
    <div className="wind-rose-panel is-flow" aria-label={lines.line1}>
      <WindRoseSvgChart
        stats={stats}
        hubFill={getColour("--wind-rose-card-surface")}
        className="wind-rose-panel-svg"
        picker={picker}
      />
      <WindRoseFootnote stationLine={lines.line1} />
      <WindNearbyStations selection={selection} className="wind-rose-meta" />
      <WindPlanVelocityLegend scaleMaxMs={plan?.scaleMaxMs ?? null} />
    </div>
  );
}

export const WIND_ROSE_TMYX_URL = "https://climate.onebuilding.org/";

function WindRoseFootnote({ stationLine }: { stationLine: string }) {
  return (
    <p className="wind-rose-footnote">
      <span className="wind-rose-footnote-station" title={stationLine}>
        {stationLine}
      </span>
      <span>
        Regional station, not site wind ·{" "}
        <a href={WIND_ROSE_TMYX_URL} target="_blank" rel="noopener noreferrer">
          TMYx ↗
        </a>
      </span>
    </p>
  );
}
