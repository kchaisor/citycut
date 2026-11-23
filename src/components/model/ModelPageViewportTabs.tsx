import { useEffect, useState } from "react";
import { BuildingHeightPopover, ImportedBuildingPopover } from "../BuildingHeightPopover";
import { LoadingHudPill } from "../LoadingHudPill";
import { LandmarkLabelLayer } from "../LandmarkLabelLayer";
import { ImportedLabelLayer } from "../ImportedLabelLayer";
import type { ImportedLabelState } from "../ImportedLabelProjector";

import { TreeInspectHud, TerrainInspectHud } from "../SceneInspectHud";import { DrawingPlan } from "../DrawingPlan";

import { DrawingExplodedAxo } from "../DrawingExplodedAxo";
import { DrawingIsometric } from "../DrawingIsometric";
import { SatellitePane } from "../SatellitePane";import { Scene3D } from "../Scene3D";

import { sceneSelectionBuildingId } from "../../lib/sceneInspectPick";
import { qaHideHeightPopoverFromSearch } from "../../lib/qaCameraBridge";
import { sunStudyMutedOn, toggleSelection } from "../../lib/sunStudyPlan";
import { SceneBoundary } from "../SceneBoundary";
import { solarSettingsForActiveAnalysis, solarStudyViewActive, windDiagramActive, windFlowActive } from "../../lib/solarStudyView";



import { shouldShowIntroBridgePill } from "./shouldShowIntroBridgePill";

export function ModelPageViewportTabs({ vm }: { vm: import("./useModelPage").ModelPageViewModel }) {
  const {
    analyses,
    axoSettings,
    cameraMemory,
    introPlayed,
    colourByUse,
    displayModel,
    windModel,
    windPlanOutlineModel,
    drawing,
    drawingLandmarkSources,
    drawingModel,
    effectiveSunStudyCasters,
    explodedViewport,
    figureScale,
    fitCounter,
    hiddenMatch,
    hiddenStore,
    hideSelectedBuildings,
    hideSelection,
    inspectAnchor,
    inspectHudPosition,
    isoDrawingViewport,
    landmarkByBuilding,
    landmarkLabelsOn,
    landmarkScreens,
    landmarkSources,
    lineStyles,
    massing,
    model,
    onExportReady,
    onScale,
    overrideResult,
    persistHidden,
    showAllInCut,
    planHeliodonForSiteExport,
    planShadowInput,
    pickedBuilding,
    pickedTree,
    pickedImported,
    selectImportedBuilding,
    clearImportedSelection,
    planViewport,
    renderQuality,
    resetBuildingHeight,
    saveBuildingHeight,
    sceneSelection,
    selectForHide,
    setAxoLayerLift,
    setCompassHeadingDeg,
    setExplodedViewport,
    setHideSelection,
    setInspectHudScreen,
    setLandmarkScreens,
    setIsoDrawingViewport,
    setPlanViewport,
    setSceneSelection,
    setSolar,
    setSunStudySelected,
    showManualEdits,
    showSource,
    snapId,
    solar,
    sunHoursGround,
    sunStudyDate,
    sunStudySelected,
    tab,
    view,
    view3dDisplay,
    walk,
    walkDrawing,
    windMotion,
    windStreams,
    windStreaksOn,
    windSpreadRadiusM,
    sunDome,
    windSettings,
    designWind,
    windPlan,
    siteWind,
  } = vm;
  const sunHoursOnPlan = Boolean(solar.sunHours) && drawing === "site";
  const [keep3d, setKeep3d] = useState(tab === "3d");
  const [importedLabels, setImportedLabels] = useState<ImportedLabelState | null>(null);
  useEffect(() => {
    if (tab === "3d") setKeep3d(true);
  }, [tab]);

  const importedPopover = pickedImported ? (
    <ImportedBuildingPopover
      building={pickedImported.building}
      fileName={pickedImported.massing.name}
      onSetUse={(use) => massing.setBuildingUse(pickedImported.massing.id, pickedImported.building.id, use)}
      onClose={clearImportedSelection}
      floatingScreen={inspectHudPosition}
    />
  ) : null;

  return (
    <>
        {(tab === "3d" || keep3d) && (
          <div className={tab === "3d" ? "fill" : "fill is-parked"} aria-hidden={tab === "3d" ? undefined : true}>
            {shouldShowIntroBridgePill() && (() => {
              const samples = typeof window !== "undefined" ? window.__citycutProgressSamples : undefined;
              const currentPct = Array.isArray(samples) && samples.length > 0 ? (samples[samples.length - 1] ?? 0) : 0;
              return (
                <LoadingHudPill
                  className="loading-card is-model-bridge"
                  label="Building 3D site cut · LiDAR + Vicmap…"
                  progress={currentPct / 100}
                  aria-hidden="true"
                  data-progress-pct={currentPct}
                />
              );
            })()}
            {model.heightSourceLoadWarnings?.map((line) => (
              <p key={line} className="height-source-notice" role="status">
                {line}
              </p>
            ))}
            <SceneBoundary>
              <Scene3D
                model={displayModel}
                windModel={windModel}
                windPlanOutlineModel={windPlanOutlineModel}
                uniformBuildings={!colourByUse && !showSource}
                colourBySource={showSource}
                showManualEdits={showManualEdits}
                projection={view.projection}
                corner={view.corner}
                freeRotate={view.freeRotate}
                snapId={snapId}
                solar={solarSettingsForActiveAnalysis(solar, analyses)}
                windEnabled={windFlowActive(windSettings.enabled, analyses)}
                siteWind={siteWind}
                windPeriod={windSettings.period}
                windDesignWind={designWind}
                windSector={windPlan.sector}
                windAnimateStreaks={windMotion.animateStreaks}
                windDiagramStreams={windDiagramActive(windStreaksOn, analyses) ? windStreams : null}
                windSpreadRadiusM={windSpreadRadiusM}
                sunDomeRadiusM={sunDome.radiusM}
                windPlan={windPlan.active ? windPlan : null}
                onExportReady={onExportReady}
                onSceneInspectPick={(selection) => {
                  setSceneSelection(selection);
                  setInspectHudScreen({ clientX: selection.clientX, clientY: selection.clientY, inView: true });
                  if (selection.kind === "building") {
                    selectForHide(selection.buildingId, selection.additive);
                  } else {
                    setHideSelection([]);
                  }
                }}
                onClearSceneInspect={() => {
                  setSceneSelection(null);
                  setInspectHudScreen(null);
                  setHideSelection([]);
                }}
                inspectAnchor={inspectAnchor}
                onInspectHudScreen={setInspectHudScreen}
                onCompassHeading={setCompassHeadingDeg}
                heightEditBuildingId={sceneSelectionBuildingId(sceneSelection)}
                selectedBuildingIds={
                  hideSelection.length > 0
                    ? hideSelection
                    : sceneSelectionBuildingId(sceneSelection) != null
                      ? [sceneSelectionBuildingId(sceneSelection)!]
                      : []
                }
                cameraMemory={cameraMemory}
                introPlayed={introPlayed}
                active={tab === "3d"}
                display={view3dDisplay}
                importedMassing={massing.group}
                walkLayer={walk.layer.root}
                onScenePoint={walkDrawing ? walk.addPoint : massing.onScenePoint}
                quality={renderQuality}
                sunHoursGroundGrid={solar.sunHours ? sunHoursGround.grid : null}
                sunHoursDirectOverlay={solar.sunHours ? sunHoursGround.overlay : null}
                sunHoursScaleMax={solar.sunHours ? sunHoursGround.scaleMaxHours : 0}
                solarAnalysisActive={solarStudyViewActive(analyses)}
                landmarkSources={landmarkSources}
                landmarkLabelsOn={landmarkLabelsOn}
                onLandmarkScreens={setLandmarkScreens}
                onImportedLabels={setImportedLabels}
              />
              {tab === "3d" && (
                <ImportedLabelLayer
                  state={importedLabels}
                  onSelect={(label) => selectImportedBuilding(label.fileId, label.buildingId, label.x, label.y)}
                />
              )}
              {tab === "3d" && landmarkLabelsOn && (
                <LandmarkLabelLayer
                  state={landmarkScreens}
                  hiddenId={pickedBuilding ? pickedBuilding.id : null}
                  onSelect={(label) => {
                    const building = displayModel.buildings.find((item) => item.id === label.buildingId);
                    setSceneSelection({
                      kind: "building",
                      buildingId: label.buildingId,
                      clientX: label.x,
                      clientY: label.y,
                      world: { east: label.east, north: label.north, up: label.roofUp - (building?.height ?? 0) },
                    });
                    setInspectHudScreen({ clientX: label.x, clientY: label.y, inView: true });
                    selectForHide(label.buildingId, false);
                  }}
                />
              )}
              {pickedBuilding && !qaHideHeightPopoverFromSearch(window.location.search) && (
                <BuildingHeightPopover
                  building={pickedBuilding}
                  landmark={landmarkByBuilding.get(pickedBuilding.id) ?? null}
                  center={displayModel.center}
                  allBuildings={displayModel.buildings}
                  damRecords={displayModel.developmentDamRecords ?? []}
                  onSave={(heightM) => saveBuildingHeight(pickedBuilding.id, heightM)}
                  onReset={() => resetBuildingHeight(pickedBuilding.id)}
                  onClose={() => {
                    setSceneSelection(null);
                    setInspectHudScreen(null);
                    setHideSelection([]);
                  }}
                  selectedCount={Math.max(1, hideSelection.length)}
                  hiddenCount={hiddenMatch.size}
                  onHideSelected={hideSelectedBuildings}
                  onShowAll={() => persistHidden(showAllInCut(hiddenStore, hiddenMatch.values()))}
                  floatingScreen={inspectHudPosition}
                />
              )}
              {tab === "3d" && importedPopover}
              {pickedTree && (
                <TreeInspectHud
                  tree={pickedTree}
                  model={displayModel}
                  screen={inspectHudPosition}
                  onClose={() => {
                    setSceneSelection(null);
                    setInspectHudScreen(null);
                  }}
                />
              )}
              {sceneSelection?.kind === "terrain" && (
                <TerrainInspectHud
                  east={sceneSelection.world.east}
                  north={sceneSelection.world.north}
                  terrain={displayModel.terrain}
                  sideM={displayModel.sideM}
                  center={displayModel.center}
                  screen={inspectHudPosition}
                  onClose={() => {
                    setSceneSelection(null);
                    setInspectHudScreen(null);
                  }}
                />
              )}
            </SceneBoundary>
          </div>
        )}
        {tab === "drawing" && (
          <div className="fill is-plan">
            {drawing === "exploded-axo" ? (
              <DrawingExplodedAxo
                model={drawingModel}
                settings={axoSettings}
                onScale={onScale}
                viewport={explodedViewport}
                onViewportChange={setExplodedViewport}
                onLayerLiftChange={setAxoLayerLift}
                fitCounter={fitCounter}
              />
            ) : drawing === "isometric" ? (
              <DrawingIsometric
                model={drawingModel}
                corner={view.corner}
                display={view3dDisplay}
                planScale={figureScale}
                onScale={onScale}
                viewport={isoDrawingViewport}
                onViewportChange={setIsoDrawingViewport}
                fitCounter={fitCounter}
              />
            ) : (
              <DrawingPlan
                model={drawingModel}
                kind={drawing}
                onScale={onScale}
                lineStyle={lineStyles}
                planScale={figureScale}
                heliodon={planHeliodonForSiteExport()}
                castShadows={solar.castShadows}
                shadowInput={planShadowInput()}
                sunStudy={sunStudyDate}
                sunStudyMuted={sunStudyMutedOn(solar.sunStudy, solar.sunStudyMuted)}
                sunStudyCasters={effectiveSunStudyCasters}
                sunStudySelected={sunStudySelected}
                onSunStudyPick={(id) =>
                  setSunStudySelected((current) => {
                    const next = toggleSelection(current, id);
                    setSolar((prev) => ({
                      ...prev,
                      sunStudyCasters: next.length > 0 ? "selected" : "all",
                    }));
                    return next;
                  })
                }
                uniformBuildings={!colourByUse && !showSource}
                colourBySource={showSource}
                highlightManual={showManualEdits && overrideResult.manualCount > 0}
                viewport={planViewport}
                onViewportChange={setPlanViewport}
                fitCounter={fitCounter}
                sunHoursGroundGrid={sunHoursOnPlan ? sunHoursGround.grid : null}
                sunHoursGroundScaleMax={sunHoursOnPlan ? sunHoursGround.scaleMaxHours : 0}
                sunHoursRoofPlanRaster={sunHoursOnPlan ? (sunHoursGround.overlay?.roofPlanRaster ?? null) : null}
                landmarkLabels={drawing === "site" || drawing === "figure-ground" ? drawingLandmarkSources : []}
                onImportedPick={(ref, clientX, clientY) =>
                  selectImportedBuilding(ref.fileId, ref.buildingId, clientX, clientY)
                }
              />
            )}
            {importedPopover}
          </div>
        )}
        {tab === "satellite" && (
          <div className="fill">
            <SatellitePane model={displayModel} viewport={planViewport} onViewportChange={setPlanViewport} />
          </div>
        )}
    </>
  );
}
