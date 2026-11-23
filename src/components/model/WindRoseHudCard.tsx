import { WindRosePanel } from "../WindRosePanel";
import { WindStreaksSlider } from "../WindStreaksSlider";
import { PrevailingStreamsLegend } from "../PrevailingStreamsLegend";
import { DesignWindPresets } from "../DesignWindPresets";
import { windPlanSeasonLabel } from "../WindPlanCard";
import { analysisCardCollapsed, analysisStackTight } from "../../lib/analysisCards";
import { withDesignWind, withWindSeason } from "../../lib/windState";
import { AnalysisHudCard } from "./AnalysisHudCard";
import { WindPlanSwitch } from "./WindPlanSwitch";
import { WIND_SEASON_IDS, windPrevailingBadge, windRoseCardMeta, windStreaksSliderOn } from "./windRoseCard";
import type { ModelPageViewModel } from "./useModelPage";

export function WindRoseHudCard({ vm }: { vm: ModelPageViewModel }) {
  const {
    analyses,
    analysisCardOpen,
    commitWind,
    consoleWindStats,
    designWind,
    designWinds,
    setWindStreaksOn,
    siteWind,
    tab,
    toggleAnalysisCard,
    windMotion,
    windPlan,
    windSettings,
    windStreams,
    windStreaksOn,
  } = vm;
  const planWind = windPlan.active;
  const flowing = tab === "3d" && windSettings.enabled;
  const sliderOn = windStreaksSliderOn({ tab, analyses, windEnabled: windSettings.enabled, planActive: planWind });
  const classes = ["wind-rose-analysis-card"];
  if (planWind) classes.push("is-plan");
  if (analysisStackTight(tab, analyses)) classes.push("is-tight");
  const seasonLabel = windPlanSeasonLabel(windSettings.period);
  const badge = windPrevailingBadge(consoleWindStats, planWind);
  return (
    <AnalysisHudCard
      kind="wind"
      title="Wind Rose"
      label="Wind rose panel"
      className={classes.join(" ")}
      meta={windRoseCardMeta(seasonLabel, siteWind?.station.years)}
      collapsed={analysisCardCollapsed(analysisCardOpen, "wind")}
      onToggle={() => toggleAnalysisCard("wind")}
    >
      {planWind ? (
        <div className="ac-plan-switch">
          <WindPlanSwitch plan={windPlan} />
        </div>
      ) : null}
      {siteWind ? (
        <WindRosePanel selection={siteWind} period={windSettings.period} plan={windPlan} flowHeading={flowing} />
      ) : (
        <p className="ac-note">Wind data is not available for this site yet.</p>
      )}
      {siteWind && tab === "3d" && !planWind ? (
        <PrevailingStreamsLegend
          streams={windStreams}
          periodLabel={designWind ? `Design ${designWind.label}` : seasonLabel}
          muted={!windStreaksOn}
        />
      ) : null}

      <div className="ac-section">
        <span className="ac-kicker">Season</span>
        <div className="ac-seg ac-seg-5" role="group" aria-label="Wind season presets">
          {WIND_SEASON_IDS.map((periodId) => {
            const active = designWind == null && windSettings.period === periodId;
            return (
              <button
                key={periodId}
                type="button"
                className={active ? "ac-seg-btn is-ink" : "ac-seg-btn"}
                aria-pressed={active}
                onClick={() => commitWind(withWindSeason(windSettings, periodId))}
              >
                {windPlanSeasonLabel(periodId)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ac-section">
        {designWinds.length > 0 ? (
          <>
            <span className="ac-kicker">Design winds</span>
            <DesignWindPresets
              winds={designWinds}
              selectedId={designWind?.id ?? null}
              onSelect={(id) => commitWind(withDesignWind(windSettings, id))}
            />
          </>
        ) : null}
        <span className="ac-kicker">Prevailing</span>
        <div className="ac-badge-row" aria-label="Live wind telemetry">
          <span className="ac-badge mono">{badge.prevailing}</span>
          {badge.calm ? <span className="ac-note">{badge.calm}</span> : null}
        </div>
      </div>

      {planWind ? null : (
        <div className="ac-section">
          <span className="ac-kicker">Overlays</span>
          <div className="ac-seg ac-seg-3" role="group" aria-label="Wind overlay toggles">
            <button
              type="button"
              className={windSettings.enabled ? "ac-seg-btn is-on" : "ac-seg-btn"}
              aria-label="3D Wind Flow"
              aria-pressed={windSettings.enabled}
              onClick={() => commitWind({ ...windSettings, enabled: !windSettings.enabled })}
            >
              <span className="ac-dot" aria-hidden="true" />
              <span>Flow</span>
            </button>
            <button
              type="button"
              className={windStreaksOn ? "ac-seg-btn is-on" : "ac-seg-btn"}
              aria-label="Wind streaks"
              aria-pressed={windStreaksOn}
              onClick={() => setWindStreaksOn(!windStreaksOn)}
            >
              <span className="ac-dot" aria-hidden="true" />
              <span>Streaks</span>
            </button>
            <button
              type="button"
              className="ac-seg-btn wind-play-pill"
              aria-label={windMotion.paused ? "Play wind animation" : "Pause wind animation"}
              data-wind-paused={windMotion.paused ? "true" : "false"}
              disabled={!windSettings.enabled && !windStreaksOn}
              onClick={() => windMotion.setPaused(!windMotion.paused)}
            >
              {windMotion.paused ? "▶ Play" : "❚❚ Pause"}
            </button>
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
      )}
    </AnalysisHudCard>
  );
}
