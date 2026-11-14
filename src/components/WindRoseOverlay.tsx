import { useMemo } from "react";
import { type WindPeriodId } from "../lib/windRose";
import type { SiteWindSelection } from "../lib/windRoseData";
import { analyzeSiteWind } from "../lib/windRoseStats";
import { windRoseStationLines } from "../lib/windRoseCaptions";
import { getColour } from "../lib/colours";
import { WindRoseSvgChart } from "./WindRoseSvgChart";
import { WindReducedMotionNote } from "./WindReducedMotionNote";

export function WindRoseOverlay({
  selection,
  period,
  className = "wind-rose-overlay",
  streaksPaused = false,
  animateAnyway = false,
  onAnimateAnyway,
}: {
  selection: SiteWindSelection;
  period: WindPeriodId;
  className?: string;
  streaksPaused?: boolean;
  animateAnyway?: boolean;
  onAnimateAnyway?: (value: boolean) => void;
}) {
  const stats = useMemo(() => analyzeSiteWind(selection, period), [selection, period]);
  const lines = useMemo(() => windRoseStationLines(selection), [selection]);

  if (!stats) return null;

  return (
    <div className={className} aria-label={lines.line1}>
      <WindRoseSvgChart stats={stats} hubFill={getColour("--wind-rose-card-surface")} />
      <p className="wind-rose-caption">{lines.line1}</p>
      <p className="wind-rose-caption wind-rose-meta-note">Regional station wind, not site wind.</p>
      {streaksPaused && onAnimateAnyway && (
        <WindReducedMotionNote animateAnyway={animateAnyway} onAnimateAnyway={onAnimateAnyway} />
      )}
    </div>
  );
}