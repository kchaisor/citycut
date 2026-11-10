import type { SolarReceptorAssessResult } from "../lib/solarReceptorAssess";

export function SolarReceptorResultsList({
  rows,
  compact = false,
}: {
  rows: readonly SolarReceptorAssessResult[];
  compact?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <ul
      className={compact ? "solar-receptor-results is-compact" : "solar-receptor-results"}
      aria-label="B4-3 receptor results"
    >
      {rows.map((row) => (
        <li key={row.id} data-solar-receptor={row.id} data-solar-receptor-status={row.statusTone}>
          <span className="solar-receptor-id mono">{row.id}</span>
          <span className="solar-receptor-metrics mono">
            ≥5 h: {row.existingSunlitM2.toFixed(0)} m² existing · {row.proposedSunlitM2.toFixed(0)} m² proposed
            <span className="dim"> (need {row.requiredSunlitM2.toFixed(0)} m²)</span>
          </span>
          <span className={`solar-receptor-status is-${row.statusTone}`}>{row.statusLabel}</span>
        </li>
      ))}
    </ul>
  );
}
