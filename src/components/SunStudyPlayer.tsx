import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SUN_STUDY_DATES, daylightWindowMinutes, melbourneZoneName, melbourneLocalToUtc, sweepMinute } from "../lib/solar";
import type { SolarViewSettings } from "./SolarHeliodon";

/** Sun-time hours per real second. */
const SPEEDS = [0.5, 1, 2, 4] as const;

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * MOCK: animated sun and shadow study. Sweeps the existing sun (same site lat/lon, Melbourne
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
  const window_ = daylightWindowMinutes(lat, lon, settings.year, settings.month, settings.day);
  const minutes = settings.hour * 60 + settings.minute;

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    fraction.current = latest.current.settings.hour * 60 + latest.current.settings.minute;
    const tick = (now: number) => {
      const { settings: s, onChange: commit, speed: hps } = latest.current;
      const w = daylightWindowMinutes(lat, lon, s.year, s.month, s.day);
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
  const zone = melbourneZoneName(melbourneLocalToUtc(settings.year, settings.month, settings.day, 12, 0));

  return (
    <div className="sun-study" role="group" aria-label="Sun study">
      <div className="sun-study-dates" role="radiogroup" aria-label="Day">
        {SUN_STUDY_DATES.map((d) => {
          const on = settings.month === d.month && settings.day === d.day;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={on ? "shape-btn on" : "shape-btn"}
              onClick={() => {
                const w = daylightWindowMinutes(lat, lon, settings.year, d.month, d.day);
                const clamped = w ? Math.min(w.sunset, Math.max(w.sunrise, minutes)) : minutes;
                fraction.current = clamped;
                patch({ month: d.month, day: d.day, hour: Math.floor(clamped / 60), minute: clamped % 60 });
              }}
            >
              {d.label}
            </button>
          );
        })}
        <input
          className="sun-study-date"
          type="date"
          aria-label="Other day"
          value={`${settings.year}-${String(settings.month).padStart(2, "0")}-${String(settings.day).padStart(2, "0")}`}
          onChange={(event) => {
            const [y, m, d] = event.target.value.split("-").map(Number);
            if (y && m && d) patch({ year: y, month: m, day: d });
          }}
        />
      </div>
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
          {clock(minutes)} <span className="sun-study-zone">{zone}</span>
        </span>
      </div>
      <div className="sun-study-row sun-study-foot">
        <span className="sun-study-window">
          {window_ ? `Sunrise ${clock(window_.sunrise)} · Sunset ${clock(window_.sunset)}` : "No sunrise"}
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
      <label className="check-field">
        <input
          type="checkbox"
          checked={settings.sunHours ?? false}
          onChange={(event) => patch({ sunHours: event.target.checked })}
        />
        <span>Hours of sun (preview)</span>
      </label>
    </div>
  );
}
