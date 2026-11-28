import type { CSSProperties } from "react";
import {
  RESCODE_WINDOW_END_HOUR,
  RESCODE_WINDOW_START_HOUR,
  SOLAR_SLIDER_END_MIN,
  SOLAR_SLIDER_START_MIN,
  SOLAR_SLIDER_STEP_MIN,
  clampSolarSliderMinutes,
  isRescodeHour,
  solarSliderPercent,
  solarSliderSpan,
} from "../../lib/solarSlider";
import { SUN_STUDY_DATES } from "../../lib/solar";
import { analysisCardCollapsed } from "../../lib/analysisCards";
import { sunDomeSizeFromSlider, sunDomeSizeShare } from "../../lib/heliodonRadius";
import { SUN_HOURS_PICK_HINT_3D, SUN_HOURS_PICK_HINT_PLAN } from "../../lib/sunHoursPicked";
import { DEFAULT_SUN_HOURS_WINDOW, SUN_HOURS_WINDOWS, SUN_HOURS_WINDOW_IDS } from "../../lib/sunHoursWindow";
import { AnalysisHudCard } from "./AnalysisHudCard";
import { SunHoursLegendDock } from "./SunHoursLegendDock";
import { sunHoursLegendCardOn } from "./sunHoursLegendCard";
import {
  SOLAR_CARD_TICK_HOURS,
  solarAzimuthLabel,
  solarClock,
  solarClockFromMinutes,
  solarDaylightLabel,
  solarStudyCardMeta,
  sunDomeSizeNote,
} from "./solarStudyCard";
import type { ModelPageViewModel } from "./useModelPage";

export function SolarStudyHudCard({ vm }: { vm: ModelPageViewModel }) {
  const {
    analysisCardOpen,
    commitSolar,
    consoleDaylight,
    consolePlaying,
    consoleSun,
    drawing,
    setConsolePlaying,
    setSunDomeSizeM,
    setSunStudySelected,
    solar,
    sunDome,
    sunHoursGround,
    sunHoursPickedIds,
    sunStudySelected,
    tab,
    toggleAnalysisCard,
  } = vm;
  const sitePlan = tab === "drawing" && drawing === "site";
  const curMin = solar.hour * 60 + solar.minute;
  const thumbPct = solarSliderPercent(curMin);
  const daylightSpan = solarSliderSpan(consoleDaylight.sunrise, consoleDaylight.sunset);
  const rescodeSpan = solarSliderSpan(RESCODE_WINDOW_START_HOUR * 60, RESCODE_WINDOW_END_HOUR * 60);
  const domeOn = solar.showPath;
  const domeTrack = {
    "--wind-streaks-fill": `${sunDomeSizeShare(sunDome.range, sunDome.radiusM) * 100}%`,
    "--wind-streaks-tick": sunDomeSizeShare(sunDome.range, sunDome.range.autoM),
  } as CSSProperties;
  const sunHoursLegendOn = sunHoursLegendCardOn({
    tab,
    drawing,
    sunHours: Boolean(solar.sunHours),
    hasResult: sunHoursGround.grid != null,
    pending: sunHoursGround.pending || sunHoursGround.pendingSurfaces,
  });
  const sunHoursWindow = solar.sunHoursWindow ?? DEFAULT_SUN_HOURS_WINDOW;
  const sunHoursPickedOnly = Boolean(solar.sunHoursPickedOnly);
  const overlay = (label: string, on: boolean, toggle: () => void, attrs: Record<string, boolean> = {}) => (
    <button type="button" className={on ? "ac-seg-btn is-on" : "ac-seg-btn"} aria-pressed={on} onClick={toggle} {...attrs}>
      <span className="ac-dot" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );

  return (
    <AnalysisHudCard
      kind="solar"
      title="Solar Study"
      label="Solar Study panel"
      className="solar-study-card"
      meta={solarStudyCardMeta(solar)}
      collapsed={analysisCardCollapsed(analysisCardOpen, "solar")}
      onToggle={() => toggleAnalysisCard("solar")}
    >
      <dl className="ac-kv" aria-label="Live solar telemetry">
        <dt>Alt</dt>
        <dd>{consoleSun.altitudeDeg.toFixed(1)}°</dd>
        <dt>Az</dt>
        <dd>{solarAzimuthLabel(consoleSun.azimuthDeg)}</dd>
        <dt>Daylight</dt>
        <dd>{solarDaylightLabel(consoleDaylight.sunrise, consoleDaylight.sunset)}</dd>
      </dl>

      <div className={sitePlan ? "ac-seg ac-seg-2" : "ac-seg ac-seg-3"} role="group" aria-label="Solar overlays">
        {overlay("Shadows", solar.castShadows, () => commitSolar({ ...solar, castShadows: !solar.castShadows }))}
        {overlay("Sun hours", Boolean(solar.sunHours), () => commitSolar({ ...solar, sunHours: !solar.sunHours }), {
          "data-sun-hours-ground-chip": true,
        })}
        {overlay("Sun dome", solar.showPath, () => commitSolar({ ...solar, showPath: !solar.showPath }))}
        {sitePlan
          ? overlay("9–3pm Plan Fan", Boolean(solar.sunStudy), () =>
              commitSolar({
                ...solar,
                sunStudy: !solar.sunStudy,
                sunStudyCasters: sunStudySelected.length > 0 ? "selected" : "all",
              }),
            )
          : null}
        {sitePlan && Boolean(solar.sunStudy) && sunStudySelected.length > 0 ? (
          <button
            type="button"
            className="ac-seg-btn is-on"
            aria-label={`Clear ${sunStudySelected.length} selected shadow buildings`}
            onClick={() => {
              setSunStudySelected([]);
              commitSolar({ ...solar, sunStudyCasters: "all" });
            }}
          >
            {sunStudySelected.length} selected ×
          </button>
        ) : null}
      </div>

      <div className="ac-section">
        <div className="ac-date-grid" role="group" aria-label="Solar date presets">
          {SUN_STUDY_DATES.map((date) => {
            const active = solar.month === date.month && solar.day === date.day;
            return (
              <button
                key={date.id}
                type="button"
                className={active ? "ac-date-pill is-ink" : "ac-date-pill"}
                aria-label={`${date.label} · ${date.name}`}
                aria-pressed={active}
                onClick={() => commitSolar({ ...solar, month: date.month, day: date.day, castShadows: true })}
              >
                <b>{date.label}</b>
                <span>{date.name.replace(" solstice", "")}</span>
              </button>
            );
          })}
        </div>
        <div className="ac-time" role="group" aria-label="Daylight horizon scrubber">
          <button
            type="button"
            className={consolePlaying ? "ac-play mono is-ink" : "ac-play mono"}
            aria-label={consolePlaying ? "Pause solar animation" : "Play solar animation"}
            aria-pressed={consolePlaying}
            onClick={() => setConsolePlaying((p) => !p)}
          >
            {consolePlaying ? "❚❚ 1×" : "▶ 1×"}
          </button>
          <span className="ac-bound mono" title="Melbourne sunrise">
            ▲ {solarClockFromMinutes(consoleDaylight.sunrise)}
          </span>
          <div className="ac-scrub">
            <div className="ac-scrub-rail">
              <div
                className="ac-scrub-daylight"
                aria-hidden="true"
                style={{ left: `${daylightSpan.left}%`, width: `${daylightSpan.width}%` }}
              />
              <div
                className="ac-scrub-rescode"
                title="9am–3pm Victorian ResCode assessment window"
                aria-hidden="true"
                style={{ left: `${rescodeSpan.left}%`, width: `${rescodeSpan.width}%` }}
              />
            </div>
            <div className="ac-scrub-thumb" style={{ left: `${thumbPct}%` }} aria-hidden="true" />
            <input
              type="range"
              className="ac-scrub-input"
              aria-label="Solar time of day"
              min={SOLAR_SLIDER_START_MIN}
              max={SOLAR_SLIDER_END_MIN}
              step={SOLAR_SLIDER_STEP_MIN}
              value={clampSolarSliderMinutes(curMin)}
              onChange={(e) => {
                setConsolePlaying(false);
                const total = Number(e.target.value);
                commitSolar({ ...solar, hour: Math.floor(total / 60), minute: total % 60, castShadows: true });
              }}
            />
          </div>
          <span className="ac-bound mono" title="Melbourne sunset">
            ▼ {solarClockFromMinutes(consoleDaylight.sunset)}
          </span>
          <div className="ac-ticks mono" role="group" aria-label="Solar hour scrubber">
            {SOLAR_CARD_TICK_HOURS.map((h) => {
              const tickPct = solarSliderPercent(h * 60);
              return (
                <button
                  key={h}
                  type="button"
                  style={{ left: `${tickPct}%` }}
                  className={solar.hour === h ? "ac-tick is-active" : isRescodeHour(h) ? "ac-tick is-hi" : "ac-tick"}
                  aria-label={`Solar time ${solarClock(h, 0)}`}
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
          <span className="ac-badge mono">☀ {solarClock(solar.hour, solar.minute)} AEST</span>
        </div>
      </div>

      {tab === "3d" ? (
        <div className={domeOn ? "ac-section" : "ac-section is-muted"} role="group" aria-label="Sun dome size">
          <div className="ac-slider-head">
            <span className="ac-kicker">Sun dome size</span>
            <output className="ac-value mono" aria-live="polite">
              {Math.round(sunDome.radiusM)} m
            </output>
          </div>
          <div className="ac-slider-row">
            <span aria-hidden="true">0.5×</span>
            <span className="wind-streaks-track" style={domeTrack}>
              <span className="wind-streaks-tick" aria-hidden="true" />
              <input
                className="wind-streaks-input"
                type="range"
                aria-label="Sun dome size"
                aria-valuetext={`${Math.round(sunDome.radiusM)} m${sunDome.chosenM == null ? ", auto" : ""}`}
                min={Math.round(sunDome.range.minM)}
                max={Math.round(sunDome.range.maxM)}
                step={1}
                value={Math.round(sunDome.radiusM)}
                disabled={!domeOn}
                onChange={(event) => setSunDomeSizeM(sunDomeSizeFromSlider(sunDome.range, Number(event.target.value)))}
              />
            </span>
            <span aria-hidden="true">2× cut</span>
          </div>
          <p className="ac-note">{sunDomeSizeNote(sunDome.range, domeOn)}</p>
        </div>
      ) : null}

      {sunHoursLegendOn ? (
        <div className="ac-section">
          <div className="ac-seg ac-seg-2" role="group" aria-label="Sun hours window">
            {SUN_HOURS_WINDOW_IDS.map((windowId) => {
              const active = sunHoursWindow === windowId;
              return (
                <button
                  key={windowId}
                  type="button"
                  className={active ? "ac-seg-btn is-ink" : "ac-seg-btn"}
                  aria-pressed={active}
                  onClick={() => commitSolar({ ...solar, sunHoursWindow: windowId })}
                >
                  {SUN_HOURS_WINDOWS[windowId].label}
                </button>
              );
            })}
          </div>
          {overlay("Colour only selected", sunHoursPickedOnly, () =>
            commitSolar({ ...solar, sunHoursPickedOnly: !sunHoursPickedOnly }),
          )}
          {sunHoursPickedOnly && sunHoursPickedIds.length === 0 ? (
            <p className="ac-note" data-sun-hours-pick-hint>
              {tab === "3d" ? SUN_HOURS_PICK_HINT_3D : SUN_HOURS_PICK_HINT_PLAN}
            </p>
          ) : null}
          <SunHoursLegendDock sunHoursGround={sunHoursGround} embedded pickedOnly={sunHoursPickedOnly} />
        </div>
      ) : null}
    </AnalysisHudCard>
  );
}
