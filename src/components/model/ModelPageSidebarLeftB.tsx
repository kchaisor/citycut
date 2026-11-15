// @ts-nocheck
import { Building2, Copy, Download, DraftingCompass, Eye, Footprints, GripVertical, Info, Radar, RotateCcw, Sun, Trees, Upload, Wind } from "lucide-react";
import { sunStudyDateText } from "../../lib/sunStudyExport";
import { ImportMassingPanel } from "../ImportMassingPanel";
import { SolarPanel } from "../SolarPanel";
import { WindPanel } from "../WindPanel";
import { ExportTiles } from "../ExportTiles";
import { ViewLegend, ViewPanel } from "../ViewPanel";
import { WalkRippleLegend, WalkRipplePanel } from "../WalkRipplePanel";
import { CRS_NOTE, mgaCrs } from "../../lib/crsZone";
import { exportTiles, type ExportBusy } from "../../lib/exportTiles";
import { CRS_NOTE, mgaCrs } from "../../lib/crsZone";
import { SITE_ANALYSIS_KINDS, SITE_ANALYSIS_LABELS } from "../../lib/sidebarSections";
import { exportTiles } from "../../lib/exportTiles";
import { sunStudyDateText } from "../../lib/sunStudyExport";
import { shouldShowIntroBridgePill } from "./shouldShowIntroBridgePill";
import {
  ANALYSIS_ICONS,
  CORNER_LABEL,
  SECTION_ICONS,
  SIDEBAR_PANEL_ID,
  RIGHT_SIDEBAR_PANEL_ID,
  iconProps,
} from "./modelPageConstants";

import type { ModelPageViewModel } from "./useModelPage";

export function ModelPageSidebarLeftB({ vm }: { vm: import("./useModelPage").ModelPageViewModel }) {
  const {
    analysisKind,
    buildingsAsMesh,
    busy,
    commitSolar,
    commitWind,
    crs,
    drawing,
    exportError,
    figureFit,
    figureScale,
    layerBits,
    leftOpen,
    massing,
    model,
    planScaleOptions,
    save3dm,
    saveExplodedAxoAi,
    saveFigureAi,
    saveFigureSvg,
    saveIsometricAi,
    saveIsometricSvg,
    savePng,
    saveSiteAi,
    saveSiteSvg,
    saveSunStudyAi,
    setAnalysisKind,
    setBuildingsAsMesh,
    setFigureScale,
    setSunStudySelected,
    solar,
    sunStudyDate,
    sunStudyProgress,
    sunStudySelected,
    tab,
    view,
    walk,
    walkRipple,
    windMotion,
    windNote,
    windSettings,
  } = vm;

  return (
    <>
            <div className="drawer-section" hidden={leftOpen !== "analysis"}>
              <div className="tabs site-analysis-tabs" role="tablist" aria-label="Site Analysis">
                {SITE_ANALYSIS_KINDS.map((kind) => {
                  const Icon = ANALYSIS_ICONS[kind];
                  const active = analysisKind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      role="tab"
                      data-analysis={kind}
                      aria-selected={active}
                      className={active ? "site-analysis-tab is-active" : "site-analysis-tab"}
                      onClick={() => setAnalysisKind(kind)}
                    >
                      <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
                      <span>{SITE_ANALYSIS_LABELS[kind]}</span>
                    </button>
                  );
                })}
              </div>
              <div hidden={analysisKind !== "solar"}>
                <SolarPanel
                  embedded
                  settings={solar}
                  onChange={commitSolar}
                  sideM={model.sideM}
                  site={{ lat: model.center.lat, lon: model.center.lon }}
                  selectedCount={sunStudySelected.length}
                  onClearSelection={() => setSunStudySelected([])}
                />
              </div>
              <div hidden={analysisKind !== "wind"}>
                <WindPanel
                  embedded
                  settings={windSettings}
                  onChange={commitWind}
                  note={windNote}
                  streaksPaused={windMotion.streaksPaused}
                  animateAnyway={windMotion.animateAnyway}
                  onAnimateAnyway={windMotion.setAnimateAnyway}
                />
              </div>
              <div hidden={analysisKind !== "view"}>
                <ViewPanel walk={walk} />
              </div>
              <div hidden={analysisKind !== "walkRipple"}>
                <WalkRipplePanel ripple={walkRipple} />
              </div>
            </div>

            <div className="drawer-section" hidden={leftOpen !== "import"}>
              <ImportMassingPanel
                imported={massing.imported}
                warnings={massing.warnings}
                crsName={crs.name}
                placingId={massing.placingId}
                busy={massing.busy}
                error={massing.error}
                onImport={(file) => void massing.importFile(file)}
                onMode={massing.setMode}
                onPlacement={massing.setPlacement}
                onSnap={massing.snapToGround}
                onResetMga={massing.resetToMga}
                onToggleVisible={massing.toggleVisible}
                onColour={massing.setColour}
                onRemove={massing.remove}
              />
            </div>

            <div className="drawer-section" hidden={leftOpen !== "exports"}>
              <div className="exports">
                <ExportTiles
                  tiles={exportTiles({
                    tab,
                    drawing,
                    busy,
                    figureScale,
                    sunStudyDate: sunStudyDateText({ year: solar.year, month: solar.month, day: solar.day }),
                    buildingsAsMesh,
                    crsName: crs.name,
                    sunStudy: Boolean(solar.sunStudy),
                  })}
                  progress={busy === "ai-sun" ? sunStudyProgress : null}
                  onDownload={(id) => {
                    if (id === "3dm") void save3dm();
                    else if (id === "png") void savePng();
                    else if (id === "sun-zip") void saveSunStudyAi();
                    else if (id === "svg")
                      void (drawing === "figure-ground"
                        ? saveFigureSvg()
                        : drawing === "isometric"
                          ? saveIsometricSvg()
                          : saveSiteSvg());
                    else if (drawing === "site") void saveSiteAi();
                    else if (drawing === "figure-ground") void saveFigureAi();
                    else if (drawing === "isometric") void saveIsometricAi();
                    else void saveExplodedAxoAi();
                  }}
                />
                <label className="check-field rhino-mesh-option">
                  <input
                    type="checkbox"
                    checked={buildingsAsMesh}
                    onChange={(event) => setBuildingsAsMesh(event.target.checked)}
                  />
                  Rhino: buildings as mesh
                </label>
                <label className="scale-field">
                  Plan scale
                  <select
                    value={figureScale}
                    aria-label="Export plan scale"
                    onChange={(event) => setFigureScale(Number(event.target.value))}
                  >
                    {planScaleOptions.map((scale) => (
                      <option key={scale} value={scale}>
                        1:{scale}
                      </option>
                    ))}
                  </select>
                </label>
                {figureFit && (
                  <p className="fit-note" id="figure-fit">
                    {figureFit}
                  </p>
                )}
              </div>
              <p className="v2">
                This file includes {layerBits.join(", ") || "an empty block"}. DXF, DAE, and JPG are not available in
                this version.
              </p>
              <p className="v2">{CRS_NOTE}</p>
              {exportError && (
                <p className="error" role="alert">
                  {exportError}
                </p>
              )}
            </div>
    </>
  );
}
