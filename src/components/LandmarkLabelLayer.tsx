import { useLayoutEffect, useState } from "react";
import { measureLabelText } from "../lib/landmarkLabelText";
import {
  LANDMARK_PILL_HEIGHT_PX,
  pillWidth,
  placeLandmarkLabels,
  type ScreenBox,
} from "../lib/landmarkLabels";
import type { LandmarkScreenLabel, LandmarkScreenState } from "./LandmarkLabelProjector";

export const LANDMARK_HUD_OBSTACLES = [
  ".model .top-bar-left",
  ".model .top-bar-center",
  ".model .top-bar-right",
  ".model .left-rail",
  ".model .left-tool-rail",
  ".model .left-outliner",
  ".model .right-inspector",
  ".model .bottom-bar",
  ".model .studio-compass",
  ".building-detail-panel",
  ".inspect-hud",
].join(", ");

export function hudObstacles(): ScreenBox[] {
  if (typeof document === "undefined") return [];
  const boxes: ScreenBox[] = [];
  for (const el of document.querySelectorAll(LANDMARK_HUD_OBSTACLES)) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
    boxes.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
  }
  return boxes;
}

export function LandmarkLabelLayer({
  state,
  hiddenId,
  onSelect,
}: {
  state: LandmarkScreenState | null;
  hiddenId: number | null;
  onSelect: (label: LandmarkScreenLabel) => void;
}) {
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set());
  const labels = state?.labels ?? [];

  useLayoutEffect(() => {
    if (!state || state.moving) return;
    const frame = requestAnimationFrame(() => {
      const candidates = state.labels.map((label) => ({
        ...label,
        id: label.buildingId,
        width: pillWidth(measureLabelText(label.name)),
        height: LANDMARK_PILL_HEIGHT_PX,
      }));
      const placed = placeLandmarkLabels(candidates, hudObstacles(), {
        hiddenId,
        bounds: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
      });
      setShown(new Set(placed.map((label) => label.buildingId)));
    });
    return () => cancelAnimationFrame(frame);
  }, [state, hiddenId]);

  if (labels.length === 0) return null;
  return (
    <div className="landmark-label-layer" data-landmark-labels="3d">
      {labels.map((label) => {
        const visible = !state?.moving && shown.has(label.buildingId) && label.buildingId !== hiddenId;
        return (
          <button
            key={label.buildingId}
            type="button"
            className={visible ? "landmark-label is-visible" : "landmark-label"}
            style={{ left: label.x, top: label.y }}
            title={label.name}
            aria-hidden={visible ? undefined : true}
            tabIndex={visible ? 0 : -1}
            data-building-id={label.buildingId}
            onClick={() => onSelect(label)}
          >
            {label.name}
          </button>
        );
      })}
    </div>
  );
}
