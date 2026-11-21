import { Copy } from "lucide-react";
import { HeightOverridePanel, HiddenBuildingsPanel } from "../BuildingHeightPopover";

import { OSM_TREES_ODBL_CREDIT } from "../../lib/treesPrebake";
import { COM_TREES_CREDIT, COM_TREES_DATASET_URL } from "../../lib/comTreesCredit";
import { VICMAP_ATTRIBUTION } from "../../lib/vicmapTrees";
import { formatCoord, formatLengthKm } from "../../lib/geo";import { dataSourceStatusWord } from "../../lib/dataSources";
import { treeSizeSummary } from "../../lib/trees";

import {
  BUILDING_USES,
  BUILDING_USE_META,
  SOURCE_COUNT_KEYS,
  SOURCE_META,
} from "../../lib/buildingUse";
import {
  COM_BUILDING_HEIGHTS_CREDIT,
  COM_BUILDING_HEIGHTS_DATASET_URL,
} from "../../lib/comBuildingHeightCredit";import { HEIGHT_TIER_BAR } from "./modelPageConstants";


export function ModelPageSidebarRight({ vm }: { vm: import("./useModelPage").ModelPageViewModel }) {
  const {
    colourByUse,
    comHeightsMeasuredOn,
    comHeightsStatus,
    comHeightsStatusNote,
    comMeasuredHeightCount,
    dataSources,
    displayModel,
    exportHeightEdits,
    heightBar,
    heightTierCounts,
    heightTierLegend,
    hiddenMatch,
    hiddenStore,
    importHeightEdits,
    landmarkByBuilding,
    landmarkLabelsOn,
    lidarTierNote,
    model,
    overrideResult,
    persistHidden,
    pickBuildingUseColour,
    showAllInCut,
    showHiddenEntry,
    resetAllHeights,
    retryComHeights,
    rightOpen,
    setColourByUse,
    setLandmarkLabelsOn,
    setShowManualEdits,
    setShowSource,
    showBuildings,
    showManualEdits,
    showSource,
    sourceCounts,
    sourcesLoaded,
    tierCounts,
    uniform,
    unmatchedEdits,
    useCounts,
    wikidataStatus,
    writeStoredShowManualHeights,
  } = vm;
  const wikidataHelper =
    wikidataStatus === "ok"
      ? `From Wikidata · ${landmarkByBuilding.size.toLocaleString()} matched`
      : wikidataStatus === "failed"
        ? "From Wikidata · not available for this area"
        : "From Wikidata · loading";

  return (
    <>
            <div className="drawer-section" hidden={rightOpen !== "summary"}>
              <div className="kpi-grid mono" aria-label="In this model">
                <div className="kpi-cell">
                  <div className="kpi-lbl k-lbl">Bldgs</div>
                  <div className="kpi-num k-val">{model.buildings.length.toLocaleString()}</div>
                </div>
                <div className="kpi-cell">
                  <div className="kpi-lbl k-lbl">Trees</div>
                  <div className="kpi-num k-val">{model.trees.length.toLocaleString()}</div>
                </div>
                <div className="kpi-cell">
                  <div className="kpi-lbl k-lbl">Roads</div>
                  <div className="kpi-num k-val">{formatLengthKm(model.roadKm)}k</div>
                </div>
                <div className="kpi-cell">
                  <div className="kpi-lbl k-lbl">Elev</div>
                  <div className="kpi-num k-val">
                    {model.terrain ? `${model.terrain.min.toFixed(0)}–${model.terrain.max.toFixed(0)}m` : "—"}
                  </div>
                </div>
              </div>
              {showBuildings && heightBar.total > 0 && (
                <>
                  <div className="outliner-divider" aria-hidden="true" />
                  <section className="dist-block">
                    <div className="dist-head">
                      <h3 className="dist-title">Height Precision</h3>
                      <span className="dist-pct mono">
                        {Math.round((heightBar.measured / heightBar.total) * 100)}% CoM LiDAR
                      </span>
                    </div>
                    <div className="dist-bar" aria-hidden="true">
                      <div
                        className="dist-seg is-ink"
                        style={{ width: `${Math.round((heightBar.measured / heightBar.total) * 100)}%` }}
                      />
                      <div
                        className="dist-seg is-muted"
                        style={{ width: `${Math.max(0, 100 - Math.round((heightBar.measured / heightBar.total) * 100))}%` }}
                      />
                    </div>
                    <div className="dist-legend bar-legend-grid">
                      <span className="dist-leg-item">
                        <span className="dl-left">
                          <span className="leg-dot is-ink" />
                          <span>CoM 2023</span>
                        </span>
                        <b className="dl-val mono">{comMeasuredHeightCount.toLocaleString()}</b>
                      </span>
                      <span className="dist-leg-item">
                        <span className="dl-left">
                          <span className="leg-dot is-muted" />
                          <span>Zone est.</span>
                        </span>
                        <b className="dl-val mono">{(heightBar.total - comMeasuredHeightCount).toLocaleString()}</b>
                      </span>
                    </div>
                  </section>
                </>
              )}
              {showBuildings && displayModel.buildings.length > 0 && (
                <>
                  <div className="outliner-divider" aria-hidden="true" />
                  <section className="dist-block">
                    <div className="dist-head">
                      <h3 className="dist-title">Building Use Mix</h3>
                      <span className="dist-pct mono">CLUE + OSM</span>
                    </div>
                    <div className="dist-bar" aria-hidden="true">
                      {BUILDING_USES.map((use) =>
                        useCounts[use] > 0 ? (
                          <div
                            key={use}
                            className="dist-seg"
                            style={{
                              width: `${Math.max(2, Math.round((useCounts[use] / displayModel.buildings.length) * 100))}%`,
                              background: BUILDING_USE_META[use].color,
                            }}
                          />
                        ) : null,
                      )}
                    </div>
                    <div className="dist-legend bar-legend-grid">
                      {BUILDING_USES.filter((use) => useCounts[use] > 0)
                        .slice(0, 4)
                        .map((use) => {
                          const pct = Math.round((useCounts[use] / displayModel.buildings.length) * 100);
                          return (
                            <span key={use} className="dist-leg-item">
                              <span className="dl-left">
                                <span className="leg-dot" style={{ background: BUILDING_USE_META[use].color }} />
                                <span>{BUILDING_USE_META[use].label}</span>
                              </span>
                              <b className="dl-val mono">{pct}%</b>
                            </span>
                          );
                        })}
                    </div>
                  </section>
                </>
              )}
              <details className="insp-sources-details sr-only">
                <summary className="insp-sources-summary mono">
                  <span>
                    Data sources ({sourcesLoaded.loaded}/{sourcesLoaded.total} loaded)
                  </span>
                  <span className="insp-sources-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="insp-sources-body">
                  <p className="sidebar-coord">
                    <span>
                      {formatCoord(model.center.lat)}, {formatCoord(model.center.lon)}
                    </span>
                    <button
                      type="button"
                      className="sidebar-icon-btn"
                      aria-label="Copy coordinates"
                      title="Copy coordinates"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(`${formatCoord(model.center.lat)}, ${formatCoord(model.center.lon)}`)
                          .catch(() => undefined);
                      }}
                    >
                      <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </p>
                  <ul className="source-list">
                    {dataSources.map((row) => (
                      <li key={row.id} className={`source-row is-${row.status}`} data-source={row.id}>
                        <i className={`status-dot is-${row.status}`} aria-hidden="true" />
                        <div className="source-text">
                          <span className="source-name">{row.label}</span>
                          {row.detail && <span className="source-meta">{row.detail}</span>}
                          {row.notes.map((note) => (
                            <span key={note} className="source-note" role={row.status === "failed" ? "alert" : undefined}>
                              {note}
                            </span>
                          ))}
                          {row.retry === "com-heights" && (
                            <button type="button" className="sidebar-link" onClick={retryComHeights}>
                              Retry CoM heights
                            </button>
                          )}
                        </div>
                        <span className="source-state">{dataSourceStatusWord(row.status)}</span>
                      </li>
                    ))}
                  </ul>
                  <details className="source-notes">
                    <summary>Full source notes and credits</summary>
                    <p className="meta">{displayModel.sourceNote}</p>
                  </details>
                </div>
              </details>
            </div>

            <div className="drawer-section legend" hidden={rightOpen !== "buildings"}>
                <section className="sidebar-group">
                  <h3 className="sidebar-gh">Colour by</h3>
                  <div className="segmented" role="group" aria-label="Colour buildings by">
                    <button
                      type="button"
                      data-autofocus="true"
                      aria-pressed={colourByUse && !showSource}
                      onClick={() => {
                        setShowSource(false);
                        setColourByUse(true);
                      }}
                    >
                      Use
                    </button>
                    <button type="button" aria-pressed={showSource} onClick={() => setShowSource(true)}>
                      Source
                    </button>
                    <button
                      type="button"
                      aria-pressed={!colourByUse && !showSource}
                      onClick={() => {
                        setShowSource(false);
                        setColourByUse(false);
                      }}
                    >
                      None
                    </button>
                  </div>
                </section>
                <section className="sidebar-group landmark-labels-group">
                  <label className="landmark-toggle">
                    <span className="landmark-toggle-label">Landmark labels</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={landmarkLabelsOn}
                      onChange={(event) => setLandmarkLabelsOn(event.target.checked)}
                    />
                  </label>
                  <p className="landmark-helper">{wikidataHelper}</p>
                </section>
                <section className="sidebar-group">
                  <div className="sidebar-gh">
                    <h3>Use</h3>
                    <span className="buildings-count mono">{model.buildings.length.toLocaleString()} massings</span>
                  </div>
                  <ul className="legend-two">
                    {BUILDING_USES.filter((use) => useCounts[use] > 0).map((use) => (
                      <li key={use}>
                        <label
                          className="legend-swatch"
                          style={{
                            background: colourByUse && !showSource ? BUILDING_USE_META[use].color : uniform,
                          }}
                          title={`Change ${BUILDING_USE_META[use].label.toLowerCase()} colour`}
                        >
                          {rightOpen === "buildings" && (
                            <input
                              type="color"
                              aria-label={`${BUILDING_USE_META[use].label} colour`}
                              value={BUILDING_USE_META[use].color.toLowerCase()}
                              onChange={(event) => pickBuildingUseColour(use, event.target.value)}
                            />
                          )}
                        </label>
                        <span>{BUILDING_USE_META[use].label}</span>
                        <b>{useCounts[use].toLocaleString()}</b>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="sidebar-group">
                  <h3 className="sidebar-gh">Source</h3>
                  <ul>
                    {SOURCE_COUNT_KEYS.map((source) => (
                      <li key={source}>
                        <i
                          className={SOURCE_META[source].inferred ? "hatch" : undefined}
                          style={{
                            backgroundColor: showSource ? SOURCE_META[source].color : uniform,
                          }}
                        />
                        <span>{SOURCE_META[source].label}</span>
                        <b>{sourceCounts[source].toLocaleString()}</b>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="sidebar-group">
                  <h3 className="sidebar-gh">Height source</h3>
                  <ul>
                    {heightTierLegend
                      .filter(({ tier }) => tier === "lidar" || heightTierCounts[tier] > 0)
                      .map(({ tier, label }) => (
                        <li key={tier} className={tier === "lidar" && heightTierCounts.lidar === 0 ? "is-empty" : undefined}>
                          <i className={`height-bar-${HEIGHT_TIER_BAR[tier]}`} />
                          <span>{label}</span>
                          <b>
                            {(tier === "com" ? comMeasuredHeightCount : heightTierCounts[tier]).toLocaleString()}
                          </b>
                        </li>
                      ))}
                  </ul>
                  {comHeightsMeasuredOn && comMeasuredHeightCount > 0 && (
                    <p className="legend-note">
                      {comMeasuredHeightCount.toLocaleString()} building
                      {comMeasuredHeightCount === 1 ? "" : "s"} use City of Melbourne measured heights in this
                      frame.
                    </p>
                  )}
                  {comHeightsStatusNote && (
                    <p className="legend-note" role="status">
                      {comHeightsStatusNote}
                    </p>
                  )}
                  {comHeightsStatus === "failed" && (
                    <div className="panel-toolbar">
                      <button type="button" onClick={retryComHeights}>
                        Retry CoM heights
                      </button>
                    </div>
                  )}
                  {comHeightsMeasuredOn && (
                    <p className="legend-note">
                      <a href={COM_BUILDING_HEIGHTS_DATASET_URL} target="_blank" rel="noopener noreferrer">{COM_BUILDING_HEIGHTS_CREDIT}</a>
                    </p>
                  )}
                  <p className="legend-note" role="status">
                    {lidarTierNote}
                  </p>
                  {model.useTierFailures?.map((failure) => (
                    <p key={failure.id} className="legend-note">
                      {failure.message}
                    </p>
                  ))}
                </section>
                <section className="sidebar-group">
                  <div className="sidebar-gh">
                    <h3>Hidden buildings</h3>
                    <span>{hiddenMatch.size.toLocaleString()}</span>
                  </div>
                  <HiddenBuildingsPanel
                    hidden={[...hiddenMatch.values()]}
                    onShow={(entry) => persistHidden(showHiddenEntry(hiddenStore, entry))}
                    onShowAll={() => persistHidden(showAllInCut(hiddenStore, hiddenMatch.values()))}
                  />
                </section>
                <section className="sidebar-group">
                  <div className="sidebar-gh">
                    <h3>Edited building heights</h3>
                    <span>{overrideResult.manualCount.toLocaleString()}</span>
                  </div>
                  <HeightOverridePanel
                    manualCount={overrideResult.manualCount}
                    unmatchedCount={unmatchedEdits}
                    showManualEdits={showManualEdits}
                    onToggleShowManual={() => {
                      setShowManualEdits((on) => {
                        const next = !on;
                        writeStoredShowManualHeights(window.localStorage, next);
                        return next;
                      });
                    }}
                    onResetAll={resetAllHeights}
                    onExport={exportHeightEdits}
                    onImport={importHeightEdits}
                  />
                </section>
            </div>

            <div className="drawer-section tree-sizes" hidden={rightOpen !== "trees"}>
                <ul className="tree-tiers">
                  {(
                    [
                      ["com", "City of Melbourne"],
                      ["osm", "OpenStreetMap"],
                      ["vicmap", "Vicmap"],
                      ["canopy", "Canopy infill"],
                    ] as const
                  ).map(([tier, label]) => (
                    <li key={tier}>
                      <span>{label}</span>
                      <b>{tierCounts[tier].toLocaleString()}</b>
                    </li>
                  ))}
                </ul>
                <p className="tree-readout">{treeSizeSummary(model.trees)}</p>
                {model.treeSource?.kind === "prebake" && model.treeSource.osmFromFile && tierCounts.osm > 0 && (
                  <p className="tree-credit">{OSM_TREES_ODBL_CREDIT}</p>
                )}
                {(model.treeLoadNotes ?? []).map((note) => (
                  <p key={note.source} className="legend-note tree-load-note" role="status">
                    {note.message}
                  </p>
                ))}
                {model.treeCapHit && (
                  <p className="legend-note">
                    Tree count was capped at 8,000. Canopy infill was trimmed first, then Vicmap.
                  </p>
                )}
                {tierCounts.com > 0 && (
                  <p className="tree-credit">
                    <a href={COM_TREES_DATASET_URL} target="_blank" rel="noopener noreferrer">
                      {COM_TREES_CREDIT}
                    </a>
                  </p>
                )}
                {tierCounts.vicmap > 0 && <p className="tree-credit">{VICMAP_ATTRIBUTION}</p>}
              </div>
    </>
  );
}
