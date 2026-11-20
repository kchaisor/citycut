import { useMemo } from "react";
import type { WindPeriodId } from "../lib/windRose";
import type { SiteWindSelection } from "../lib/windRoseData";
import { formatCalmPercent, windRoseCalmCaption } from "../lib/windBins";
import { analyzeSiteWind } from "../lib/windRoseStats";
import { windRoseStationLines } from "../lib/windRoseCaptions";
import { getColour } from "../lib/colours";
import { WindRoseSvgChart } from "./WindRoseSvgChart";
import { WindRoseSpeedLegend } from "./WindRoseSpeedLegend";
import { GroundWindSpeedLegend } from "./GroundWindSpeedLegend";
import { WindPlanRows } from "./WindPlanCard";
import type { WindPlanState } from "./useWindPlan";
import { readableWindStationName } from "../lib/windStationNames";

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

  if (!stats) {
    return <p className="field-note">Wind data is not available for this period.</p>;
  }

  if (plan?.active) {
    const station = readableWindStationName(selection.station.name, selection.station.id);
    return (
      <div className="wind-rose-panel is-plan" aria-label={lines.line1}>
        <WindPlanRows plan={plan} period={period} />
        <WindRoseSvgChart
          stats={stats}
          hubFill={getColour("--wind-rose-card-surface")}
          className="wind-rose-panel-svg"
        />
        <p className="wind-rose-calm-caption">{calmCaption}</p>
        <p className="wind-rose-meta wind-rose-meta-source">{station} · Regional station wind</p>
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
      <p className="wind-rose-meta">{lines.line1}</p>
      <p className="wind-rose-meta wind-rose-meta-source">{lines.line2}</p>
      <p className="wind-rose-meta wind-rose-meta-note">{regionalNote}</p>
    </div>
  );
}

export function windRosePanelCalmText(calmPct: number): string {
  return `Calm ${formatCalmPercent(calmPct)}`;
}