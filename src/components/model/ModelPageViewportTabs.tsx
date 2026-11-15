// @ts-nocheck
import { Building2, Copy, Download, DraftingCompass, Eye, Footprints, GripVertical, Info, Radar, RotateCcw, Sun, Trees, Upload, Wind } from "lucide-react";
import { BuildingHeightPopover, HeightOverridePanel, HiddenBuildingsPanel } from "../BuildingHeightPopover";
import { TreeInspectHud, TerrainInspectHud } from "../SceneInspectHud";
import { DrawingPlan, type DrawingKind } from "../DrawingPlan";
import { DrawingExplodedAxo } from "../DrawingExplodedAxo";
import { DrawingIsometric } from "../DrawingIsometric";
import { SatellitePane } from "../SatellitePane";
import { Scene3D, type SceneExporter } from "../Scene3D";
import { StudioCompass } from "../StudioCompass";
import { studioCompassVisible } from "../../lib/studioCompass";
import { sceneSelectionBuildingId } from "../../lib/sceneInspectPick";
import { qaHideHeightPopoverFromSearch } from "../../lib/qaCameraBridge";
import { showAllInCut } from "../../lib/hiddenBuildings";
import { sunStudyMutedOn, toggleSelection } from "../../lib/sunStudyPlan";
import { SceneBoundary } from "../SceneBoundary";
import { WindRoseOverlay } from "../WindRoseOverlay";
import { ViewLegend, ViewPanel } from "../ViewPanel";
import { SectionKnifeElevationPanel } from "../SectionKnifeElevationPanel";
import { WalkRippleLegend, WalkRipplePanel } from "../WalkRipplePanel";

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

export function ModelPageViewportTabs({ vm }: { vm: import("./useModelPage").ModelPageViewModel }) {
  const {
    axoSettings,
    cameraMemory,
    colourByUse,
    compassNeedleDeg,
    displayModel,
    drawing,
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
    lineStyles,
    massing,
    model,
    onExportReady,
    onScale,
    onSectionKnifePoseChange,
    overrideResult,
    persistHidden,
    planHeliodonForSiteExport,
    planShadowInput,
    pickedBuilding,
    pickedTree,
    planViewport,
    renderQuality,
    resetBuildingHeight,
    rippleAnalysisOpen,
    saveBuildingHeight,
    sceneSelection,
    sectionKnifeTool,
    selectForHide,
    setAxoLayerLift,
    setCompassNeedleDeg,
    setExplodedViewport,
    setHideSelection,
    setInspectHudScreen,
    setIsoDrawingViewport,
    setPlanViewport,
    setSceneSelection,
    setSolar,
    setSunStudySelected,
    showManualEdits,
    showSource,
    snapId,
    solar,
    sunStudyDate,
    sunStudySelected,
    tab,
    uniform,
    view,
    view3dDisplay,
    viewAnalysisOpen,
    walk,
    walkDrawing,
    walkRipple,
    walkRippleToast,
    windMotion,
    windSettings,
    windTable,
  } = vm;

  return (
    <>
        {tab === "3d" && (
          <div className="fill">
            {shouldShowIntroBridgePill() && (() => {
              const samples = typeof window !== "undefined" ? window.__citycutProgressSamples : undefined;
              const currentPct = Array.isArray(samples) && samples.length > 0 ? (samples[samples.length - 1] ?? 0) : 0;
              return (
                <div className="loading-card loading-hud-pill is-model-bridge hud-card" aria-hidden="true" data-progress-pct={currentPct}>
                  <div className="loading-hud-row">
                    <span className="loading-pulse-dot" />
                    <strong>Building 3D site cut · LiDAR + Vicmap…</strong>
                    <div className="loading-prog-track">
                      <div className="loading-prog-fill" style={{ width: `${currentPct}%` }} />
                    </div>
                    <span className="loading-prog-pct">{currentPct}%</span>
                  </div>
                </div>
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
                uniformBuildings={!colourByUse && !showSource}
                colourBySource={showSource}
                showManualEdits={showManualEdits}
                projection={view.projection}
                corner={view.corner}
                freeRotate={view.freeRotate}
                snapId={snapId}
                solar={solar}
                windEnabled={windSettings.enabled}
                windTable={windTable}
                windPeriod={windSettings.period}
                windAnimateStreaks={windMotion.animateStreaks}
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
                onCompassNeedle={setCompassNeedleDeg}
                heightEditBuildingId={sceneSelectionBuildingId(sceneSelection)}
                selectedBuildingIds={
                  hideSelection.length > 0
                    ? hideSelection
                    : sceneSelectionBuildingId(sceneSelection) != null
                      ? [sceneSelectionBuildingId(sceneSelection)!]
                      : []
                }
                cameraMemory={cameraMemory}
                display={view3dDisplay}
                importedMassing={massing.group}
                walkLayer={walk.layer.root}
                walkRippleLayer={rippleAnalysisOpen ? walkRipple.layer.root : null}
                walkRippleTint={rippleAnalysisOpen ? walkRipple.tint : null}
                walkRippleArrivals={rippleAnalysisOpen ? walkRipple.buildingArrivals : null}
                walkRipplePlaying={rippleAnalysisOpen && walkRipple.ripplePlaying}
                onScenePoint={
                  walkRipple.placing
                    ? (east, north) => walkRipple.placePoint(east, north)
                    : walkDrawing
                      ? walk.addPoint
                      : massing.onScenePoint
                }
                sectionKnife={sectionKnifeTool}
                onSectionKnifePoseChange={onSectionKnifePoseChange}
                quality={renderQuality}
              />
              {tab === "3d" && sectionKnifeTool.active && (
                <SectionKnifeElevationPanel model={displayModel} tool={sectionKnifeTool} />
              )}
              {viewAnalysisOpen && walk.clickCount > 0 && <ViewLegend />}
              {rippleAnalysisOpen && walkRipple.buildingArrivals && <WalkRippleLegend />}
              {walkRippleToast ? (
                <p className="walk-ripple-toast" role="status">
                  {walkRippleToast}
                </p>
              ) : null}
              {tab === "3d" && studioCompassVisible(view.projection, view.freeRotate) && (
                <StudioCompass needleDeg={compassNeedleDeg} />
              )}
              {windSettings.enabled && windSettings.showRose && windTable && tab === "3d" && (
                <WindRoseOverlay
                  table={windTable}
                  period={windSettings.period}
                  streaksPaused={windMotion.streaksPaused}
                  animateAnyway={windMotion.animateAnyway}
                  onAnimateAnyway={windMotion.setAnimateAnyway}
                />
              )}
              {pickedBuilding && !qaHideHeightPopoverFromSearch(window.location.search) && (
                <BuildingHeightPopover
                  building={pickedBuilding}
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
                sectionKnife={sectionKnifeTool}
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
              />
            )}
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
