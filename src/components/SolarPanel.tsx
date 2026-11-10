import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { getColour, type ColourKey } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import {
  HELIODON_RADIUS_FACTOR_MAX,
  HELIODON_RADIUS_FACTOR_MIN,
  heliodonRadiusM,
} from "../lib/heliodonRadius";
import { RESCODE_B43_STEP_MINUTES } from "../lib/solarAccessB43";
import { SUN_HOURS_LOST_CELL_M } from "../lib/sunHoursLost";
import { SunHoursLostLegendList } from "./SunHoursLostLegendList";
import { SUN_STUDY_SHADOW_ADDED_OPACITY, SUN_STUDY_SHADOW_OPACITY } from "../lib/sunStudyPlan";
import { PARK_NO_ADDITIONAL_TOLERANCE_M2, PARK_SOLAR_RULE_IDS, defaultParkRuleId, solarRuleDefinition } from "../lib/solarRuleRegistry";
import type { SolarAssessRow } from "../lib/solarReceptorAssess";
import type { SolarViewSettings } from "./SolarHeliodon";
import { SolarAssessResultsList } from "./SolarAssessResultsList";
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
  selectedCount = 0,
  onClearSelection,
  canMarkReceptors = false,
  receptorCount = 0,
  receptorAssess = [],
  receptorAssessPending = false,
  onClearReceptors,
  sunHoursLostPending = false,
  parkGreenAreas = [],
  onAddParkFromArea,
  parkReceptorCount = 0,
  onClearParkReceptors,
}: {
  settings: SolarViewSettings;
  onChange: (next: SolarViewSettings) => void;
  sideM: number;
  embedded?: boolean;
  site?: { lat: number; lon: number };
  selectedCount?: number;
  onClearSelection?: () => void;
  canMarkReceptors?: boolean;
  receptorCount?: number;
  receptorAssess?: SolarAssessRow[];
  receptorAssessPending?: boolean;
  onClearReceptors?: () => void;
  sunHoursLostPending?: boolean;
  parkGreenAreas?: { areaId: number; label: string }[];
  onAddParkFromArea?: (areaId: number) => void;
  parkReceptorCount?: number;
  onClearParkReceptors?: () => void;
}) {
  const [open, setOpen] = useState(true);
  useColourRevision();
  const panelId = useId();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  function patch(partial: Partial<SolarViewSettings>) {
    const next = { ...settingsRef.current, ...partial };
    settingsRef.current = next;
    onChange(next);
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
        <ol className="solar-access-guide" data-solar-access-guide aria-label="Solar access workflow">
          <li>Open <strong>Analysis</strong> (left rail), then the <strong>Drawing</strong> tab.</li>
          <li>Draw proposed <strong>massing</strong> on 3D or plan first (shadows need a proposal).</li>
          <li>Turn on <strong>B4-3</strong>, tick <strong>Mark receptor areas</strong>, drag rectangles on the site plan.</li>
          <li>Optional: <strong>Hours lost heatmap</strong> (22 Sep, needs massing). Results appear in the plan dock.</li>
          <li>Optional: <strong>Sun study</strong> shows 9am–3pm layers; scrub time in the player below.</li>
          <li><strong>Quick export SVG</strong> in Drawing downloads shadow + massing layers.</li>
        </ol>
        {site && (
          <SunStudyPlayer
            settings={settings}
            onChange={(next) =>
              patch({
                castShadows: next.castShadows,
                year: next.year,
                month: next.month,
                day: next.day,
                hour: next.hour,
                minute: next.minute,
              })
            }
            lat={site.lat}
            lon={site.lon}
          />
        )}
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
        <label className="check-field">
          <input
            type="checkbox"
            checked={Boolean(settings.solarAccess)}
            onChange={(event) => {
              const on = event.target.checked;
              patch({
                solarAccess: on,
                sunStudy: on ? true : settings.sunStudy,
                month: on ? 9 : settings.month,
                day: on ? 22 : settings.day,
                castShadows: on ? true : settings.castShadows,
              });
            }}
          />
          B4-3 / A4-3 overshadowing (22 Sep)
        </label>
        {settings.solarAccess && (
          <p className="field-note">
            Assessed at {RESCODE_B43_STEP_MINUTES}-minute steps, 9am–3pm ({settings.year}). Indicative only — councils may count fences and trees differently.
          </p>
        )}
        {settings.solarAccess && canMarkReceptors && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={Boolean(settings.receptorDraw)}
              onChange={(event) => patch({ receptorDraw: event.target.checked })}
            />
            Mark receptor areas on site plan
          </label>
        )}
        {settings.solarAccess && receptorCount > 0 && (
          <p className="field-note" data-solar-receptor-summary>
            {receptorAssessPending
              ? `Computing ${receptorCount} receptor${receptorCount === 1 ? "" : "s"}…`
              : `${receptorCount} receptor area${receptorCount === 1 ? "" : "s"} marked.`}
            {onClearReceptors && (
              <>
                {" "}
                <button type="button" className="link-button" onClick={onClearReceptors}>
                  Clear
                </button>
              </>
            )}
          </p>
        )}
        {settings.solarAccess && receptorAssess.some((row) => row.assessKind === "b43") && (
          <SolarAssessResultsList rows={receptorAssess.filter((row) => row.assessKind === "b43")} />
        )}
        <label className="check-field">
          <input
            type="checkbox"
            checked={Boolean(settings.solarParkAccess)}
            onChange={(event) => {
              const on = event.target.checked;
              patch({
                solarParkAccess: on,
                parkRuleId: settings.parkRuleId ?? defaultParkRuleId(),
                castShadows: on ? true : settings.castShadows,
              });
            }}
          />
          Parks / public realm (no additional shadow)
        </label>
        {settings.solarParkAccess && (
          <>
            <label className="field-note" htmlFor={`${panelId}-park-rule`}>
              Test rule
            </label>
            <select
              id={`${panelId}-park-rule`}
              className="mono"
              value={settings.parkRuleId ?? defaultParkRuleId()}
              onChange={(event) => patch({ parkRuleId: event.target.value })}
            >
              {PARK_SOLAR_RULE_IDS.map((ruleId) => {
                const rule = solarRuleDefinition(ruleId);
                return (
                  <option key={ruleId} value={ruleId}>
                    {rule.label} — {rule.statusNote}
                  </option>
                );
              })}
            </select>
            <p className="field-note">
              Pass when max added shadow ≤ {PARK_NO_ADDITIONAL_TOLERANCE_M2} m² per step ({settings.year}). Indicative only.
            </p>
            {canMarkReceptors && (
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={Boolean(settings.parkReceptorDraw)}
                  onChange={(event) => patch({ parkReceptorDraw: event.target.checked })}
                />
                Draw park test area on site plan
              </label>
            )}
            {parkGreenAreas.length > 0 && onAddParkFromArea && (
              <ul className="solar-park-pick-list" data-solar-park-pick-list>
                {parkGreenAreas.map((area) => (
                  <li key={area.areaId}>
                    <button type="button" className="link-button" onClick={() => onAddParkFromArea(area.areaId)}>
                      Add park from map: {area.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {parkReceptorCount > 0 && (
              <p className="field-note" data-solar-park-receptor-summary>
                {receptorAssessPending
                  ? `Computing ${parkReceptorCount} park test${parkReceptorCount === 1 ? "" : "s"}…`
                  : `${parkReceptorCount} park test area${parkReceptorCount === 1 ? "" : "s"}.`}
                {onClearParkReceptors && (
                  <>
                    {" "}
                    <button type="button" className="link-button" onClick={onClearParkReceptors}>
                      Clear parks
                    </button>
                  </>
                )}
              </p>
            )}
            {receptorAssess.some((row) => row.assessKind === "park") && (
              <SolarAssessResultsList rows={receptorAssess.filter((row) => row.assessKind === "park")} />
            )}
          </>
        )}
        <label className="check-field">
          <input
            type="checkbox"
            checked={Boolean(settings.treesCastShadow)}
            onChange={(event) => patch({ treesCastShadow: event.target.checked, castShadows: true })}
          />
          Trees cast shadow (visual only)
        </label>
        {canMarkReceptors && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={Boolean(settings.sunHoursLost)}
              onChange={(event) => {
                const on = event.target.checked;
                patch({
                  sunHoursLost: on,
                  sunStudy: on ? true : settings.sunStudy,
                  month: on ? 9 : settings.month,
                  day: on ? 22 : settings.day,
                  castShadows: on ? true : settings.castShadows,
                });
              }}
            />
            Hours lost heatmap (proposal)
          </label>
        )}
        {settings.sunHoursLost && (
          <>
            <p className="field-note" data-sun-hours-lost-note>
              22 Sep 9am–3pm at 15-minute steps · {SUN_HOURS_LOST_CELL_M} m cells around proposed massing.
              {sunHoursLostPending ? " Computing…" : ""}
            </p>
            <SunHoursLostLegendList includesTrees={Boolean(settings.treesCastShadow)} />
          </>
        )}
        <label className="check-field">
          <input
            type="checkbox"
            checked={Boolean(settings.sunStudy)}
            onChange={(event) => patch({ sunStudy: event.target.checked })}
          />
          Sun study on site plan (9am–3pm)
        </label>
        {settings.sunStudy && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.sunStudyMuted !== false}
              onChange={(event) => patch({ sunStudyMuted: event.target.checked })}
            />
            Muted base plan
          </label>
        )}
        {settings.sunStudy && (
          <ul className="solar-legend" aria-label="Shadow legend">
            <li>
              <svg className="solar-legend-swatch" viewBox="0 0 24 12" aria-hidden>
                <rect x="0" y="0" width="24" height="12" fill={getColour("--sun-study-shadow")} fillOpacity={SUN_STUDY_SHADOW_OPACITY} />
              </svg>
              Existing shadow
            </li>
            <li>
              <svg className="solar-legend-swatch" viewBox="0 0 24 12" aria-hidden>
                <defs>
                  <pattern id="solar-legend-added-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
                    <rect width="4" height="4" fill={getColour("--sun-study-shadow-added")} fillOpacity={SUN_STUDY_SHADOW_ADDED_OPACITY * 0.35} />
                    <line x1="0" y1="0" x2="0" y2="4" stroke={getColour("--sun-study-shadow-added")} strokeWidth="0.6" />
                  </pattern>
                </defs>
                <rect x="0" y="0" width="24" height="12" fill="url(#solar-legend-added-hatch)" />
              </svg>
              Added by proposal
            </li>
          </ul>
        )}
        {settings.sunStudy && (
          <div className="field sun-study-casters">
            <span className="kicker">Shadows from</span>
            <div className="segmented" role="group" aria-label="Sun study shadows from">
              <button
                type="button"
                aria-pressed={settings.sunStudyCasters !== "selected"}
                onClick={() => patch({ sunStudyCasters: "all" })}
              >
                All
              </button>
              <button
                type="button"
                aria-pressed={settings.sunStudyCasters === "selected"}
                onClick={() => patch({ sunStudyCasters: "selected" })}
              >
                Selected
              </button>
            </div>
            <span className="field-note" data-sun-study-selection>
              {selectedCount === 0
                ? "Click buildings on the site plan to select them."
                : `${selectedCount} building${selectedCount === 1 ? "" : "s"} selected. Click again to deselect.`}
              {selectedCount > 0 && onClearSelection && (
                <>
                  {" "}
                  <button type="button" className="link-button" onClick={onClearSelection}>
                    Clear
                  </button>
                </>
              )}
            </span>
          </div>
        )}
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
