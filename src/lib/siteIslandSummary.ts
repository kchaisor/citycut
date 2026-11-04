import type { SiteAnalysisKind } from "./sidebarSections";
import type { WalkPlaybackSnapshot } from "./walkPlayback";
import { WIND_PERIOD_LABELS, type WindPeriodId } from "./windRose";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type SiteIslandSummaryInput = {
  kind: SiteAnalysisKind;
  solar?: {
    month: number;
    day: number;
    hour: number;
    minute: number;
    shadePercent: number | null;
  };
  wind?: {
    period: WindPeriodId;
    prevailingLabel: string | null;
    prevailingMedianKmh: number | null;
  };
  view?: {
    walkAt: WalkPlaybackSnapshot;
  };
  walkRipple?: {
    minutes: number;
    hasTimes: boolean;
  };
};

export function formatSiteIslandSummary(input: SiteIslandSummaryInput): string {
  if (input.kind === "solar" && input.solar) {
    const { month, day, hour, minute, shadePercent } = input.solar;
    const mon = MONTHS[(month - 1) % 12] ?? "Jun";
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const shade =
      shadePercent !== null ? ` · ${shadePercent}% shade` : "";
    return `${mon} ${day} ${time}${shade}`;
  }
  if (input.kind === "wind" && input.wind) {
    const period =
      input.wind.period in WIND_PERIOD_LABELS
        ? WIND_PERIOD_LABELS[input.wind.period as keyof typeof WIND_PERIOD_LABELS]
        : "Annual";
    const parts = [period];
    if (input.wind.prevailingLabel) parts.push(input.wind.prevailingLabel);
    if (input.wind.prevailingMedianKmh !== null) {
      parts.push(`${Math.round(input.wind.prevailingMedianKmh)} km/h`);
    }
    return parts.join(" · ");
  }
  if (input.kind === "view" && input.view) {
    const pct = input.view.walkAt.visiblePercent;
    if (pct !== null) return `Viewshed ${Math.round(pct)}% visible`;
    return "Viewshed walk";
  }
  if (input.kind === "walkRipple" && input.walkRipple) {
    if (!input.walkRipple.hasTimes) return "Walk ripple";
    const rounded = Math.round(input.walkRipple.minutes * 10) / 10;
    const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `Walk ${label} min`;
  }
  return "";
}
