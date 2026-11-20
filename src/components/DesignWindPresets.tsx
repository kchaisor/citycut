import type { DesignWind, DesignWindId } from "../lib/windDesignWinds";

export function DesignWindPresets({
  winds,
  selectedId,
  onSelect,
}: {
  winds: readonly DesignWind[];
  selectedId: DesignWindId | null;
  onSelect: (id: DesignWindId) => void;
}) {
  if (winds.length === 0) return null;
  return (
    <div className="date-presets design-wind-presets" role="group" aria-label="Design winds">
      <span className="design-wind-kicker" aria-hidden="true">
        Design winds
      </span>
      {winds.map((wind) => (
        <button
          key={wind.id}
          type="button"
          className={selectedId === wind.id ? "p-pill active" : "p-pill"}
          aria-label={`Design wind ${wind.label}`}
          aria-pressed={selectedId === wind.id}
          title={`Design wind ${wind.label} · ${wind.headingDeg}° · ${Math.round(wind.sharePct)}% of hours`}
          onClick={() => onSelect(wind.id)}
        >
          {wind.label}
        </button>
      ))}
    </div>
  );
}
