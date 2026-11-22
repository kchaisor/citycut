import { Eye, Sun, Wind } from "lucide-react";

import { WALK_SPEEDS } from "../useWalkViewshed";
import {
  RESCODE_WINDOW_END_HOUR,
  RESCODE_WINDOW_START_HOUR,
  SOLAR_SLIDER_END_MIN,
  SOLAR_SLIDER_START_MIN,
  SOLAR_SLIDER_STEP_MIN,
  SOLAR_SLIDER_TICK_HOURS,
  clampSolarSliderMinutes,
  isRescodeHour,
  solarSliderPercent,
  solarSliderTickTier,
  solarSliderSpan,
} from "../../lib/solarSlider";
import { SUN_STUDY_DATES } from "../../lib/solar";
import { toggleAnalysis, type SiteAnalysisKind } from "../../lib/sidebarSections";
import { WIND_PERIOD_LABELS, WindPeriodId } from "../../lib/windRose";
import { withDesignWind, withWindSeason } from "../../lib/windState";
import { DesignWindPresets } from "../DesignWindPresets";
import { WindPlanSwitch } from "./WindPlanSwitch";


export function ModelPageViewportFooter({ vm }: { vm: import("./useModelPage").ModelPageViewModel }) {
  const {
    analysisKind,
    commitRenderQuality,
    commitSolar,
    commitWind,
    consoleDaylight,
    consolePlaying,
    consoleSun,
    consoleWindStats,
    drawing,
    model,
    renderQuality,
    setAnalysisKind,
    setConsolePlaying,
    setSunStudySelected,
    solar,
    sunStudySelected,
    tab,
    walk,
    walkAt,
    windSettings,
    windPlan,
    designWinds,
    designWind,
  } = vm;
  const planWind = windPlan.active && analysisKind === "wind";
  const solarChrome = analysisKind !== "wind" && analysisKind !== "view";
  const solarLive = analysisKind === "solar";
  const toggleMode = (kind: SiteAnalysisKind) => {
    const next = toggleAnalysis(analysisKind, kind);
    setAnalysisKind(next);
    if (next === "wind" && !windSettings.enabled) commitWind({ ...windSettings, enabled: true });
    if (next !== "wind" && windSettings.enabled) commitWind({ ...windSettings, enabled: false });
  };
  const seasonActive = (periodId: WindPeriodId) => designWind == null && windSettings.period === periodId;
  const windTelemetry = (
    <div className="solar-telemetry mono" aria-label="Live wind telemetry">
      <div className="st-item">
        <span className="st-k">PREVAILING</span>
        <span className="st-v">{consoleWindStats ? consoleWindStats.prevailingLabel : "N, NNE"}</span>
      </div>
      <span className="st-dot" aria-hidden="true">·</span>
      <div className="st-item">
        <span className="st-k">MEDIAN</span>
        <span className="st-v">
          {planWind
            ? consoleWindStats
              ? `${(consoleWindStats.prevailingMeanSpeedMs ?? consoleWindStats.prevailingMedianKmh / 3.6).toFixed(1)} m/s`
              : "—"
            : consoleWindStats
              ? `${Math.round(consoleWindStats.prevailingMedianKmh)} km/h`
              : "18 km/h"}
        </span>
      </div>
      <span className="st-dot" aria-hidden="true">·</span>
      <div className="st-item">
        <span className="st-k">CALM</span>
        <span className="st-v">{consoleWindStats ? `${consoleWindStats.calmPercent.toFixed(1)}%` : "4.2%"}</span>
      </div>
    </div>
  );

  return (
    <>
        {tab !== "satellite" ? (
          <div
            className="bottom-bar env-console hud-card"
            role="region"
            aria-label="Environmental analysis console"
            data-analysis={analysisKind ?? "none"}
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
                    aria-pressed={analysisKind === kind}
                    className={analysisKind === kind ? "env-mode-btn active" : "env-mode-btn"}
                    onClick={() => toggleMode(kind)}
                  >
                    <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {solarChrome && (
              <div
                className={solarLive ? "env-solar-chrome" : "env-solar-chrome env-solar-idle"}
                {...(!solarLive ? { inert: true } : {})}
              >
              <span className="v-sep hud-sep" aria-hidden="true" />
              {(() => {
                const azDeg = Math.round(((consoleSun.azimuthDeg % 360) + 360) % 360);
                const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
                const cardinal = dirs[Math.round(azDeg / 45) % 8] ?? "N";
                const dlSpan = Math.max(0, consoleDaylight.sunset - consoleDaylight.sunrise);
                const dlHours = Math.floor(dlSpan / 60);
                const dlMins = String(dlSpan % 60).padStart(2, "0");
                return (
                  <div className="solar-telemetry mono" aria-label="Live solar telemetry">
                    <div className="st-item">
                      <span className="st-k">ALT</span>
                      <span className="st-v">{consoleSun.altitudeDeg.toFixed(1)}°</span>
                    </div>
                    <span className="st-dot" aria-hidden="true">·</span>
                    <div className="st-item">
                      <span className="st-k">AZ</span>
                      <span className="st-v">{azDeg}° {cardinal}</span>
                    </div>
                    <span className="st-dot" aria-hidden="true">·</span>
                    <div className="st-item">
                      <span className="st-k">DAYLIGHT</span>
                      <span className="st-v">{dlHours}h {dlMins}m</span>
                    </div>
                  </div>
                );
              })()}

              <span className="v-sep hud-sep" aria-hidden="true" />

              <div className="overlay-chips" role="group" aria-label="Scene overlay toggles">
                      <button
                        type="button"
                        className={solar.castShadows ? "ov-chip on" : "ov-chip"}
                        aria-pressed={solar.castShadows}
                        onClick={() => commitSolar({ ...solar, castShadows: !solar.castShadows })}
                      >
                        <span className="ov-dot" aria-hidden="true" />
                        <span>Shadows</span>
                      </button>
                      <button
                        type="button"
                        data-sun-hours-ground-chip
                        className={solar.sunHours ? "ov-chip on" : "ov-chip"}
                        aria-pressed={Boolean(solar.sunHours)}
                        onClick={() => commitSolar({ ...solar, sunHours: !solar.sunHours })}
                      >
                        <span className="ov-dot" aria-hidden="true" />
                        <span>Sun hours</span>
                      </button>
                      <button
                        type="button"
                        className={solar.showPath ? "ov-chip on" : "ov-chip"}
                        aria-pressed={solar.showPath}
                        onClick={() => commitSolar({ ...solar, showPath: !solar.showPath })}
                      >
                        <span className="ov-dot" aria-hidden="true" />
                        <span>3D Sun Dome</span>
                      </button>
                      {tab === "drawing" && drawing === "site" && (
                        <button
                          type="button"
                          className={solar.sunStudy ? "ov-chip on" : "ov-chip"}
                          aria-pressed={Boolean(solar.sunStudy)}
                          onClick={() =>
                            commitSolar({
                              ...solar,
                              sunStudy: !solar.sunStudy,
                              sunStudyCasters: sunStudySelected.length > 0 ? "selected" : "all",
                            })
                          }
                        >
                          <span className="ov-dot" aria-hidden="true" />
                          <span>9–3pm Plan Fan</span>
                        </button>
                      )}
                      {tab === "drawing" && drawing === "site" && Boolean(solar.sunStudy) && sunStudySelected.length > 0 && (
                        <button
                          type="button"
                          className="ov-chip on"
                          aria-label={`Clear ${sunStudySelected.length} selected shadow buildings`}
                          onClick={() => {
                            setSunStudySelected([]);
                            commitSolar({ ...solar, sunStudyCasters: "all" });
                          }}
                        >
                          <span>{sunStudySelected.length} selected ×</span>
                        </button>
                      )}
              </div>
              </div>
              )}

              {analysisKind === "wind" && !planWind && windTelemetry}

              {analysisKind === "view" && (
                <div className="solar-telemetry mono" aria-label="Live viewshed telemetry">
                  <div className="st-item">
                    <span className="st-k">EYE</span>
                    <span className="st-v">{walk.eyeM.toFixed(1)}m</span>
                  </div>
                  <span className="st-dot" aria-hidden="true">·</span>
                  <div className="st-item">
                    <span className="st-k">RADIUS</span>
                    <span className="st-v">{walk.radiusM}m</span>
                  </div>
                  <span className="st-dot" aria-hidden="true">·</span>
                  <div className="st-item">
                    <span className="st-k">PATH</span>
                    <span className="st-v">{walk.clickCount > 0 ? `${Math.round(walk.lengthM)}m (${walk.clickCount} pts)` : "Click ground"}</span>
                  </div>
                </div>
              )}

              {analysisKind && !planWind && !solarChrome && <span className="v-sep hud-sep" aria-hidden="true" />}

              {planWind ? (
                <WindPlanSwitch plan={windPlan} />
              ) : analysisKind === "wind" || analysisKind === "view" ? (
                <div className="overlay-chips" role="group" aria-label="Scene overlay toggles">
                  {analysisKind === "wind" && (
                    <>
                      <button
                        type="button"
                        className={windSettings.enabled ? "ov-chip on" : "ov-chip"}
                        aria-pressed={windSettings.enabled}
                        onClick={() => commitWind({ ...windSettings, enabled: !windSettings.enabled })}
                      >
                        <span className="ov-dot" aria-hidden="true" />
                        <span>3D Wind Flow</span>
                      </button>
                    </>
                  )}

                  {analysisKind === "view" && (
                    <>
                      <button
                        type="button"
                        className={walk.drawing ? "ov-chip on" : "ov-chip"}
                        aria-pressed={walk.drawing}
                        onClick={() => walk.setDrawing(!walk.drawing)}
                      >
                        <span className="ov-dot" aria-hidden="true" />
                        <span>{walk.drawing ? "Drawing Path…" : "Draw Path"}</span>
                      </button>
                      <button
                        type="button"
                        className={walk.status === "ready" ? "ov-chip on" : "ov-chip"}
                        disabled={walk.sampleCount < 2 || walk.status === "computing"}
                        onClick={() => walk.compute()}
                      >
                        <span className="ov-dot" aria-hidden="true" />
                        <span>{walk.status === "ready" ? "Viewshed Ready" : "Compute View"}</span>
                      </button>
                    </>
                  )}

                </div>
              ) : null}

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
            </div>

            <div className="env-bottom-row">
              {solarChrome && (
              <div
                className={solarLive ? "env-solar-chrome env-solar-bottom" : "env-solar-chrome env-solar-bottom env-solar-idle"}
                {...(!solarLive ? { inert: true } : {})}
              >
              {(() => {
                const formatMin = (m: number) =>
                  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
                const curMin = solar.hour * 60 + solar.minute;
                const thumbPct = solarSliderPercent(curMin);
                const daylightSpan = solarSliderSpan(consoleDaylight.sunrise, consoleDaylight.sunset);
                const rescodeSpan = solarSliderSpan(RESCODE_WINDOW_START_HOUR * 60, RESCODE_WINDOW_END_HOUR * 60);
                return (
                  <>
                    <div className="date-presets" role="group" aria-label="Solar date presets">
                      {SUN_STUDY_DATES.map((date) => {
                        const active = solar.month === date.month && solar.day === date.day;
                        return (
                          <button
                            key={date.id}
                            type="button"
                            className={active ? "p-pill active" : "p-pill"}
                            aria-pressed={active}
                            onClick={() => commitSolar({ ...solar, month: date.month, day: date.day, castShadows: true })}
                          >
                            {date.label} · {date.name}
                          </button>
                        );
                      })}
                    </div>

                    <span className="v-sep hud-sep" aria-hidden="true" />

                    <button
                      type="button"
                      className={consolePlaying ? "play-pill mono active" : "play-pill mono"}
                      aria-label={consolePlaying ? "Pause solar animation" : "Play solar animation"}
                      aria-pressed={consolePlaying}
                      onClick={() => setConsolePlaying((p) => !p)}
                    >
                      {consolePlaying ? "❚❚ 1×" : "▶ 1×"}
                    </button>

                    <div className="daylight-scrubber mono" role="group" aria-label="Daylight horizon scrubber">
                      <span className="sun-bound" title="Melbourne sunrise">
                        ▲ {formatMin(consoleDaylight.sunrise)}
                      </span>
                      <div className="scrubber-track">
                        <div
                          className="daylight-band"
                          aria-hidden="true"
                          style={{ left: `${daylightSpan.left}%`, width: `${daylightSpan.width}%` }}
                        />
                        <div
                          className="rescode-window"
                          title="9am–3pm Victorian ResCode assessment window"
                          aria-hidden="true"
                          style={{ left: `${rescodeSpan.left}%`, width: `${rescodeSpan.width}%` }}
                        />
                        <div className="scrubber-ticks" role="group" aria-label="Solar hour scrubber">
                          {SOLAR_SLIDER_TICK_HOURS.map((h) => {
                            const tickPct = solarSliderPercent(h * 60);
                            return (
                              <button
                                key={h}
                                type="button"
                                style={{ left: `${tickPct}%`, transform: `translate(-${tickPct}%, -50%)` }}
                                className={
                                  solar.hour === h
                                    ? "scrubber-tick-btn active"
                                    : isRescodeHour(h)
                                      ? "scrubber-tick-btn hi"
                                      : "scrubber-tick-btn"
                                }
                                data-tick-tier={solarSliderTickTier(h)}
                                aria-label={`Solar time ${String(h).padStart(2, "0")}:00`}
                                aria-pressed={solar.hour === h}
                                onClick={() => {
                                  setConsolePlaying(false);
                                  commitSolar({ ...solar, hour: h, minute: 0, castShadows: true });
                                }}
                              >
                                {String(h).padStart(2, "0")}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="range"
                          className="scrubber-range-input"
                          aria-label="Solar time of day"
                          min={SOLAR_SLIDER_START_MIN}
                          max={SOLAR_SLIDER_END_MIN}
                          step={SOLAR_SLIDER_STEP_MIN}
                          value={clampSolarSliderMinutes(curMin)}
                          onChange={(e) => {
                            setConsolePlaying(false);
                            const total = Number(e.target.value);
                            commitSolar({
                              ...solar,
                              hour: Math.floor(total / 60),
                              minute: total % 60,
                              castShadows: true,
                            });
                          }}
                        />
                        <div
                          className="scrubber-thumb"
                          style={{ left: `${thumbPct}%`, transform: `translateX(-${thumbPct}%)` }}
                          aria-hidden="true"
                        />
                      </div>
                      <span className="sun-bound" title="Melbourne sunset">
                        ▼ {formatMin(consoleDaylight.sunset)}
                      </span>
                      <span className="time-readout-pill">
                        ☀ {String(solar.hour).padStart(2, "0")}:{String(solar.minute).padStart(2, "0")} AEST
                      </span>
                    </div>
                  </>
                );
              })()}
              </div>
              )}

              {analysisKind === "wind" && (
                <>
                  <div className="date-presets" role="group" aria-label="Wind season presets">
                    {(["annual", "summer", "autumn", "winter", "spring"] as const).map((periodId) => (
                      <button
                        key={periodId}
                        type="button"
                        className={seasonActive(periodId) ? "p-pill active" : "p-pill"}
                        aria-pressed={seasonActive(periodId)}
                        onClick={() => commitWind(withWindSeason(windSettings, periodId as WindPeriodId))}
                      >
                        {periodId === "annual"
                          ? "Annual"
                          : periodId === "summer"
                            ? "Summer"
                            : periodId === "autumn"
                              ? "Autumn"
                              : periodId === "winter"
                                ? "Winter"
                                : "Spring"}
                      </button>
                    ))}
                  </div>
                  <DesignWindPresets
                    winds={designWinds}
                    selectedId={designWind?.id ?? null}
                    onSelect={(id) => commitWind(withDesignWind(windSettings, id))}
                  />
                  {planWind ? (
                    windTelemetry
                  ) : (
                    <div className="daylight-scrubber wind-console-bar mono">
                      <span className="sun-bound">
                        {designWind
                          ? `Design wind ${designWind.label}`
                          : (WIND_PERIOD_LABELS[windSettings.period as keyof typeof WIND_PERIOD_LABELS] ?? "Annual")}
                      </span>
                      <span className="time-readout-pill">
                        🌬{" "}
                        {designWind
                          ? `${designWind.headingDeg}° · ${Math.round(designWind.stationMs * 3.6)} km/h`
                          : consoleWindStats
                            ? `${consoleWindStats.prevailingLabel} · ${Math.round(consoleWindStats.prevailingMedianKmh)} km/h`
                            : "TMYx station wind"}
                      </span>
                    </div>
                  )}
                </>
              )}

              {analysisKind === "view" && (
                <>
                  <button
                    type="button"
                    className="play-pill mono"
                    aria-label={walk.playing ? "Pause walk" : "Play walk"}
                    disabled={walk.status !== "ready" && walk.status !== "computing"}
                    onClick={() => walk.setPlaying(!walk.playing)}
                  >
                    {walk.playing ? "⏸ Pause" : "▶ Play"}
                  </button>
                  <div className="date-presets" role="group" aria-label="Viewshed walk speed, eye height, and radius presets">
                    {WALK_SPEEDS.map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        className={walk.speed === spd ? "p-pill active mono" : "p-pill mono"}
                        aria-label={`${spd}× walk speed`}
                        aria-pressed={walk.speed === spd}
                        onClick={() => walk.setSpeed(spd)}
                      >
                        {spd}×
                      </button>
                    ))}
                    {[
                      [1.6, "1.6m"],
                      [4.5, "4.5m"],
                      [10, "10m"],
                    ].map(([eyeVal, label]) => (
                      <button
                        key={String(label)}
                        type="button"
                        className={Math.abs(walk.eyeM - Number(eyeVal)) < 0.15 ? "p-pill active" : "p-pill"}
                        aria-pressed={Math.abs(walk.eyeM - Number(eyeVal)) < 0.15}
                        onClick={() => walk.setEyeM(Number(eyeVal))}
                      >
                        {label}
                      </button>
                    ))}
                    {[100, 200, 400].map((rad) => (
                      <button
                        key={rad}
                        type="button"
                        className={walk.radiusM === rad ? "p-pill active" : "p-pill"}
                        aria-pressed={walk.radiusM === rad}
                        onClick={() => walk.setRadiusM(rad)}
                      >
                        {rad}m
                      </button>
                    ))}
                    {walk.clickCount > 0 && (
                      <button type="button" className="p-pill" onClick={walk.clear}>
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="daylight-scrubber view-console-bar mono">
                    {walk.sampleCount > 1 ? (
                      <>
                        <span className="sun-bound">0m</span>
                        <input
                          type="range"
                          className="sun-range"
                          aria-label="Position along walk"
                          min={0}
                          max={Math.max(0, walk.sampleCount - 1)}
                          step={1}
                          value={Math.min(walkAt.index, Math.max(0, walk.sampleCount - 1))}
                          onChange={(event) => {
                            walk.setPlaying(false);
                            walk.seek(Number(event.target.value));
                          }}
                        />
                        <span className="sun-bound">{Math.round(walk.lengthM)}m</span>
                      </>
                    ) : (
                      <span className="sun-bound">
                        {walk.drawing
                          ? "Click ground in 3D view to place walk points"
                          : walk.clickCount > 0
                            ? `Walk path · ${Math.round(walk.lengthM)} m (${walk.sampleCount} samples)`
                            : "Click 'Draw Path' then click ground points"}
                      </span>
                    )}
                    <span className="time-readout-pill">
                      👁 {walk.sampleCount > 1 ? `${Math.round(walkAt.distanceM)}/${Math.round(walk.lengthM)}m · ` : ""}{walk.eyeM.toFixed(1)}m · {walk.radiusM}m
                    </span>
                  </div>
                </>
              )}

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
