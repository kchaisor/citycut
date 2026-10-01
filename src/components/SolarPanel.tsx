import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { SOLAR_PRESETS, dayOfYear, dateFromDayOfYear, type SolarPresetId } from "../lib/solar";
import type { SolarViewSettings } from "./SolarHeliodon";

export function SolarPanel({
  settings,
  onChange,
}: {
  settings: SolarViewSettings;
  onChange: (next: SolarViewSettings) => void;
}) {
  const [open, setOpen] = useState(true);
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
          <p className="field-note solar-compass-note" aria-hidden>
            Compass at ground level: N toward −Z (true north). E +X, S +Z, W −X.
          </p>
        )}
      </div>
    </div>
  );
}
