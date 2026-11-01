import { Eye, Footprints, Sun, Wind } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { sitePlanShadePercent, type PlanShadowInput } from "../lib/buildingShadows";
import { formatSiteIslandSummary } from "../lib/siteIslandSummary";
import {
  SITE_ANALYSIS_KINDS,
  type SiteAnalysisKind,
} from "../lib/sidebarSections";
import { WIND_PERIOD_LABELS, type WindPeriodId } from "../lib/windRose";
import type { CityModel } from "../types";
import type { SolarViewSettings } from "./SolarHeliodon";
import { WalkRippleTimeScrubber } from "./WalkRippleTimeScrubber";
import { WALK_SPEEDS } from "./useWalkViewshed";
import type { WalkViewshed } from "./useWalkViewshed";
import type { WalkPlaybackSnapshot } from "../lib/walkPlayback";
import type { WindViewSettings } from "../lib/windState";
import type { useWalkRipple } from "./useWalkRipple";

type WalkRippleState = ReturnType<typeof useWalkRipple>;

const ANALYSIS_MODE_LABELS: Record<SiteAnalysisKind, string> = {
  solar: "Solar Study",
  wind: "Wind Rose",
  view: "Viewshed Walk",
  walkRipple: "Walk Ripple",
};

type WindStats = {
  prevailingLabel: string;
  prevailingMedianKmh: number;
  calmPercent: number;
} | null;

export type SiteIslandProps = {
  visible: boolean;
  analysisKind: SiteAnalysisKind;
  onAnalysisKind: (kind: SiteAnalysisKind) => void;
  tab: "3d" | "drawing" | "satellite";
  drawing: string;
  model: CityModel;
  displayModel: CityModel;
  solar: SolarViewSettings;
  commitSolar: (next: SolarViewSettings) => void;
  consolePlaying: boolean;
  setConsolePlaying: (value: boolean | ((prev: boolean) => boolean)) => void;
  consoleDaylight: { sunrise: number; sunset: number };
  consoleWindStats: WindStats;
  windSettings: WindViewSettings;
  commitWind: (next: WindViewSettings) => void;
  walk: WalkViewshed;
  walkAt: WalkPlaybackSnapshot;
  walkRipple: WalkRippleState;
  sunStudySelected: number[];
  setSunStudySelected: (ids: number[]) => void;
  onScrubActivity: () => void;
  liveMotion?: boolean;
  walkRippleHudExtra?: ReactNode;
};

export function SiteIsland(props: SiteIslandProps) {
  const {
    visible,
    analysisKind,
    onAnalysisKind,
    tab,
    drawing,
    model,
    displayModel,
    solar,
    commitSolar,
    consolePlaying,
    setConsolePlaying,
    consoleDaylight,
    consoleWindStats,
    windSettings,
    commitWind,
    walk,
    walkAt,
    walkRipple,
    sunStudySelected,
    setSunStudySelected,
    onScrubActivity,
    liveMotion = false,
    walkRippleHudExtra,
  } = props;

  const [expanded, setExpanded] = useState(false);
  const showExpanded = expanded || liveMotion;

  const shadeInput: PlanShadowInput = {
    lat: model.center.lat,
    lon: model.center.lon,
    year: solar.year,
    month: solar.month,
    day: solar.day,
    hour: solar.hour,
    minute: solar.minute,
  };
  const shadePercent =
    solar.castShadows && analysisKind === "solar"
      ? sitePlanShadePercent(displayModel, shadeInput, true)
      : null;

  const summary = formatSiteIslandSummary({
    kind: analysisKind,
    solar:
      analysisKind === "solar"
        ? {
            month: solar.month,
            day: solar.day,
            hour: solar.hour,
            minute: solar.minute,
            shadePercent,
          }
        : undefined,
    wind:
      analysisKind === "wind"
        ? {
            period: windSettings.period,
            prevailingLabel: consoleWindStats?.prevailingLabel ?? null,
            prevailingMedianKmh: consoleWindStats?.prevailingMedianKmh ?? null,
          }
        : undefined,
    view: analysisKind === "view" ? { walkAt } : undefined,
    walkRipple:
      analysisKind === "walkRipple"
        ? { minutes: walkRipple.rippleMinutes, hasTimes: Boolean(walkRipple.times) }
        : undefined,
  });

  const markScrub = useCallback(() => {
    onScrubActivity();
  }, [onScrubActivity]);

  if (!visible || !summary) return null;

  const analysisIcons: Record<SiteAnalysisKind, typeof Sun> = {
    solar: Sun,
    wind: Wind,
    view: Eye,
    walkRipple: Footprints,
  };

  return (
    <div
      className={showExpanded ? "site-island hud-card is-expanded" : "site-island hud-card"}
      data-live={liveMotion ? "true" : undefined}
      role="region"
      aria-label="Site analysis island"
      data-analysis={analysisKind}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false);
      }}
    >
      <div className="site-island-cap mono" aria-live="polite">
        {summary}
      </div>
      <div className="site-island-panel" aria-hidden={!showExpanded}>
        <div className="site-island-mode-seg" role="tablist" aria-label="Environmental analysis sub-mode">
          {SITE_ANALYSIS_KINDS.map((kind) => {
            const Icon = analysisIcons[kind];
            const active = analysisKind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? "env-mode-btn active" : "env-mode-btn"}
                onClick={() => {
                  onAnalysisKind(kind);
                  if (kind === "wind" && !windSettings.enabled) {
                    commitWind({ ...windSettings, enabled: true });
                  }
                }}
              >
                <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
                <span>{ANALYSIS_MODE_LABELS[kind]}</span>
              </button>
            );
          })}
        </div>

        <div className="site-island-controls">
          <div className="overlay-chips" role="group" aria-label="Scene overlay toggles">
            {analysisKind === "solar" && (
              <>
                {tab !== "drawing" && (
                  <button
                    type="button"
                    className={solar.showPath ? "ov-chip on" : "ov-chip"}
                    aria-pressed={solar.showPath}
                    onClick={() => commitSolar({ ...solar, showPath: !solar.showPath })}
                  >
                    <span className="ov-dot" aria-hidden="true" />
                    <span>3D Sun Dome</span>
                  </button>
                )}
                <button
                  type="button"
                  className={solar.castShadows ? "ov-chip on" : "ov-chip"}
                  aria-pressed={solar.castShadows}
                  onClick={() => commitSolar({ ...solar, castShadows: !solar.castShadows })}
                >
                  <span className="ov-dot" aria-hidden="true" />
                  <span>Shadows</span>
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
              </>
            )}

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
                <button
                  type="button"
                  className={windSettings.enabled && windSettings.showRose ? "ov-chip on" : "ov-chip"}
                  aria-pressed={windSettings.enabled && windSettings.showRose}
                  onClick={() =>
                    commitWind({
                      ...windSettings,
                      enabled: true,
                      showRose: !windSettings.showRose,
                    })
                  }
                >
                  <span className="ov-dot" aria-hidden="true" />
                  <span>Wind Rose</span>
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

            {analysisKind === "walkRipple" && (
              <>
                <button
                  type="button"
                  className={walkRipple.placing ? "ov-chip on" : "ov-chip"}
                  aria-pressed={walkRipple.placing}
                  onClick={() => walkRipple.setPlacing(!walkRipple.placing)}
                >
                  <span className="ov-dot" aria-hidden="true" />
                  <span>{walkRipple.placing ? "Click ground…" : "Pick origin"}</span>
                </button>
                <button
                  type="button"
                  className={walkRipple.status === "ready" ? "ov-chip on" : "ov-chip"}
                  disabled={!walkRipple.times}
                  onClick={walkRipple.clear}
                >
                  <span className="ov-dot" aria-hidden="true" />
                  <span>Clear ripple</span>
                </button>
                {walkRippleHudExtra ? (
                  <span className="site-island-walk-ripple-extra">{walkRippleHudExtra}</span>
                ) : null}
              </>
            )}
          </div>

          <div className="env-bottom-row">
            {analysisKind === "solar" && (() => {
              const isJun = solar.month === 6 && solar.day === 21;
              const isSep = solar.month === 9 && solar.day === 22;
              const isDec = solar.month === 12 && solar.day === 22;
              const formatMin = (m: number) =>
                `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
              const curMin = solar.hour * 60 + solar.minute;
              const minBound = 5 * 60;
              const maxBound = 20 * 60;
              const thumbPct = Math.max(4, Math.min(96, ((curMin - minBound) / (maxBound - minBound)) * 100));
              return (
                <>
                  <div className="date-presets" role="group" aria-label="Solar date presets">
                    <button
                      type="button"
                      className={isJun ? "p-pill active" : "p-pill"}
                      aria-pressed={isJun}
                      onClick={() => {
                        markScrub();
                        commitSolar({ ...solar, month: 6, day: 21, castShadows: true });
                      }}
                    >
                      21 Jun
                    </button>
                    <button
                      type="button"
                      className={isSep ? "p-pill active" : "p-pill"}
                      aria-pressed={isSep}
                      onClick={() => {
                        markScrub();
                        commitSolar({ ...solar, month: 9, day: 22, castShadows: true });
                      }}
                    >
                      22 Sep · Equinox
                    </button>
                    <button
                      type="button"
                      className={isDec ? "p-pill active" : "p-pill"}
                      aria-pressed={isDec}
                      onClick={() => {
                        markScrub();
                        commitSolar({ ...solar, month: 12, day: 22, castShadows: true });
                      }}
                    >
                      22 Dec
                    </button>
                  </div>

                  <button
                    type="button"
                    className={consolePlaying ? "play-pill mono active" : "play-pill mono"}
                    aria-label={consolePlaying ? "Pause solar animation" : "Play solar animation"}
                    aria-pressed={consolePlaying}
                    onClick={() => {
                      markScrub();
                      setConsolePlaying((p) => !p);
                    }}
                  >
                    {consolePlaying ? "❚❚ 1×" : "▶ 1×"}
                  </button>

                  <div className="daylight-scrubber mono" role="group" aria-label="Daylight horizon scrubber">
                    <span className="sun-bound" title="Melbourne sunrise">
                      ▲ {formatMin(consoleDaylight.sunrise)}
                    </span>
                    <div className="scrubber-track">
                      <div className="daylight-band" aria-hidden="true" />
                      <div className="rescode-window" title="9am–3pm Victorian ResCode assessment window" aria-hidden="true" />
                      <div className="scrubber-ticks" role="group" aria-label="Solar hour scrubber">
                        {[6, 9, 10, 11, 12, 13, 14, 15, 18].map((h) => (
                          <button
                            key={h}
                            type="button"
                            className={
                              solar.hour === h
                                ? "scrubber-tick-btn active"
                                : h >= 9 && h <= 15
                                  ? "scrubber-tick-btn hi"
                                  : "scrubber-tick-btn"
                            }
                            aria-label={`Solar time ${String(h).padStart(2, "0")}:00`}
                            aria-pressed={solar.hour === h}
                            onClick={() => {
                              markScrub();
                              setConsolePlaying(false);
                              commitSolar({ ...solar, hour: h, minute: 0, castShadows: true });
                            }}
                          >
                            {String(h).padStart(2, "0")}
                          </button>
                        ))}
                      </div>
                      <input
                        type="range"
                        className="scrubber-range-input"
                        aria-label="Solar time of day"
                        min={consoleDaylight.sunrise}
                        max={consoleDaylight.sunset}
                        step={5}
                        value={Math.max(consoleDaylight.sunrise, Math.min(consoleDaylight.sunset, curMin))}
                        onPointerDown={markScrub}
                        onChange={(e) => {
                          markScrub();
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
                      <div className="scrubber-thumb" style={{ left: `${thumbPct}%` }} aria-hidden="true" />
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

            {analysisKind === "wind" && (
              <>
                <div className="date-presets" role="group" aria-label="Wind season presets">
                  {(["annual", "summer", "autumn", "winter", "spring"] as const).map((periodId) => (
                    <button
                      key={periodId}
                      type="button"
                      className={windSettings.period === periodId ? "p-pill active" : "p-pill"}
                      aria-pressed={windSettings.period === periodId}
                      onClick={() => commitWind({ ...windSettings, enabled: true, period: periodId as WindPeriodId })}
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
                <div className="daylight-scrubber wind-console-bar mono">
                  <span className="sun-bound">
                    {WIND_PERIOD_LABELS[windSettings.period as keyof typeof WIND_PERIOD_LABELS] ?? "Annual"}
                  </span>
                  <div className="wind-band-pills" aria-label="Wind speed scale (km/h)">
                    <span className="wind-band-chip band-0">2–10 km/h</span>
                    <span className="wind-band-chip band-1">10–20</span>
                    <span className="wind-band-chip band-2">20–30</span>
                    <span className="wind-band-chip band-3">30–40</span>
                    <span className="wind-band-chip band-4">40+ km/h</span>
                  </div>
                  {consoleWindStats ? (
                    <span className="time-readout-pill">
                      🌬 {consoleWindStats.prevailingLabel} · {Math.round(consoleWindStats.prevailingMedianKmh)} km/h
                    </span>
                  ) : null}
                </div>
              </>
            )}

            {analysisKind === "view" && (
              <>
                <button
                  type="button"
                  className="play-pill mono"
                  aria-label={walk.playing ? "Pause walk" : "Play walk"}
                  disabled={walk.status !== "ready" && walk.status !== "computing"}
                  onClick={() => {
                    markScrub();
                    walk.setPlaying(!walk.playing);
                  }}
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
                        onPointerDown={markScrub}
                        onChange={(event) => {
                          markScrub();
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
                    👁 {walk.sampleCount > 1 ? `${Math.round(walkAt.distanceM)}/${Math.round(walk.lengthM)}m · ` : ""}
                    {walk.eyeM.toFixed(1)}m · {walk.radiusM}m
                    {walkAt.visiblePercent !== null ? ` · ${Math.round(walkAt.visiblePercent)}% visible` : ""}
                  </span>
                </div>
              </>
            )}

            {analysisKind === "walkRipple" && (
              <WalkRippleTimeScrubber
                minutes={walkRipple.rippleMinutes}
                reachedBuildingCount={
                  walkRipple.buildingArrivals
                    ? [...walkRipple.buildingArrivals.values()].filter((a) => a <= walkRipple.rippleMinutes + 0.04)
                        .length
                    : 0
                }
                disabled={!walkRipple.times}
                playing={walkRipple.ripplePlaying}
                onMinutesChange={(m) => {
                  markScrub();
                  walkRipple.setRippleMinutes(m);
                }}
                onPlayToggle={() => {
                  markScrub();
                  walkRipple.toggleRipplePlay();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
