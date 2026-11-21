import { useLayoutEffect, useState } from "react";
import { measureLabelText } from "../lib/landmarkLabelText";
import { LANDMARK_PILL_HEIGHT_PX, pillWidth, placeLandmarkLabels } from "../lib/landmarkLabels";
import type { ImportedScreenLabel } from "../lib/importedLabels";
import type { ImportedLabelState } from "./ImportedLabelProjector";
import { hudObstacles } from "./LandmarkLabelLayer";

function labelKey(label: Pick<ImportedScreenLabel, "fileId" | "buildingId">): string {
  return `${label.fileId}\u0000${label.buildingId}`;
}

export function ImportedLabelLayer({
  state,
  onSelect,
}: {
  state: ImportedLabelState | null;
  onSelect: (label: ImportedScreenLabel) => void;
}) {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const labels = state?.labels ?? [];

  useLayoutEffect(() => {
    if (!state || state.moving) return;
    const frame = requestAnimationFrame(() => {
      const candidates = state.labels.map((label, index) => ({
        ...label,
        id: index,
        rank: state.labels.length - index,
        width: pillWidth(measureLabelText(label.name)),
        height: LANDMARK_PILL_HEIGHT_PX,
      }));
      const placed = placeLandmarkLabels(candidates, hudObstacles(), {
        bounds: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
      });
      setShown(new Set(placed.map(labelKey)));
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);

  if (labels.length === 0) return null;
  return (
    <div className="landmark-label-layer" data-imported-labels="3d">
      {labels.map((label) => {
        const key = labelKey(label);
        const visible = !state?.moving && shown.has(key);
        return (
          <button
            key={key}
            type="button"
            className={visible ? "landmark-label is-visible" : "landmark-label"}
            style={{ left: label.x, top: label.y }}
            title={label.name}
            aria-hidden={visible ? undefined : true}
            tabIndex={visible ? 0 : -1}
            data-imported-building-id={label.buildingId}
            onClick={() => onSelect(label)}
          >
            {label.name}
          </button>
        );
      })}
    </div>
  );
}
