import { WindRosePanel } from "../WindRosePanel";
import { WindStreaksSlider } from "../WindStreaksSlider";
import { windRoseCardOn, windStreaksSliderOn } from "./windRoseCard";
import type { ModelPageViewModel } from "./useModelPage";

export function WindRoseHudCard({ vm }: { vm: ModelPageViewModel }) {
  const { analysisKind, siteWind, tab, windMotion, windPlan, windSettings } = vm;
  if (!windRoseCardOn({ tab, analysisKind, siteWind }) || !siteWind) return null;
  const flowing = tab === "3d" && windSettings.enabled;
  return (
    <div
      className={windPlan.active ? "wind-rose-analysis-card is-plan hud-card" : "wind-rose-analysis-card hud-card"}
      aria-label="Wind rose panel"
    >
      <div className="wind-rose-card-body">
        <WindRosePanel
          selection={siteWind}
          period={windSettings.period}
          plan={windPlan}
          flowHeading={flowing}
          reducedMotion={
            flowing && windMotion.streaksPaused
              ? { animateAnyway: windMotion.animateAnyway, onAnimateAnyway: windMotion.setAnimateAnyway }
              : null
          }
        />
      </div>
      {windStreaksSliderOn({ tab, analysisKind, windEnabled: windSettings.enabled, planActive: windPlan.active }) ? (
        <WindStreaksSlider />
      ) : null}
    </div>
  );
}
