import { benchmarkAgePyramid, compareGlance, type DemographicsCatchmentStats } from "../lib/demographicsCatchment";
import { benchmarkPercentages } from "../lib/demographicsClip";
import type { DemographicsBenchmark } from "../lib/demographicsTypes";
import {
  DEMOGRAPHICS_AGE_BANDS,
  DEMOGRAPHICS_HOUSEHOLD_TYPES,
  DEMOGRAPHICS_RENT_BINS,
  type DemographicsTab,
} from "../lib/demographicsTypes";
import type {
  DemographicsExplorerAction,
  DemographicsExplorerState,
  DemographicsPanelMode,
} from "../lib/demographicsExplorerReducer";
import { getColour } from "../lib/colours";

function Pyramid({
  male,
  female,
  benchMale,
  benchFemale,
  side,
}: {
  male: Record<string, number>;
  female: Record<string, number>;
  benchMale: Record<string, number>;
  benchFemale: Record<string, number>;
  side: "a" | "b";
}) {
  const accent = getColour(side === "a" ? "--demographics-pin-a" : "--demographics-pin-b");
  const max = Math.max(
    ...DEMOGRAPHICS_AGE_BANDS.flatMap((band) => [male[band] ?? 0, female[band] ?? 0, benchMale[band] ?? 0]),
    1,
  );
  return (
    <div className="demo-pyramid" aria-label="Age pyramid">
      {DEMOGRAPHICS_AGE_BANDS.map((band) => {
        const mPct = ((male[band] ?? 0) / max) * 100;
        const fPct = ((female[band] ?? 0) / max) * 100;
        const bm = ((benchMale[band] ?? 0) / max) * 100;
        const bf = ((benchFemale[band] ?? 0) / max) * 100;
        return (
          <div key={band} className="demo-pyramid-row">
            <span className="demo-pyramid-band">{band}</span>
            <div className="demo-pyramid-bars">
              <div className="demo-pyramid-half is-m">
                <div className="demo-pyramid-fill" style={{ width: `${mPct}%`, background: accent }} />
                <div className="demo-pyramid-outline" style={{ width: `${bm}%`, right: 0 }} />
              </div>
              <div className="demo-pyramid-half is-f">
                <div className="demo-pyramid-fill" style={{ width: `${fPct}%`, background: accent }} />
                <div className="demo-pyramid-outline" style={{ width: `${bf}%`, left: 0 }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricBar({
  label,
  pct,
  benchPct,
  side,
}: {
  label: string;
  pct: number;
  benchPct: number;
  side: "a" | "b";
}) {
  const accent = getColour(side === "a" ? "--demographics-pin-a" : "--demographics-pin-b");
  return (
    <div className="demo-metric-bar">
      <span className="demo-metric-label">{label}</span>
      <div className="demo-metric-track">
        <div className="demo-metric-fill" style={{ width: `${Math.min(100, pct)}%`, background: accent }} />
        <div className="demo-metric-tick" style={{ left: `${Math.min(100, benchPct)}%` }} />
      </div>
      <span className="demo-metric-val mono">{Math.round(pct)}%</span>
    </div>
  );
}

function RentHistogram({
  bins,
  side,
  median,
  benchMedian,
}: {
  bins: Record<string, number>;
  side: "a" | "b";
  median: number | null;
  benchMedian: number | null;
}) {
  const accent = getColour(side === "a" ? "--demographics-pin-a" : "--demographics-pin-b");
  const values = DEMOGRAPHICS_RENT_BINS.map((bin) => bins[bin] ?? 0);
  const max = Math.max(...values, 1);
  return (
    <div className="demo-rent-hist">
      <div className="demo-rent-bars">
        {DEMOGRAPHICS_RENT_BINS.map((bin, index) => (
          <div
            key={bin}
            className="demo-rent-bar"
            style={{ height: `${((values[index] ?? 0) / max) * 100}%`, background: accent }}
          />
        ))}
      </div>
      {median != null ? (
        <div className="demo-rent-median mono">
          ${median}/wk
          {benchMedian != null && median !== benchMedian ? (
            <span className="demo-rent-delta">
              {median > benchMedian ? "+" : ""}
              {Math.round(((median - benchMedian) / benchMedian) * 100)}% vs avg
            </span>
          ) : null}
        </div>
      ) : (
        <p className="demo-not-enough">Not enough data</p>
      )}
    </div>
  );
}

function TabColumnContent({
  tab,
  pinId,
  label,
  stats,
  benchmark,
}: {
  tab: DemographicsTab;
  pinId: "a" | "b";
  label: string;
  stats: DemographicsCatchmentStats | null;
  benchmark: DemographicsBenchmark;
}) {
  const accent = getColour(pinId === "a" ? "--demographics-pin-a" : "--demographics-pin-b");
  if (!stats || stats.population <= 0) {
    return (
      <div className="demo-compare-col">
        <header className="demo-compare-head" style={{ color: accent }}>
          {pinId.toUpperCase()} {label}
        </header>
        <p className="demo-not-enough">Not enough data</p>
      </div>
    );
  }
  const benchAge = benchmarkAgePyramid(benchmark);
  const maleTotal = DEMOGRAPHICS_AGE_BANDS.reduce((sum, band) => sum + stats.ageMale[band], 0);
  const femaleTotal = DEMOGRAPHICS_AGE_BANDS.reduce((sum, band) => sum + stats.ageFemale[band], 0);
  const malePct = Object.fromEntries(
    DEMOGRAPHICS_AGE_BANDS.map((band) => [band, maleTotal > 0 ? (stats.ageMale[band] / maleTotal) * 100 : 0]),
  );
  const femalePct = Object.fromEntries(
    DEMOGRAPHICS_AGE_BANDS.map((band) => [band, femaleTotal > 0 ? (stats.ageFemale[band] / femaleTotal) * 100 : 0]),
  );
  const hhTotal = DEMOGRAPHICS_HOUSEHOLD_TYPES.reduce((sum, kind) => sum + stats.households[kind], 0);
  const benchHh = benchmarkPercentages(benchmark, "households");

  return (
    <div className="demo-compare-col">
      <header className="demo-compare-head" style={{ color: accent }}>
        {pinId.toUpperCase()} {label}
      </header>
      {(tab === "people" || tab === "age" || tab === "households" || tab === "dwellings" || tab === "tenure" || tab === "costs") && (
        <>
          <p className="demo-residents-headline">{stats.population.toLocaleString()}</p>
          <p className="demo-residents-sub mono">
            residents · {stats.densityPerHa.toLocaleString()}/ha
          </p>
        </>
      )}
      {tab === "people" ? (
        <>
          <Pyramid side={pinId} male={malePct} female={femalePct} benchMale={benchAge.male} benchFemale={benchAge.female} />
          <MetricBar side={pinId} label="Lone person" pct={hhTotal > 0 ? (stats.households.lone / hhTotal) * 100 : 0} benchPct={benchHh.lone ?? 0} />
          <MetricBar side={pinId} label="Couple, no kids" pct={hhTotal > 0 ? (stats.households.couple / hhTotal) * 100 : 0} benchPct={benchHh.couple ?? 0} />
          <MetricBar side={pinId} label="Apartment" pct={stats.apartmentShare ?? 0} benchPct={benchmark.apartmentShare ?? 0} />
          <MetricBar side={pinId} label="Renting" pct={stats.rentingShare ?? 0} benchPct={benchmark.rentingShare ?? 0} />
          <RentHistogram side={pinId} bins={stats.rentBins} median={stats.rentMedianWeekly} benchMedian={benchmark.rentMedianWeekly ?? null} />
        </>
      ) : null}
      {tab === "age" ? (
        <>
          <p className="demo-subline mono">Median age {stats.medianAge ?? "—"} · benchmark {benchmark.medianAge ?? "—"}</p>
          <Pyramid side={pinId} male={malePct} female={femalePct} benchMale={benchAge.male} benchFemale={benchAge.female} />
        </>
      ) : null}
      {tab === "households" ? (
        <>
          <MetricBar side={pinId} label="Lone person" pct={hhTotal > 0 ? (stats.households.lone / hhTotal) * 100 : 0} benchPct={benchHh.lone ?? 0} />
          <MetricBar side={pinId} label="Couple, no kids" pct={hhTotal > 0 ? (stats.households.couple / hhTotal) * 100 : 0} benchPct={benchHh.couple ?? 0} />
          <MetricBar side={pinId} label="Family" pct={hhTotal > 0 ? (stats.households.family / hhTotal) * 100 : 0} benchPct={benchHh.family ?? 0} />
          <MetricBar side={pinId} label="Group" pct={hhTotal > 0 ? (stats.households.group / hhTotal) * 100 : 0} benchPct={benchHh.group ?? 0} />
        </>
      ) : null}
      {tab === "dwellings" ? (
        <MetricBar side={pinId} label="Apartment" pct={stats.apartmentShare ?? 0} benchPct={benchmark.apartmentShare ?? 0} />
      ) : null}
      {tab === "tenure" ? (
        <MetricBar side={pinId} label="Renting" pct={stats.rentingShare ?? 0} benchPct={benchmark.rentingShare ?? 0} />
      ) : null}
      {tab === "costs" ? (
        <RentHistogram side={pinId} bins={stats.rentBins} median={stats.rentMedianWeekly} benchMedian={benchmark.rentMedianWeekly ?? null} />
      ) : null}
    </div>
  );
}

export function DemographicsExplorerPanel({
  state,
  dispatch,
  statsA,
  statsB,
  benchmark,
  sa1Count,
  builtAt,
  loading,
}: {
  state: DemographicsExplorerState;
  dispatch: (action: DemographicsExplorerAction) => void;
  statsA: DemographicsCatchmentStats | null;
  statsB: DemographicsCatchmentStats | null;
  benchmark: DemographicsBenchmark | null;
  sa1Count: number;
  builtAt: string | null;
  loading: boolean;
}) {
  const tabs: { id: DemographicsTab; label: string }[] = [
    { id: "people", label: "People" },
    { id: "age", label: "Age" },
    { id: "households", label: "Households" },
    { id: "dwellings", label: "Dwellings" },
    { id: "tenure", label: "Tenure" },
    { id: "costs", label: "Costs" },
  ];

  const setMode = (panelMode: DemographicsPanelMode) => dispatch({ type: "setPanelMode", panelMode });

  const glance =
    statsA && statsB && statsA.population > 0 && statsB.population > 0 ? compareGlance(statsA, statsB) : null;

  const tabBody =
    !benchmark ? null : state.panelMode === "compare" ? (
      <>
        <div className="demo-compare-grid">
          <TabColumnContent tab={state.tab} pinId="a" label={state.pins.a?.label ?? "A"} stats={statsA} benchmark={benchmark} />
          <TabColumnContent tab={state.tab} pinId="b" label={state.pins.b?.label ?? "B"} stats={statsB} benchmark={benchmark} />
        </div>
        {state.tab === "people" && glance ? (
          <div className="demo-glance mono" aria-label="B vs A at a glance">
            <span>RESIDENTS {glance.residentsPct >= 0 ? "+" : ""}{glance.residentsPct}%</span>
            <span>
              MEDIAN AGE {glance.medianAgeA ?? "—"} vs {glance.medianAgeB ?? "—"}
            </span>
            <span>RENTERS {glance.rentersPts != null ? `${glance.rentersPts >= 0 ? "+" : ""}${glance.rentersPts} pts` : "—"}</span>
            <span>RENT {glance.rentDelta != null ? `${glance.rentDelta >= 0 ? "+" : ""}$${glance.rentDelta}/wk` : "—"}</span>
          </div>
        ) : null}
      </>
    ) : (
      <TabColumnContent tab={state.tab} pinId="a" label={state.pins.a?.label ?? "A"} stats={statsA} benchmark={benchmark} />
    );

  return (
    <div className="demo-explorer-panel">
      <header className="demo-explorer-head">
        <div>
          <h2 className="demo-explorer-title">Demographics Explorer</h2>
          <p className="demo-explorer-sub">
            Parcels with centroid inside {state.radiusM} m · dashed = Melbourne average
          </p>
        </div>
        <div className="demo-mode-toggle" role="group" aria-label="Single or compare">
          <button
            type="button"
            className={state.panelMode === "single" ? "demo-mode-btn is-active" : "demo-mode-btn"}
            onClick={() => setMode("single")}
          >
            Single
          </button>
          <button
            type="button"
            className={state.panelMode === "compare" ? "demo-mode-btn is-active" : "demo-mode-btn"}
            onClick={() => setMode("compare")}
          >
            Compare
          </button>
        </div>
      </header>
      <div className="demo-map-controls mono" role="group" aria-label="Map catchment controls">
        <label className="demo-radius-control">
          RADIUS
          <input
            type="range"
            min={200}
            max={1200}
            step={50}
            value={state.radiusM}
            onChange={(event) =>
              dispatch({ type: "setRadius", radiusM: Number(event.target.value) })
            }
          />
          <span>{state.radiusM} M</span>
        </label>
        <div className="demo-colour-by" aria-label="Colour parcels by">
          <span>COLOUR BY</span>
          {(
            [
              ["density", "Density"],
              ["medianAge", "Median age"],
              ["rent", "Rent"],
              ["rentersPct", "Renters %"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={state.colourBy === id ? "demo-colour-btn is-active" : "demo-colour-btn"}
              aria-pressed={state.colourBy === id}
              onClick={() => dispatch({ type: "setColourBy", colourBy: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <nav className="demo-tabs" role="tablist" aria-label="Demographics topics">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={state.tab === item.id}
            className={state.tab === item.id ? "demo-tab is-active" : "demo-tab"}
            onClick={() => dispatch({ type: "setTab", tab: item.id })}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {loading ? (
        <p className="demo-status">Loading census and parcels…</p>
      ) : !benchmark ? (
        <p className="demo-status">No demographics dataset</p>
      ) : (
        tabBody
      )}
      <footer className="demo-explorer-foot mono">
        <span>
          Drawn from {sa1Count} SA1s · Real Vicmap parcels · 2021 Census schema
          {builtAt ? ` · ${builtAt.slice(0, 10)}` : ""}
        </span>
        <span>| = MELB AVG · Parcels © State of Victoria (DTP), CC BY 4.0</span>
      </footer>
    </div>
  );
}
