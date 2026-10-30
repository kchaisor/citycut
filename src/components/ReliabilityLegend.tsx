import { useMemo } from "react";
import type { BuildingFeat } from "../types";
import {
  HEIGHT_RELIABILITY_KEYS,
  HEIGHT_RELIABILITY_META,
  buildingHeightReliability,
  countHeightReliability,
} from "../lib/heightReliability";

export function ReliabilityLegend({ buildings }: { buildings: readonly BuildingFeat[] }) {
  const counts = useMemo(() => countHeightReliability(buildings), [buildings]);
  const total = HEIGHT_RELIABILITY_KEYS.reduce((sum, key) => sum + counts[key], 0);
  if (total === 0) return null;
  const measuredPct = Math.round((counts.measured / total) * 100);
  return (
    <section className="reliability-legend" aria-label="Height reliability" data-reliability-total={total}>
      <div className="reliability-head">
        <span className="reliability-title">Height reliability</span>
        <span className="reliability-pct mono">{measuredPct}% measured</span>
      </div>
      <div className="reliability-bar" aria-hidden="true">
        {HEIGHT_RELIABILITY_KEYS.map((key) =>
          counts[key] > 0 ? (
            <span
              key={key}
              className={HEIGHT_RELIABILITY_META[key].estimate ? "reliability-seg hatch" : "reliability-seg"}
              style={{ flexGrow: counts[key], backgroundColor: HEIGHT_RELIABILITY_META[key].color }}
            />
          ) : null,
        )}
      </div>
      <ul className="reliability-rows">
        {HEIGHT_RELIABILITY_KEYS.filter((key) => counts[key] > 0 || key !== "manual").map((key) => (
          <li key={key} data-reliability={key}>
            <i
              className={HEIGHT_RELIABILITY_META[key].estimate ? "reliability-dot hatch" : "reliability-dot"}
              style={{ backgroundColor: HEIGHT_RELIABILITY_META[key].color }}
            />
            <span className="reliability-label">{HEIGHT_RELIABILITY_META[key].label}</span>
            <span className="reliability-detail">{HEIGHT_RELIABILITY_META[key].detail}</span>
            <b className="mono" data-reliability-count={counts[key]}>
              {counts[key].toLocaleString()}
            </b>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReliabilityBadge({ building }: { building: BuildingFeat }) {
  const key = buildingHeightReliability(building);
  const meta = HEIGHT_RELIABILITY_META[key];
  return (
    <span className="reliability-badge" data-reliability={key}>
      <i className={meta.estimate ? "reliability-dot hatch" : "reliability-dot"} style={{ backgroundColor: meta.color }} />
      {meta.estimate ? `${meta.label} (estimate)` : meta.label}
    </span>
  );
}
