import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  SHADOW_STANDARDS,
  SUN_STUDY_DATES,
  daylightWindowMinutes,
  melbourneLocalToUtc,
  melbourneZoneName,
  shadowStandardStepLabel,
  sweepMinute,
  type ShadowStandardId,
} from "../lib/solar";
import type { SolarViewSettings } from "./SolarHeliodon";

/** Sun-time hours per real second. */
const SPEEDS = [0.5, 1, 2, 4] as const;

/** "9:30", "09:30" or "0930" to minutes past midnight; null when not a real clock time. */
export function parseClock(text: string): number | null {
  const m = /^\s*(\d{1,2}):?(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Animated sun and shadow study. Sweeps the existing sun (same site lat/lon, Melbourne
 * clock, SunCalc) from sunrise to sunset on a chosen day. Only the sun moves; the camera is
 * never touched. Playing switches cast shadows on.
 */
export function SunStudyPlayer({
  settings,
  onChange,
  lat,
  lon,
}: {
  settings: SolarViewSettings;
  onChange: (next: SolarViewSettings) => void;
  lat: number;
  lon: number;
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const latest = useRef({ settings, onChange, speed });
  latest.current = { settings, onChange, speed };
  const fraction = useRef(settings.hour * 60 + settings.minute);
  const [standardId, setStandardId] = useState<ShadowStandardId | null>(null);
  const standardRef = useRef(standardId);
  standardRef.current = standardId;
  const daylight = daylightWindowMinutes(lat, lon, settings.year, settings.month, settings.day);
  const standard = standardId ? SHADOW_STANDARDS[standardId] : null;
  /** A shadow standard narrows the sweep and scrubber to its test hours (e.g. 9am–3pm). */
  const window_ = standard
    ? { sunrise: standard.hours[0]! * 60, sunset: standard.hours[standard.hours.length - 1]! * 60 }
    : daylight;
  const minutes = settings.hour * 60 + settings.minute;
  const [editing, setEditing] = useState<string | null>(null);
  /** Typed HH:MM, snapped into the slider range; invalid text leaves the time unchanged. */
  const commitTyped = () => {
    const typed = editing === null ? null : parseClock(editing);
    setEditing(null);
    if (typed === null) return;
    const lo = window_?.sunrise ?? 0;
    const hi = window_?.sunset ?? 1439;
    const v = Math.min(hi, Math.max(lo, typed));
    fraction.current = v;
    patch({ hour: Math.floor(v / 60), minute: v % 60 });
  };

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    fraction.current = latest.current.settings.hour * 60 + latest.current.settings.minute;
    const tick = (now: number) => {
      const { settings: s, onChange: commit, speed: hps } = latest.current;
      const sid = standardRef.current;
      const w = sid
        ? { sunrise: SHADOW_STANDARDS[sid].hours[0]! * 60, sunset: SHADOW_STANDARDS[sid].hours[SHADOW_STANDARDS[sid].hours.length - 1]! * 60 }
        : daylightWindowMinutes(lat, lon, s.year, s.month, s.day);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (w) {
        fraction.current = sweepMinute(fraction.current, dt, hps, w);
        const whole = Math.floor(fraction.current);
        if (whole !== s.hour * 60 + s.minute) {
          commit({ ...s, castShadows: true, hour: Math.floor(whole / 60), minute: whole % 60 });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, lat, lon]);

  const patch = (partial: Partial<SolarViewSettings>) => onChange({ ...settings, ...partial });
  const stepHour = (delta: number) => {
    if (!standard) return;
    const hours = standard.hours;
    // Exact test hour → step from it; between hours → step to the neighbour in that direction.
    const below = hours.filter((h) => h * 60 <= minutes).length - 1;
    const exact = below >= 0 && hours[below]! * 60 === minutes;
    const from = exact ? below : delta > 0 ? below : below + 1;
    const index = Math.min(hours.length - 1, Math.max(0, from + delta));
    const hour = hours[index]!;
    fraction.current = hour * 60;
    patch({ hour, minute: 0 });
  };
  const zone = melbourneZoneName(melbourneLocalToUtc(settings.year, settings.month, settings.day, 12, 0));

  return (
    <div className="sun-study" role="group" aria-label="Sun study">
      <h4 className="sun-study-kicker">Key dates</h4>
      <div className="sun-study-cards" role="radiogroup" aria-label="Day">
        {SUN_STUDY_DATES.map((d) => {
          const on = !standardId && settings.month === d.month && settings.day === d.day;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={d.label}
              className={on ? "sun-study-card on" : "sun-study-card"}
              onClick={() => {
                const w = daylightWindowMinutes(lat, lon, settings.year, d.month, d.day);
                const clamped = w ? Math.min(w.sunset, Math.max(w.sunrise, minutes)) : minutes;
                fraction.current = clamped;
                setStandardId(null);
                patch({ month: d.month, day: d.day, hour: Math.floor(clamped / 60), minute: clamped % 60 });
              }}
            >
              <span className="sun-study-card-name">{d.name}</span>
              <span className="sun-study-card-date">{d.label}</span>
              <span className="sun-study-card-why">{d.why}</span>
            </button>
          );
        })}
      </div>
      <label className="sun-study-other">
        <span>Date</span>
        <input
          className="sun-study-date"
          type="date"
          aria-label="Date"
          value={`${settings.year}-${String(settings.month).padStart(2, "0")}-${String(settings.day).padStart(2, "0")}`}
          onChange={(event) => {
            const [y, m, d] = event.target.value.split("-").map(Number);
            if (y && m && d) {
              setStandardId(null);
              patch({ year: y, month: m, day: d });
            }
          }}
        />
      </label>
      <h4 className="sun-study-kicker">Assessment presets</h4>
      <div className="sun-study-cards sun-study-presets" role="radiogroup" aria-label="Victorian shadow standards">
        {(Object.keys(SHADOW_STANDARDS) as ShadowStandardId[]).map((id) => {
          const set = SHADOW_STANDARDS[id];
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={standardId === id}
              aria-label={set.label}
              className={standardId === id ? "sun-study-card on" : "sun-study-card"}
              title={set.source}
              onClick={() => {
                setStandardId(id);
                fraction.current = set.hours[0]! * 60;
                patch({ month: set.month, day: set.day, hour: set.hours[0]!, minute: 0, castShadows: true });
              }}
            >
              <span className="sun-study-card-name">{set.label}</span>
              <span className="sun-study-card-why">{set.detail}</span>
            </button>
          );
        })}
      </div>
      <h4 className="sun-study-kicker">Time</h4>
      <div className="sun-study-row">
        <button
          type="button"
          className="sun-study-play"
          aria-label={playing ? "Pause sun sweep" : "Play sun sweep"}
          aria-pressed={playing}
          onClick={() => {
            if (!playing && !settings.castShadows) patch({ castShadows: true });
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} strokeWidth={1.75} /> : <Play size={16} strokeWidth={1.75} />}
        </button>
        <input
          className="sun-study-scrub"
          type="range"
          aria-label="Time of day"
          min={window_?.sunrise ?? 0}
          max={window_?.sunset ?? 1439}
          step={1}
          value={Math.min(window_?.sunset ?? 1439, Math.max(window_?.sunrise ?? 0, minutes))}
          onChange={(event) => {
            const v = Number(event.target.value);
            fraction.current = v;
            patch({ hour: Math.floor(v / 60), minute: v % 60 });
          }}
        />
        <span className="sun-study-time">
          {editing !== null ? (
            <input
              className="sun-study-time-input"
              aria-label="Type time (HH:MM)"
              autoFocus
              inputMode="numeric"
              maxLength={5}
              value={editing}
              aria-invalid={parseClock(editing) === null}
              onChange={(event) => setEditing(event.target.value)}
              onBlur={() => commitTyped()}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitTyped();
                if (event.key === "Escape") setEditing(null);
              }}
            />
          ) : (
            <button type="button" className="sun-study-time-btn" aria-label={`Time ${clock(minutes)}, click to type`} onClick={() => setEditing(clock(minutes))}>
              {clock(minutes)}
            </button>
          )}{" "}
          <span className="sun-study-zone">{zone}</span>
        </span>
      </div>
      <div className="sun-study-row sun-study-foot">
        <span className="sun-study-window">
          {standard && window_
            ? `Test window ${clock(window_.sunrise)}–${clock(window_.sunset)}`
            : daylight
              ? `Sunrise ${clock(daylight.sunrise)} · Sunset ${clock(daylight.sunset)}`
              : "No sunrise"}
        </span>
        <div className="sun-study-speed" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={speed === s}
              className={speed === s ? "shape-btn on" : "shape-btn"}
              onClick={() => setSpeed(s)}
              title={`${s} h of sun per second`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
      {standard && standardId && (
        <div className="solar-stepper">
          <div className="solar-stepper-row" role="group" aria-label="Hour in the shadow standard">
            <button
              type="button"
              className="solar-step"
              aria-label="Previous hour"
              disabled={settings.hour <= standard.hours[0]!}
              onClick={() => stepHour(-1)}
            >
              <ChevronLeft size={14} strokeWidth={1.75} aria-hidden />
            </button>
            {standard.hours.map((hour) => (
              <button
                key={hour}
                type="button"
                className="solar-hour"
                aria-pressed={settings.hour === hour && settings.minute === 0}
                onClick={() => {
                  fraction.current = hour * 60;
                  patch({ hour, minute: 0 });
                }}
              >
                {hour > 12 ? hour - 12 : hour}
              </button>
            ))}
            <button
              type="button"
              className="solar-step"
              aria-label="Next hour"
              disabled={settings.hour >= standard.hours[standard.hours.length - 1]!}
              onClick={() => stepHour(1)}
            >
              <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <p className="field-note" aria-live="polite">
            {standard.hours.includes(settings.hour) && settings.minute === 0
              ? shadowStandardStepLabel(standardId, settings.year, standard.hours.indexOf(settings.hour))
              : `${clock(minutes)} ${zone}`}
          </p>
          <p className="field-note">{standard.source}</p>
        </div>
      )}
    </div>
  );
}
