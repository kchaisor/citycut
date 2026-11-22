import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { WindRosePanel } from "../WindRosePanel";
import { WindStreaksSlider } from "../WindStreaksSlider";
import { PrevailingStreamsLegend } from "../PrevailingStreamsLegend";
import { windPlanSeasonLabel } from "../WindPlanCard";
import { windRoseCardAutoCollapsed, windRoseCardMeta, windRoseCardOn, windStreaksSliderOn } from "./windRoseCard";
import type { ModelPageViewModel } from "./useModelPage";

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 0 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export function WindRoseHudCard({ vm }: { vm: ModelPageViewModel }) {
  const { analyses, rightOpen, siteWind, tab, windMotion, windPlan, windSettings, windStreams, windStreaksOn } = vm;
  const autoCollapsed = windRoseCardAutoCollapsed(rightOpen, useViewportWidth());
  const [collapsed, setCollapsed] = useState(autoCollapsed);
  const bodyId = useId();
  useEffect(() => setCollapsed(autoCollapsed), [autoCollapsed]);
  if (!windRoseCardOn({ tab, analyses, siteWind }) || !siteWind) return null;
  const flowing = tab === "3d" && windSettings.enabled;
  const sliderOn = windStreaksSliderOn({ tab, analyses, windEnabled: windSettings.enabled, planActive: windPlan.active });
  const classes = ["wind-rose-analysis-card", "hud-card"];
  if (windPlan.active) classes.splice(1, 0, "is-plan");
  if (collapsed) classes.push("is-collapsed");
  return (
    <div className={classes.join(" ")} aria-label="Wind rose panel">
      <button
        type="button"
        className="wind-rose-card-head"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="card-title">Wind Rose</span>
        <span className="wind-rose-card-head-end">
          <span className="card-meta mono">
            {windRoseCardMeta(windPlanSeasonLabel(windSettings.period), siteWind.station.years)}
          </span>
          <ChevronDown className="wind-rose-card-chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </button>
      <div id={bodyId} className="wind-rose-card-fold" hidden={collapsed}>
        <div className="wind-rose-card-body">
          <WindRosePanel selection={siteWind} period={windSettings.period} plan={windPlan} flowHeading={flowing} />
          {tab === "3d" && !windPlan.active ? (
            <PrevailingStreamsLegend
              streams={windStreams}
              periodLabel={vm.designWind ? `Design ${vm.designWind.label}` : windPlanSeasonLabel(windSettings.period)}
              muted={!windStreaksOn}
            />
          ) : null}
        </div>
        {sliderOn ? (
          <WindStreaksSlider
            reducedMotion={
              flowing && windMotion.streaksPaused
                ? { animateAnyway: windMotion.animateAnyway, onAnimateAnyway: windMotion.setAnimateAnyway }
                : null
            }
          />
        ) : null}
      </div>
    </div>
  );
}
