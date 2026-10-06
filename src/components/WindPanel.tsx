import { useId } from "react";
import { WIND_PERIOD_LABELS, monthPeriodLabel, type WindPeriodId } from "../lib/windRose";
import type { WindViewSettings } from "../lib/windState";

const PERIOD_OPTIONS: { id: WindPeriodId; label: string }[] = [
  { id: "annual", label: WIND_PERIOD_LABELS.annual },
  { id: "summer", label: WIND_PERIOD_LABELS.summer },
  { id: "autumn", label: WIND_PERIOD_LABELS.autumn },
  { id: "winter", label: WIND_PERIOD_LABELS.winter },
  { id: "spring", label: WIND_PERIOD_LABELS.spring },
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const).map((m) => ({
    id: `month-${m}` as WindPeriodId,
    label: monthPeriodLabel(m),
  })),
];

export function WindPanel({
  settings,
  onChange,
  note,
  embedded = true,
}: {
  settings: WindViewSettings;
  onChange: (next: WindViewSettings) => void;
  note?: string | null;
  embedded?: boolean;
}) {
  const panelId = useId();

  function patch(partial: Partial<WindViewSettings>) {
    onChange({ ...settings, ...partial });
  }

  return (
    <div className={embedded ? "wind-drawer" : "wind-panel"}>
      <div id={panelId} className="wind-panel-body">
        <label className="check-field">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          Wind on
        </label>
        {note && <p className="field-note">{note}</p>}
        <label className="field">
          <span className="kicker">Period</span>
          <select
            value={settings.period}
            disabled={!settings.enabled}
            onChange={(event) => patch({ period: event.target.value as WindPeriodId })}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={settings.showRose}
            disabled={!settings.enabled}
            onChange={(event) => patch({ showRose: event.target.checked })}
          />
          Show rose
        </label>
      </div>
    </div>
  );
}
