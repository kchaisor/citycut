import { defaultParkRuleId } from "../lib/solarRuleRegistry";
import type { SolarViewSettings } from "./SolarHeliodon";

export function SolarAccessConsole({
  settings,
  onChange,
  canMarkReceptors,
  hasProposedMassing,
}: {
  settings: SolarViewSettings;
  onChange: (next: SolarViewSettings) => void;
  canMarkReceptors: boolean;
  hasProposedMassing: boolean;
}) {
  function patch(partial: Partial<SolarViewSettings>) {
    onChange({ ...settings, ...partial });
  }

  return (
    <div className="env-solar-access-row" data-solar-access-console>
      {!hasProposedMassing && (
        <p className="env-solar-hint" data-solar-massing-hint>
          Draw proposed massing first (Massing tool, 3D view) — then open <strong>Drawing</strong> for shadows, B4-3
          receptors, parks, and the hours-lost heatmap.
        </p>
      )}
      <div className="env-solar-access-chips" role="group" aria-label="Solar access compliance and overlays">
        <button
          type="button"
          className={settings.solarAccess ? "ov-chip on" : "ov-chip"}
          aria-pressed={Boolean(settings.solarAccess)}
          onClick={() =>
            patch({
              solarAccess: !settings.solarAccess,
              sunStudy: true,
              month: 9,
              day: 22,
              castShadows: true,
              receptorDraw: !settings.solarAccess ? true : settings.receptorDraw,
            })
          }
        >
          <span className="ov-dot" aria-hidden="true" />
          B4-3 receptors
        </button>
        <button
          type="button"
          className={settings.solarParkAccess ? "ov-chip on" : "ov-chip"}
          aria-pressed={Boolean(settings.solarParkAccess)}
          onClick={() =>
            patch({
              solarParkAccess: !settings.solarParkAccess,
              parkRuleId: settings.parkRuleId ?? defaultParkRuleId(),
              castShadows: true,
              parkReceptorDraw: !settings.solarParkAccess ? true : settings.parkReceptorDraw,
            })
          }
        >
          <span className="ov-dot" aria-hidden="true" />
          Parks
        </button>
        {canMarkReceptors && (
          <button
            type="button"
            className={settings.sunHoursLost ? "ov-chip on" : "ov-chip"}
            aria-pressed={Boolean(settings.sunHoursLost)}
            onClick={() =>
              patch({
                sunHoursLost: !settings.sunHoursLost,
                sunStudy: true,
                month: 9,
                day: 22,
                castShadows: true,
              })
            }
          >
            <span className="ov-dot" aria-hidden="true" />
            Hours lost
          </button>
        )}
        <button
          type="button"
          className={settings.treesCastShadow ? "ov-chip on" : "ov-chip"}
          aria-pressed={Boolean(settings.treesCastShadow)}
          onClick={() => patch({ treesCastShadow: !settings.treesCastShadow, castShadows: true })}
        >
          <span className="ov-dot" aria-hidden="true" />
          Tree shadows
        </button>
        <button
          type="button"
          className={settings.facadeSolarAccess ? "ov-chip on" : "ov-chip"}
          aria-pressed={Boolean(settings.facadeSolarAccess)}
          onClick={() =>
            patch({
              facadeSolarAccess: !settings.facadeSolarAccess,
              month: 6,
              day: 21,
              hour: 12,
              castShadows: true,
            })
          }
        >
          <span className="ov-dot" aria-hidden="true" />
          Facade hours (ADG)
        </button>
        {canMarkReceptors && settings.solarAccess && (
          <button
            type="button"
            className={settings.receptorDraw ? "ov-chip on" : "ov-chip"}
            aria-pressed={Boolean(settings.receptorDraw)}
            onClick={() => patch({ receptorDraw: !settings.receptorDraw })}
          >
            <span className="ov-dot" aria-hidden="true" />
            Draw yard box
          </button>
        )}
        {canMarkReceptors && settings.solarParkAccess && (
          <button
            type="button"
            className={settings.parkReceptorDraw ? "ov-chip on" : "ov-chip"}
            aria-pressed={Boolean(settings.parkReceptorDraw)}
            onClick={() => patch({ parkReceptorDraw: !settings.parkReceptorDraw })}
          >
            <span className="ov-dot" aria-hidden="true" />
            Draw park
          </button>
        )}
      </div>
      <p className="env-solar-hint is-compact" data-solar-access-guide-console>
        Compliance toggles also live in the hidden left drawer — use these chips while Analysis is open. Results dock
        appears bottom-left on the plan.
      </p>
    </div>
  );
}
