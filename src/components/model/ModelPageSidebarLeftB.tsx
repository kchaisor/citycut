import { sunStudyDateText } from "../../lib/sunStudyExport";
import { ImportMassingPanel } from "../ImportMassingPanel";
import { ExportTiles } from "../ExportTiles";
import { CRS_NOTE } from "../../lib/crsZone";
import { exportTiles } from "../../lib/exportTiles";

export function ModelPageSidebarLeftB({ vm }: { vm: import("./useModelPage").ModelPageViewModel }) {
  const {
    buildingsAsMesh,
    busy,
    crs,
    drawing,
    exportError,
    figureFit,
    figureScale,
    layerBits,
    leftOpen,
    massing,
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
    setBuildingsAsMesh,
    setFigureScale,
    solar,
    sunStudyProgress,
    tab,
  } = vm;

  return (
    <>
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
