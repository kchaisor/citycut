import { Eye, MoveUpRight, Sun, Wind } from "lucide-react";

import { activeAnalysisKinds, toggleAnalysis, type SiteAnalysisKind } from "../../lib/sidebarSections";
import { solarSettingsOnStudyStart } from "../../lib/solarStudyView";

export function ModelPageViewportFooter({ vm }: { vm: import("./useModelPage").ModelPageViewModel }) {
  const {
    analyses,
    commitRenderQuality,
    commitSolar,
    commitWind,
    diagramArrows,
    model,
    renderQuality,
    setAnalyses,
    setWindStreaksOn,
    solar,
    tab,
    windSettings,
  } = vm;
  const toggleMode = (kind: SiteAnalysisKind) => {
    const next = toggleAnalysis(analyses, kind);
    setAnalyses(next);
    if (kind === "wind") {
      if (next.wind) setWindStreaksOn(true);
      if (next.wind !== windSettings.enabled) commitWind({ ...windSettings, enabled: next.wind });
    }
    if (kind === "solar" && next.solar) commitSolar(solarSettingsOnStudyStart(solar));
  };
  return (
    <>
        {tab !== "satellite" ? (
          <div
            className="bottom-bar env-console hud-card"
            role="region"
            aria-label="Environmental analysis console"
            data-analysis={activeAnalysisKinds(analyses).join(" ") || "none"}
          >
            <div className="env-top-row">
              <span className="env-console-title">Analysis</span>
              <span className="v-sep hud-sep" aria-hidden="true" />
              <div className="env-mode-seg" role="group" aria-label="Analysis modes">
                {(
                  [
                    ["solar", Sun, "Solar Study"],
                    ["wind", Wind, "Wind Rose"],
                    ["view", Eye, "Viewshed Walk"],
                  ] as const
                ).map(([kind, Icon, label]) => (
                  <button
                    key={kind}
                    type="button"
                    data-analysis={kind}
                    aria-pressed={analyses[kind]}
                    className={analyses[kind] ? "env-mode-btn active" : "env-mode-btn"}
                    onClick={() => toggleMode(kind)}
                  >
                    <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <span className="v-sep hud-sep" aria-hidden="true" />
              <div className="env-quality" role="group" aria-label="Render quality">
                {(
                  [
                    ["high", "High"],
                    ["fast", "Fast"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={renderQuality === id ? "env-quality-btn active" : "env-quality-btn"}
                    aria-pressed={renderQuality === id}
                    aria-label={`${label} render quality`}
                    onClick={() => commitRenderQuality(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="v-sep hud-sep" aria-hidden="true" />
              <span className="env-console-title">Diagram</span>
              <button
                type="button"
                data-diagram="arrows"
                aria-pressed={diagramArrows.state.active}
                className={diagramArrows.state.active ? "env-mode-btn active" : "env-mode-btn"}
                onClick={() => diagramArrows.dispatch({ type: "setActive", active: !diagramArrows.state.active })}
              >
                <MoveUpRight size={12} strokeWidth={2.2} aria-hidden="true" />
                <span>Arrows</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bottom-bar studio-solar-bar hud-card" role="region" aria-label="Solar and camera controls">
            <button
              type="button"
              className={solar.castShadows ? "sun-pill studio-solar-pill is-active" : "sun-pill studio-solar-pill"}
              aria-pressed={solar.castShadows}
              onClick={() => commitSolar({ ...solar, castShadows: !solar.castShadows })}
            >
              <Sun size={12} strokeWidth={2.2} aria-hidden="true" />
              <span>Equinox · {`${solar.day} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(solar.month ?? 9) - 1] ?? "Sep"}`}</span>
            </button>
            <div className="solar-hours studio-solar-track mono" role="group" aria-label="Solar hour scrubber">
              {[9, 10, 11, 12, 13, 14, 15].map((hour) => (
                <button
                  key={hour}
                  type="button"
                  className={solar.hour === hour ? "h-tick active studio-solar-tick is-active" : "h-tick studio-solar-tick"}
                  aria-label={`Solar time ${String(hour).padStart(2, "0")}:00`}
                  aria-pressed={solar.hour === hour}
                  onClick={() => commitSolar({ ...solar, hour, minute: 0, castShadows: true })}
                >
                  {String(hour).padStart(2, "0")}
                </button>
              ))}
            </div>
            <span className="studio-solar-time mono">
              {String(solar.hour).padStart(2, "0")}:{String(solar.minute).padStart(2, "0")} AEST
            </span>
          </div>
        )}
        {model.terrainError && (
          <p className="stage-error" role="alert">
            {model.terrainError}
          </p>
        )}
    </>
  );
}
