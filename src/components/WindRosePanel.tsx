import { useMemo } from "react";
import type { WindPeriodId } from "../lib/windRose";
import type { SiteWindSelection } from "../lib/windRoseData";
import { formatCalmPercent, windRoseCalmCaption } from "../lib/windBins";
import { analyzeSiteWind } from "../lib/windRoseStats";
import { windRoseStationLines } from "../lib/windRoseCaptions";
import { windRoseSectorSharePct, windRoseSectorTip } from "../lib/windRoseChart";
import { getColour } from "../lib/colours";
import { WindSkippedCloser } from "./WindSkippedCloser";
import { WindRoseSvgChart, type WindRosePicker } from "./WindRoseSvgChart";
import { WindRoseSpeedLegend } from "./WindRoseSpeedLegend";
import { GroundWindSpeedLegend } from "./GroundWindSpeedLegend";
import { WindPlanLegend, WindPlanRows } from "./WindPlanCard";
import type { WindPlanState } from "./useWindPlan";

export function WindRosePanel({
  selection,
  period,
  showGroundWindLegend = false,
  plan = null,
}: {
  selection: SiteWindSelection;
  period: WindPeriodId;
  showGroundWindLegend?: boolean;
  plan?: WindPlanState | null;
}) {
  const stats = useMemo(() => analyzeSiteWind(selection, period), [selection, period]);
  const lines = useMemo(() => windRoseStationLines(selection), [selection]);
  const calmCaption = useMemo(
    () => (stats ? windRoseCalmCaption(stats.calmPercent) : ""),
    [stats],
  );
  const regionalNote = "Regional station wind, not site wind.";
  const picker = useMemo<WindRosePicker | undefined>(() => {
    if (!plan?.active || plan.mode !== "speed" || !stats) return undefined;
    return {
      selected: plan.sector,
      onSelect: plan.selectSector,
      onStep: plan.stepSector,
      tip: (sector) => windRoseSectorTip(sector, windRoseSectorSharePct(stats, sector), plan.sectorReferenceMs(sector)),
    };
  }, [plan?.active, plan?.mode, plan?.sector, plan?.selectSector, plan?.stepSector, plan?.sectorReferenceMs, stats]);

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
        <p className="wind-rose-calm-caption">{calmCaption}</p>
        <p className="wind-rose-meta wind-rose-meta-source wind-rose-meta-station" title={lines.line1}>
          {lines.line1}
        </p>
        <WindSkippedCloser selection={selection} className="wind-rose-meta" />
        <p className="wind-rose-meta wind-rose-meta-note">Regional station wind</p>
        <WindPlanLegend plan={plan} />
      </div>
    );
  }

  return (
    <div className="wind-rose-panel" aria-label={lines.line1}>
      <WindRoseSvgChart
        stats={stats}
        hubFill={getColour("--wind-rose-card-surface")}
        className="wind-rose-panel-svg"
      />
      <p className="wind-rose-calm-caption">{calmCaption}</p>
      <WindRoseSpeedLegend />
      {showGroundWindLegend && <GroundWindSpeedLegend />}
      <p className="wind-rose-meta wind-rose-meta-station" title={lines.line1}>
        {lines.line1}
      </p>
      <WindSkippedCloser selection={selection} className="wind-rose-meta" />
      <p className="wind-rose-meta wind-rose-meta-source">{lines.line2}</p>
      <p className="wind-rose-meta wind-rose-meta-note">{regionalNote}</p>
    </div>
  );
}

export function windRosePanelCalmText(calmPct: number): string {
  return `Calm ${formatCalmPercent(calmPct)}`;
}