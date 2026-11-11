import { getColour } from "../../lib/colours";
import type { ReachAreaStats, ReachDataset, ReachMinuteSeries } from "../../lib/reach/types";
import type { DemographicsExplorerLens } from "../../lib/reach/constants";
import { ReachAreaChart } from "./ReachAreaChart";

export function ReachPanel({
  lens,
  onLens,
  budgetMin,
  stats,
  series,
  manifest,
  loading,
  error,
}: {
  lens: DemographicsExplorerLens;
  onLens: (lens: DemographicsExplorerLens) => void;
  budgetMin: number;
  stats: ReachAreaStats | null;
  series: ReachMinuteSeries | null;
  manifest: ReachDataset["manifest"] | null;
  loading: boolean;
  error: string | null;
}) {
  const walk = getColour("--reach-walk-fill");
  const transit = getColour("--reach-transit-fill");
  return (
    <div className="reach-panel" data-reach-panel="true">
      <div className="reach-panel-head">
        <div>
          <h2 className="reach-panel-title">Reach from origin</h2>
          <p className="reach-panel-sub">Area reachable within your time budget — walk vs walk + PT.</p>
        </div>
        <div className="reach-lens-toggle" role="group" aria-label="Demographics lens">
          <button
            type="button"
            className={lens === "people" ? "reach-lens-btn is-active" : "reach-lens-btn"}
            aria-pressed={lens === "people"}
            onClick={() => onLens("people")}
          >
            People
          </button>
          <button
            type="button"
            className={lens === "reach" ? "reach-lens-btn is-active" : "reach-lens-btn"}
            aria-pressed={lens === "reach"}
            onClick={() => onLens("reach")}
          >
            Reach
          </button>
        </div>
      </div>
      <div className="reach-subtabs" role="tablist" aria-label="Reach metrics">
        <span className="reach-subtab is-active" role="tab" aria-selected="true">
          Area
        </span>
        <span className="reach-subtab is-disabled" role="tab" aria-selected="false">
          People reached
        </span>
        <span className="reach-subtab is-disabled" role="tab" aria-selected="false">
          Jobs
        </span>
        <span className="reach-subtab is-disabled" role="tab" aria-selected="false">
          Amenities
        </span>
      </div>
      {loading ? <p className="reach-status">Loading isochrone tiles…</p> : null}
      {error ? <p className="reach-status is-error">{error}</p> : null}
      {stats ? (
        <>
          <div className="reach-kpi-grid">
            <div className="reach-kpi">
              <span className="reach-kpi-label">
                <i style={{ background: walk }} aria-hidden="true" /> On foot
              </span>
              <span className="reach-kpi-value mono">{stats.walkKm2.toFixed(1)} km²</span>
              <span className="reach-kpi-meta mono">
                {stats.walkHexes} hexes · ~{stats.walkRadiusKm.toFixed(1)} km radius
              </span>
            </div>
            <div className="reach-kpi">
              <span className="reach-kpi-label">
                <i style={{ background: transit }} aria-hidden="true" /> With transit
              </span>
              <span className="reach-kpi-value mono">{stats.transitKm2.toFixed(1)} km²</span>
              <span className="reach-kpi-meta mono">
                {stats.transitHexes} hexes · {stats.stationCount} stations · {stats.tramLineCount} tram lines
              </span>
            </div>
          </div>
          <div className="reach-multiplier-card">
            <span className="reach-multiplier-num mono">{stats.transitMultiplier.toFixed(1)}×</span>
            <p>
              Transit multiplies your reach. Past minute {stats.insightMinute} the tram outruns your feet — every extra
              minute adds ~{stats.insightKm2PerMin.toFixed(1)} km².
            </p>
          </div>
        </>
      ) : null}
      {series ? (
        <div className="reach-chart-block">
          <h3 className="reach-chart-title">Area reached, minute by minute</h3>
          <ReachAreaChart series={series} budgetMin={budgetMin} />
        </div>
      ) : null}
      <footer className="reach-footnote mono">
        <span>Isochrones · GTFS PTV timetable · {manifest?.walkSpeedKmh ?? 4.8} km/h walk</span>
        {manifest?.exampleData ? <span className="reach-example-tag">Example data</span> : null}
      </footer>
    </div>
  );
}
