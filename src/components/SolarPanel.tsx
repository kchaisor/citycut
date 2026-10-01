import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { SOLAR_PRESETS, dayOfYear, dateFromDayOfYear, type SolarPresetId } from "../lib/solar";
import { getColour, type ColourKey } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import type { SolarViewSettings } from "./SolarHeliodon";

const SOLAR_LEGEND: { key: ColourKey; label: string; dash?: string }[] = [
  { key: "--sun-arc-summer", label: "Dec 21 (summer solstice)" },
  { key: "--sun-arc-equinox", label: "Sep/Mar (equinox)", dash: "4 3" },
  { key: "--sun-arc-winter", label: "Jun 21 (winter solstice)", dash: "6 2.5 1.2 2.5" },
];

export function SolarPanel({
  settings,
  onChange,
}: {
  settings: SolarViewSettings;
  onChange: (next: SolarViewSettings) => void;
}) {
  const [open, setOpen] = useState(true);
  useColourRevision();
  const panelId = useId();
  const doy = dayOfYear(settings.year, settings.month, settings.day);
  const minutes = settings.hour * 60 + settings.minute;

  function patch(partial: Partial<SolarViewSettings>) {
    onChange({ ...settings, ...partial });
  }

  function applyPreset(id: SolarPresetId) {
    const preset = SOLAR_PRESETS[id];
    patch({ month: preset.month, day: preset.day, hour: preset.hour, minute: preset.minute });
  }

  return (
    <div className="solar-panel">
      <button
        type="button"
        className="solar-panel-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Solar</span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden className={open ? "is-open" : undefined} />
      </button>
      <div id={panelId} className="solar-panel-body" hidden={!open}>
        <label className="check-field">
          <input
            type="checkbox"
            checked={settings.showPath}
            onChange={(event) => patch({ showPath: event.target.checked })}
          />
          Show sun path &amp; compass
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={settings.castShadows}
            onChange={(event) => patch({ castShadows: event.target.checked })}
          />
          Cast real-time shadows
        </label>
        <label className="field">
          <span className="kicker">Time (Melbourne)</span>
          <input
            type="range"
            min={360}
            max={1080}
            step={15}
            value={minutes}
            onChange={(event) => {
              const total = Number(event.target.value);
              patch({ hour: Math.floor(total / 60), minute: total % 60 });
            }}
          />
          <span className="field-note">
            {String(settings.hour).padStart(2, "0")}:{String(settings.minute).padStart(2, "0")}
          </span>
        </label>
        <label className="field">
          <span className="kicker">Day of year ({settings.year})</span>
          <input
            type="range"
            min={1}
            max={365}
            step={1}
            value={doy}
            onChange={(event) => {
              const next = dateFromDayOfYear(settings.year, Number(event.target.value));
              patch({ month: next.month, day: next.day });
            }}
          />
          <span className="field-note">
            {settings.year}-{String(settings.month).padStart(2, "0")}-{String(settings.day).padStart(2, "0")}
          </span>
        </label>
        <div className="panel-toolbar">
          {(Object.keys(SOLAR_PRESETS) as SolarPresetId[]).map((id) => (
            <button key={id} type="button" onClick={() => applyPreset(id)}>
              {SOLAR_PRESETS[id].label}
            </button>
          ))}
        </div>
        {settings.showPath && (
          <ul className="solar-legend" aria-label="Sun path legend">
            {SOLAR_LEGEND.map((entry) => (
              <li key={entry.key}>
                <svg className="solar-legend-swatch" viewBox="0 0 24 6" aria-hidden>
                  <line x1="0" y1="3" x2="24" y2="3" stroke={getColour(entry.key)} strokeWidth="1.4" strokeDasharray={entry.dash} />
                </svg>
                {entry.label}
              </li>
            ))}
            <li>
              <svg className="solar-legend-swatch" viewBox="0 0 24 12" aria-hidden>
                <circle cx="12" cy="6" r="3.2" fill={getColour("--sun-marker")} stroke={getColour("--sun-compass-label")} strokeWidth="0.8" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                  <line
                    key={deg}
                    x1={12 + Math.cos((deg * Math.PI) / 180) * 4.2}
                    y1={6 + Math.sin((deg * Math.PI) / 180) * 4.2}
                    x2={12 + Math.cos((deg * Math.PI) / 180) * 5.8}
                    y2={6 + Math.sin((deg * Math.PI) / 180) * 5.8}
                    stroke={getColour("--sun-compass-label")}
                    strokeWidth="0.9"
                  />
                ))}
              </svg>
              Sun now
            </li>
            <li>
              <svg className="solar-legend-swatch" viewBox="0 0 24 6" aria-hidden>
                <line x1="0" y1="3" x2="24" y2="3" stroke={getColour("--sun-compass")} strokeWidth="1" strokeDasharray="1.2 1.2" />
              </svg>
              Same clock hour across the three dates
            </li>
            <li className="solar-legend-note">
              Dots mark each clock hour (AEST/AEDT). Dial rings are sun altitude every 10°. Lines behind buildings are ghosted.
            </li>
          </ul>
        )}
        {settings.showPath && (
          <p className="field-note solar-compass-note" aria-hidden>
            Compass at ground level: N toward −Z (true north). E +X, S +Z, W −X.
          </p>
        )}
      </div>
    </div>
  );
}
