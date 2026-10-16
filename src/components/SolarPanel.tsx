import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { getColour, type ColourKey } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import {
  HELIODON_RADIUS_FACTOR_MAX,
  HELIODON_RADIUS_FACTOR_MIN,
  heliodonRadiusM,
} from "../lib/heliodonRadius";
import type { SolarViewSettings } from "./SolarHeliodon";
import { SunStudyPlayer } from "./SunStudyPlayer";

const SOLAR_LEGEND: { key: ColourKey; label: string; dash?: string }[] = [
  { key: "--sun-arc-summer", label: "Dec 22 (summer solstice)" },
  { key: "--sun-arc-equinox", label: "Sep/Mar (equinox)", dash: "4 3" },
  { key: "--sun-arc-winter", label: "Jun 21 (winter solstice)", dash: "6 2.5 1.2 2.5" },
];

export function SolarPanel({
  settings,
  onChange,
  sideM,
  embedded = false,
  site,
}: {
  settings: SolarViewSettings;
  onChange: (next: SolarViewSettings) => void;
  sideM: number;
  /** When true, render inside the left drawer without the floating panel chrome. */
  embedded?: boolean;
  /** Site lat/lon for the sun sweep. */
  site?: { lat: number; lon: number };
}) {
  const [open, setOpen] = useState(true);
  useColourRevision();
  const panelId = useId();

  function patch(partial: Partial<SolarViewSettings>) {
    onChange({ ...settings, ...partial });
  }

  return (
    <div className={embedded ? "solar-drawer" : "solar-panel"}>
      {!embedded && (
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
      )}
      <div id={panelId} className="solar-panel-body" hidden={!embedded && !open}>
        {site && <SunStudyPlayer settings={settings} onChange={onChange} lat={site.lat} lon={site.lon} />}
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
        {settings.showPath && (
          <label className="field">
            <span className="kicker">Sun path size (× site half-width)</span>
            <input
              type="range"
              min={HELIODON_RADIUS_FACTOR_MIN}
              max={HELIODON_RADIUS_FACTOR_MAX}
              step={0.05}
              value={settings.radiusFactor}
              onChange={(event) => patch({ radiusFactor: Number(event.target.value) })}
            />
            <span className="field-note">
              {settings.radiusFactor.toFixed(2)}× · {Math.round(heliodonRadiusM(sideM, settings.radiusFactor))} m radius.
            </span>
          </label>
        )}
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
              Dots mark each clock hour (AEST/AEDT). Faint rings are 30° and 60° sun altitude. Lines behind buildings are ghosted.
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
