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
    <div className="ac-seg ac-seg-compact design-wind-presets" role="group" aria-label="Design winds">
      {winds.map((wind) => (
        <button
          key={wind.id}
          type="button"
          className={selectedId === wind.id ? "ac-seg-btn is-ink" : "ac-seg-btn"}
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
