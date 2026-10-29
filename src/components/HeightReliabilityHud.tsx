import { useMemo } from "react";
import {
  HEIGHT_RELIABILITY_CLASSES,
  HEIGHT_RELIABILITY_FILL_TOKEN,
  HEIGHT_RELIABILITY_LABEL,
  countHeightReliabilityClasses,
} from "../lib/buildingHeightReliability";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import type { BuildingFeat } from "../types";

export function HeightReliabilityHud({ buildings }: { buildings: readonly BuildingFeat[] }) {
  useColourRevision();
  const counts = useMemo(() => countHeightReliabilityClasses(buildings), [buildings]);
  return (
    <div className="height-reliability-hud hud-card" role="region" aria-label="Height data reliability">
      <p className="height-reliability-hud-title">Data reliability</p>
      <ul className="height-reliability-hud-list">
        {HEIGHT_RELIABILITY_CLASSES.map((id) => (
          <li key={id}>
            <i
              className="height-reliability-swatch"
              style={{ background: getColour(HEIGHT_RELIABILITY_FILL_TOKEN[id]) }}
              aria-hidden="true"
            />
            <span>{HEIGHT_RELIABILITY_LABEL[id]}</span>
            <b className="mono">{counts[id].toLocaleString()}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
