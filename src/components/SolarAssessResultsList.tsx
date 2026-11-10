import type { SolarAssessRow } from "../lib/solarReceptorAssess";
import { isParkAssessRow } from "../lib/solarReceptorAssess";

export function SolarAssessResultsList({
  rows,
  compact = false,
}: {
  rows: readonly SolarAssessRow[];
  compact?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <ul
      className={compact ? "solar-receptor-results is-compact" : "solar-receptor-results"}
      aria-label="Solar receptor results"
    >
      {rows.map((row) => (
        <li key={row.id} data-solar-receptor={row.id} data-solar-receptor-status={row.statusTone}>
          <span className="solar-receptor-id mono">{row.id}</span>
          {isParkAssessRow(row) ? (
            <>
              <span className="solar-receptor-metrics mono" data-solar-park-metrics>
                Added: {row.maxAddedM2.toFixed(1)} m² max · {row.totalAddedM2.toFixed(0)} m² sum
                <span className="dim"> (≤ {row.toleranceM2} m²)</span>
              </span>
              <span className="solar-receptor-rule dim">{row.ruleLabel}</span>
              <span className="solar-receptor-rule-status dim">{row.statusNote}</span>
              <span className={`solar-receptor-status is-${row.statusTone}`}>{row.statusLabel}</span>
            </>
          ) : (
            <>
              <span className="solar-receptor-metrics mono">
                ≥5 h: {row.existingSunlitM2.toFixed(0)} m² existing · {row.proposedSunlitM2.toFixed(0)} m² proposed
                <span className="dim"> (need {row.requiredSunlitM2.toFixed(0)} m²)</span>
              </span>
              <span className={`solar-receptor-status is-${row.statusTone}`}>{row.statusLabel}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
