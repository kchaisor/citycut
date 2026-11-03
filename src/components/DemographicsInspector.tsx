import { benchmarkPercentages, cutPercentages } from "../lib/demographicsClip";
import type {
  DemographicsBenchmark,
  DemographicsCutStats,
  DemographicsTab,
} from "../lib/demographicsTypes";
import {
  DEMOGRAPHICS_AGE_BANDS,
  DEMOGRAPHICS_HOUSEHOLD_TYPES,
} from "../lib/demographicsTypes";

const HH_LABELS: Record<(typeof DEMOGRAPHICS_HOUSEHOLD_TYPES)[number], string> = {
  lone: "Lone",
  couple: "Couple",
  family: "Family",
  group: "Group",
};

function formatPopulation(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return value.toLocaleString();
}

function BarRow({
  label,
  pct,
  benchPct,
}: {
  label: string;
  pct: number;
  benchPct: number;
}) {
  const width = Math.max(0, Math.min(100, pct));
  const tick = Math.max(0, Math.min(100, benchPct));
  return (
    <div className="demo-bar-row">
      <span className="demo-bar-label">{label}</span>
      <div className="demo-bar-track" aria-hidden="true">
        <div className="demo-bar-fill" style={{ width: `${width}%` }} />
        <div className="demo-bar-tick" style={{ left: `${tick}%` }} />
      </div>
      <span className="demo-bar-val mono">{Math.round(pct)}%</span>
    </div>
  );
}

export function DemographicsInspector({
  tab,
  onTab,
  stats,
  benchmark,
  loading,
  empty,
}: {
  tab: DemographicsTab;
  onTab: (tab: DemographicsTab) => void;
  stats: DemographicsCutStats | null;
  benchmark: DemographicsBenchmark | null;
  loading: boolean;
  empty: boolean;
}) {
  const benchAge = benchmark ? benchmarkPercentages(benchmark, "age") : {};
  const benchHh = benchmark ? benchmarkPercentages(benchmark, "households") : {};
  const cutAge = stats ? cutPercentages(stats, "age") : {};
  const cutHh = stats ? cutPercentages(stats, "households") : {};

  const tabs: { id: DemographicsTab; label: string }[] = [
    { id: "people", label: "People" },
    { id: "age", label: "Age" },
    { id: "households", label: "Households" },
    { id: "catchment", label: "Catchment" },
  ];

  return (
    <div className="demo-inspector">
      <nav className="demo-tabs" role="tablist" aria-label="Demographics">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "demo-tab is-active" : "demo-tab"}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "catchment" ? (
        <div className="demo-coming-soon">
          <h3 className="demo-headline">15-min walking catchment</h3>
          <p className="demo-subline">Coming soon — street-network reach from the cut centroid.</p>
        </div>
      ) : loading ? (
        <p className="demo-status">Loading ABS Census 2021…</p>
      ) : empty || !stats || !benchmark ? (
        <div className="demo-empty">
          <h3 className="demo-headline">No demographics for this cut</h3>
          <p className="demo-subline">Move the frame inside Greater Melbourne to see ABS SA1 data.</p>
        </div>
      ) : (
        <>
          <h3 className="demo-headline">
            {tab === "people" && "Who lives inside the cut"}
            {tab === "age" && "Age profile in the cut"}
            {tab === "households" && "Household types in the cut"}
          </h3>
          <p className="demo-subline">ABS SA1 blend · clipped to your square</p>
          <div className="kpi-grid mono demo-kpi" aria-label="Demographics summary">
            <div className="kpi-cell">
              <div className="kpi-lbl k-lbl">Residents</div>
              <div className="kpi-num k-val">{formatPopulation(stats.population)}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-lbl k-lbl">Density</div>
              <div className="kpi-num k-val">{stats.densityPerKm2.toLocaleString()}/km²</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-lbl k-lbl">Tree canopy</div>
              <div className="kpi-num k-val">{stats.canopyPct}%</div>
            </div>
          </div>
          {(tab === "people" || tab === "age") && (
            <section className="demo-block">
              <div className="demo-block-head">
                <span>Age profile</span>
                <span>% of residents</span>
              </div>
              {DEMOGRAPHICS_AGE_BANDS.map((band) => (
                <BarRow
                  key={band}
                  label={band}
                  pct={cutAge[band] ?? 0}
                  benchPct={benchAge[band] ?? 0}
                />
              ))}
            </section>
          )}
          {(tab === "people" || tab === "households") && (
            <section className="demo-block">
              <div className="demo-block-head">
                <span>Household type</span>
                <span>% of households</span>
              </div>
              {DEMOGRAPHICS_HOUSEHOLD_TYPES.map((kind) => (
                <BarRow
                  key={kind}
                  label={HH_LABELS[kind]}
                  pct={cutHh[kind] ?? 0}
                  benchPct={benchHh[kind] ?? 0}
                />
              ))}
            </section>
          )}
          <div className="demo-legend" aria-hidden="true">
            <span className="demo-leg-item">
              <span className="demo-leg-swatch" />
              This cut
            </span>
            <span className="demo-leg-item">
              <span className="demo-leg-tick" />
              Melbourne avg
            </span>
          </div>
        </>
      )}
      <p className="demo-footnote">
        Source:{" "}
        <a href="https://www.abs.gov.au/census/find-census-data" target="_blank" rel="noopener noreferrer">
          ABS Census 2021
        </a>{" "}
        (CC BY 4.0)
      </p>
    </div>
  );
}
