import { AXO_TERRAIN_EXAGGERATION_RANGE, DEFAULT_AXO_TERRAIN_EXAGGERATION } from "../../lib/explodedAxoTerrain";
import { GripVertical } from "lucide-react";
import type { AxoLayerId } from "../../lib/explodedAxo";
import { ISO_CORNERS } from "../../lib/isoCamera";
import { snapWhenTogglingIsoFreeRotate } from "../../lib/isoFreeRotate";
import { SectionKnifeToolPanel } from "../SectionKnifeToolPanel";
import { contourDrawerLabel } from "../../lib/vicmapContours";
import { drawingMassingCount } from "../../lib/massingFootprint";
import { CORNER_LABEL } from "./modelPageConstants";
import { MassingToolPanel } from "../MassingToolPanel";

export function ModelPageSidebarLeftA({ vm }: { vm: import("./useModelPage").ModelPageViewModel }) {
  const {
    AXO_LAYER_LABELS,
    axoSettings,
    colourByUse,
    commitView,
    commitView3dDisplay,
    defaultExplodedAxoGapM,
    defaultExplodedAxoSettings,
    displayModel,
    dragReorderAxoLayer,
    draggedAxoLayer,
    drawing,
    drawingModel,
    explodedAxoBounds,
    explodedAxoViewportExtent,
    exportSectionDrawing,
    figureFit,
    figureScale,
    isometricDrawingBounds,
    leftOpen,
    lineStyles,
    massingDraw,
    model,
    planScaleOptions,
    planWidth,
    referenceExplodedAxoSettings,
    selectedMassingBlock,
    resetSceneLayerColours,
    sceneLayerRows,
    sectionKnifeTool,
    setAxoSettings,
    setColourByUse,
    setExplodedViewport,
    setFigureScale,
    setIsoDrawingViewport,
    setSectionKnifeTool,
    setShowManualEdits,
    setShowSource,
    showManualEdits,
    showSource,
    tab,
    view,
    view3dDisplay,
    writeStoredShowManualHeights,
  } = vm;

  return (
    <>
            <div className="drawer-section" hidden={leftOpen !== "drawing"}>
              {tab === "3d" && massingDraw.tool.toolEnabled && (
                <MassingToolPanel
                  block={selectedMassingBlock}
                  onFloors={(floors) => massingDraw.updateSelected({ floors })}
                  onWidth={(width_m) => massingDraw.updateSelected({ width_m })}
                  onFlip={() =>
                    selectedMassingBlock &&
                    massingDraw.updateSelected({ flipped: !selectedMassingBlock.flipped })
                  }
                  onDelete={() => massingDraw.deleteSelected()}
                  onDuplicate={() => massingDraw.duplicateSelected()}
                />
              )}
              {tab === "3d" && (
                <div className="projection-block outliner-body">
                  <section className="sidebar-group outliner-section" aria-label="View modes">
                    <div className="card-head sidebar-gh">
                      <h3 className="card-title">View Style</h3>
                      <span className="card-meta mono">
                        {displayModel.buildings.length.toLocaleString()} massings
                      </span>
                    </div>
                    <div className="style-seg seg-mini" role="group" aria-label="Building style">
                      <button
                        type="button"
                        className={view3dDisplay.primaryView ? "style-btn active" : "style-btn"}
                        aria-pressed={view3dDisplay.primaryView}
                        onClick={() => {
                          setShowSource(false);
                          setColourByUse(false);
                          commitView3dDisplay({ ...view3dDisplay, primaryView: true });
                        }}
                      >
                        Primary
                      </button>
                      <button
                        type="button"
                        className={!view3dDisplay.primaryView && colourByUse && !showSource ? "style-btn active" : "style-btn"}
                        aria-pressed={!view3dDisplay.primaryView && colourByUse && !showSource}
                        onClick={() => {
                          setShowSource(false);
                          setColourByUse(true);
                          if (view3dDisplay.primaryView) {
                            commitView3dDisplay({ ...view3dDisplay, primaryView: false });
                          }
                        }}
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        className={!view3dDisplay.primaryView && showSource ? "style-btn active" : "style-btn"}
                        aria-pressed={!view3dDisplay.primaryView && showSource}
                        onClick={() => {
                          setShowSource(true);
                          if (view3dDisplay.primaryView) {
                            commitView3dDisplay({ ...view3dDisplay, primaryView: false });
                          }
                        }}
                      >
                        Source
                      </button>
                      <button
                        type="button"
                        className={!view3dDisplay.primaryView && !colourByUse && !showSource ? "style-btn active" : "style-btn"}
                        aria-pressed={!view3dDisplay.primaryView && !colourByUse && !showSource}
                        onClick={() => {
                          setShowSource(false);
                          setColourByUse(false);
                          if (view3dDisplay.primaryView) {
                            commitView3dDisplay({ ...view3dDisplay, primaryView: false });
                          }
                        }}
                      >
                        Card
                      </button>
                    </div>
                    <label className="check-field sr-only">
                      <input
                        type="checkbox"
                        checked={view3dDisplay.primaryView}
                        onChange={(event) => commitView3dDisplay({ ...view3dDisplay, primaryView: event.target.checked })}
                      />
                      Primary view
                    </label>
                    <SectionKnifeToolPanel
                      sideM={displayModel.sideM}
                      model={displayModel}
                      tool={sectionKnifeTool}
                      onChange={setSectionKnifeTool}
                      onExportSection={exportSectionDrawing}
                    />
                    <div className="mini-flags sub-toggles display-switches" role="group" aria-label="View modes">
                      <label className={view3dDisplay.showOutlines ? "mini-flag is-on check-field" : "mini-flag check-field"}>
                        <input
                          className="sr-only"
                          type="checkbox"
                          checked={view3dDisplay.showOutlines}
                          onChange={(event) => commitView3dDisplay({ ...view3dDisplay, showOutlines: event.target.checked })}
                        />
                        <span>Outlines</span>
                        <span className={`mini-chk ${view3dDisplay.showOutlines ? "on" : ""}`} aria-hidden="true">{view3dDisplay.showOutlines ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg> : null}</span>
                      </label>
                      <label className={showManualEdits ? "mini-flag is-on check-field" : "mini-flag check-field"}>
                        <input
                          className="sr-only"
                          type="checkbox"
                          checked={showManualEdits}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setShowManualEdits(next);
                            writeStoredShowManualHeights(window.localStorage, next);
                          }}
                        />
                        <span>Manual edits</span>
                        <span className={`mini-chk ${showManualEdits ? "on" : ""}`} aria-hidden="true">{showManualEdits ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg> : null}</span>
                      </label>
                    </div>
                  </section>
                  <section
                    className={
                      view.projection === "iso"
                        ? "sidebar-group outliner-section"
                        : "sidebar-group outliner-section sr-only"
                    }
                    aria-label="Projection"
                  >
                    <div className="sidebar-gh sr-only">
                      <h3>Projection</h3>
                    </div>
                    <div className="plan-switch sr-only" role="group" aria-label="Projection">
                      <button
                        type="button"
                        aria-pressed={view.projection === "perspective"}
                        onClick={() => commitView({ ...view, projection: "perspective" }, false)}
                      >
                        Perspective
                      </button>
                      <button
                        type="button"
                        aria-pressed={view.projection === "iso"}
                        onClick={() => commitView({ ...view, projection: "iso" }, false)}
                      >
                        Isometric
                      </button>
                      <button
                        type="button"
                        aria-pressed={view.projection === "plan"}
                        onClick={() => commitView({ projection: "plan", corner: view.corner, freeRotate: false }, true)}
                      >
                        Plan, north-up
                      </button>
                    </div>
                    {view.projection === "plan" && (
                      <p className="field-note">Orthographic plan view. Choose Perspective to return to the 3D orbit camera.</p>
                    )}
                    {view.projection === "iso" && (
                      <>
                        <p className="kicker">Corner</p>
                        <div className="plan-switch" role="group" aria-label="Isometric corner">
                          {ISO_CORNERS.map((corner) => (
                            <button
                              key={corner}
                              type="button"
                              aria-pressed={view.corner === corner && !view.freeRotate}
                              onClick={() => commitView({ projection: "iso", corner, freeRotate: false }, true)}
                            >
                              {CORNER_LABEL[corner]}
                            </button>
                          ))}
                        </div>
                        <label className="check-field">
                          <input
                            type="checkbox"
                            checked={view.freeRotate}
                            onChange={(event) => {
                              const freeRotate = event.target.checked;
                              commitView(
                                { ...view, projection: "iso", freeRotate },
                                snapWhenTogglingIsoFreeRotate(),
                              );
                            }}
                          />
                          Free rotate (axonometric)
                        </label>
                        {view.freeRotate && (
                          <p className="iso-warning">
                            Free rotate is on, so this is no longer a true isometric view. Turn it off to lock pan-only
                            at the current angle, or pick a corner for a true isometric view.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                  {sceneLayerRows.length > 0 && (
                    <>
                      <div className="outliner-divider" aria-hidden="true" />
                      <section className="sidebar-group outliner-section" aria-label="Layers">
                        <div className="card-head sidebar-gh">
                          <h3 className="card-title">Scene Layers</h3>
                          <div className="studio-layer-head-actions">
                            <span className="card-meta mono">
                              {sceneLayerRows.filter((row) => row.visible).length} visible
                            </span>
                            <button
                              type="button"
                              className="studio-reset-colours-btn"
                              onClick={resetSceneLayerColours}
                              title="Reset all layer and building use colours to default"
                            >
                              Reset colours
                            </button>
                          </div>
                        </div>
                        <div className="outliner-rows display-switches" role="group" aria-label="3D layers">
                          {sceneLayerRows.map((layer) => (
                            <div key={layer.id} className="o-row studio-layer-row">
                              <label className="o-left check-field">
                                <input
                                  className="sr-only"
                                  type="checkbox"
                                  checked={layer.visible}
                                  onChange={(event) => layer.onToggle(event.target.checked)}
                                />
                                <span className={layer.visible ? "o-eye l-eye on" : "o-eye l-eye off"} aria-hidden="true">{layer.visible ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg> : null}</span>
                                <span className="o-name">{layer.label}</span>
                              </label>
                              <span className="o-right">
                                {layer.meta ? (
                                  <span className="o-count studio-layer-meta mono" aria-hidden="true">
                                    {layer.meta}
                                  </span>
                                ) : null}
                                <label
                                  className="o-swatch-wrap legend-swatch"
                                  style={{ background: layer.color }}
                                  title={`Change ${layer.label.toLowerCase()} colour`}
                                >
                                  <input
                                    type="color"
                                    className="o-swatch-input"
                                    aria-label={`${layer.label} colour`}
                                    value={layer.color.toLowerCase()}
                                    onInput={(event) => layer.onPick((event.target as HTMLInputElement).value)}
                                    onChange={(event) => layer.onPick(event.target.value)}
                                  />
                                </label>
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                </div>
              )}
              {tab === "drawing" && (
                <div
                  className="projection-block outliner-body"
                  data-plan-width={planWidth === null ? undefined : Math.round(planWidth)}
                >
                  <section className="sidebar-group outliner-section" aria-label="View modes">
                    <div className="card-head sidebar-gh">
                      <h3 className="card-title">View Style</h3>
                      <span className="card-meta mono">
                        {drawingMassingCount(drawingModel.buildings).toLocaleString()} massings
                      </span>
                    </div>
                    {drawing !== "figure-ground" && (
                      <>
                        <div className="style-seg seg-mini" role="group" aria-label="Building style">
                          <button
                            type="button"
                            className={colourByUse && !showSource ? "style-btn active" : "style-btn"}
                            aria-pressed={colourByUse && !showSource}
                            onClick={() => {
                              setShowSource(false);
                              setColourByUse(true);
                            }}
                          >
                            Use
                          </button>
                          <button
                            type="button"
                            className={showSource ? "style-btn active" : "style-btn"}
                            aria-pressed={showSource}
                            onClick={() => {
                              setShowSource(true);
                            }}
                          >
                            Source
                          </button>
                          <button
                            type="button"
                            className={!colourByUse && !showSource ? "style-btn active" : "style-btn"}
                            aria-pressed={!colourByUse && !showSource}
                            onClick={() => {
                              setShowSource(false);
                              setColourByUse(false);
                            }}
                          >
                            Uniform
                          </button>
                        </div>
                        <div className="mini-flags sub-toggles display-switches" role="group" aria-label="View modes">
                          <label className={showManualEdits ? "mini-flag is-on check-field" : "mini-flag check-field"}>
                            <input
                              className="sr-only"
                              type="checkbox"
                              checked={showManualEdits}
                              onChange={(event) => {
                                const next = event.target.checked;
                                setShowManualEdits(next);
                                writeStoredShowManualHeights(window.localStorage, next);
                              }}
                            />
                            <span>Manual edits</span>
                            <span className={`mini-chk ${showManualEdits ? "on" : ""}`} aria-hidden="true">{showManualEdits ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg> : null}</span>
                          </label>
                        </div>
                      </>
                    )}
                    <label className="scale-field studio-scale-row">
                      <span>Plan scale</span>
                      <select
                        value={figureScale}
                        aria-label="Plan scale"
                        onChange={(event) => setFigureScale(Number(event.target.value))}
                      >
                        {planScaleOptions.map((scale) => (
                          <option key={scale} value={scale}>
                            1:{scale}
                          </option>
                        ))}
                      </select>
                    </label>
                    {figureFit && <p className="fit-note">{figureFit}</p>}
                    {model.contourLayer && (
                      <p
                        className="field-note"
                        data-contour-source={model.contourLayer.source}
                        data-contour-features={model.contourLayer.featureCount}
                        data-contour-lines={model.contourLayer.lines.length}
                        data-contour-ms={model.contourLayer.fetchMs}
                        data-contour-interval={model.contourLayer.interval}
                        data-contour-drawn={contourDrawerLabel(
                          model.contourLayer,
                          figureScale,
                          lineStyles.contourCoarseIntervalM,
                          lineStyles.contourCoarseFromScale,
                        )}
                      >
                        Contours:{" "}
                        {contourDrawerLabel(
                          model.contourLayer,
                          figureScale,
                          lineStyles.contourCoarseIntervalM,
                          lineStyles.contourCoarseFromScale,
                        )}
                      </p>
                    )}
                  </section>
                  {drawing === "isometric" && (
                    <>
                      <div className="outliner-divider" aria-hidden="true" />
                      <section className="sidebar-group outliner-section iso-drawing-controls" aria-label="Compass view">
                        <div className="card-head sidebar-gh">
                          <h3 className="card-title">Compass view</h3>
                        </div>
                        <div className="plan-switch" role="group" aria-label="Isometric corner">
                          {ISO_CORNERS.map((corner) => (
                            <button
                              key={corner}
                              type="button"
                              aria-pressed={view.corner === corner}
                              onClick={() => {
                                commitView({ ...view, corner }, false);
                                setIsoDrawingViewport(
                                  explodedAxoViewportExtent(isometricDrawingBounds(displayModel, corner)),
                                );
                              }}
                            >
                              {CORNER_LABEL[corner]}
                            </button>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                  {drawing === "exploded-axo" && (
                    <>
                      <div className="outliner-divider" aria-hidden="true" />
                      <section className="sidebar-group outliner-section axo-controls" aria-label="Exploded layers">
                        <div className="card-head sidebar-gh">
                          <h3 className="card-title">Exploded Stack</h3>
                        </div>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const next = referenceExplodedAxoSettings(displayModel.sideM, axoSettings);
                            setAxoSettings(next);
                            setExplodedViewport(explodedAxoViewportExtent(explodedAxoBounds(displayModel, next)));
                          }}
                        >
                          Reference preset
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const next = defaultExplodedAxoSettings(displayModel.sideM);
                            setAxoSettings((prev) => ({ ...next, gapM: prev.gapM, showLabels: prev.showLabels, ...(prev.terrainExaggeration != null ? { terrainExaggeration: prev.terrainExaggeration } : {}) }));
                            setExplodedViewport(explodedAxoViewportExtent(explodedAxoBounds(displayModel, { ...next, gapM: axoSettings.gapM })));
                          }}
                        >
                          Default stack
                        </button>
                        <ul className="axo-layer-list" aria-label="Exploded axonometric layers (drag to reorder)">
                          {axoSettings.layerOrder.map((id) => (
                            <li
                              key={id}
                              draggable
                              data-axo-layer-item={id}
                              aria-label={`${AXO_LAYER_LABELS[id]} layer (drag up or down)`}
                              onDragStart={(event) => {
                                draggedAxoLayer.current = id;
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", id);
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                const from = draggedAxoLayer.current;
                                if (from && from !== id) dragReorderAxoLayer(from, id);
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                const from = (draggedAxoLayer.current ?? event.dataTransfer.getData("text/plain")) as AxoLayerId;
                                if (from && from !== id) dragReorderAxoLayer(from, id);
                                draggedAxoLayer.current = null;
                              }}
                              onDragEnd={() => {
                                draggedAxoLayer.current = null;
                              }}
                            >
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={axoSettings.layerVisible[id]}
                                  onChange={(event) =>
                                    setAxoSettings((prev) => ({
                                      ...prev,
                                      layerVisible: { ...prev.layerVisible, [id]: event.target.checked },
                                    }))
                                  }
                                />
                                {AXO_LAYER_LABELS[id]}
                              </label>
                              <span className="axo-layer-drag-handle" aria-hidden="true" title="Drag up or down to set height">
                                <GripVertical size={14} strokeWidth={1.6} />
                              </span>
                            </li>
                          ))}
                        </ul>
                        <label className="scale-field">
                          Layer gap, m
                          <input
                            type="range"
                            min={Math.round(defaultExplodedAxoGapM(displayModel.sideM) * 0.5)}
                            max={1000}
                            step={1}
                            value={Math.round(axoSettings.gapM)}
                            onChange={(event) =>
                              setAxoSettings((prev) => {
                                const { layerLiftM: _cleared, ...rest } = prev;
                                return { ...rest, gapM: Number(event.target.value) };
                              })
                            }
                          />
                          <span>{Math.round(axoSettings.gapM)} m</span>
                        </label>
                        {axoSettings.layerVisible.terrain && (
                          <label className="scale-field">
                            Terrain exaggeration
                            <input
                              type="range"
                              min={AXO_TERRAIN_EXAGGERATION_RANGE.min}
                              max={AXO_TERRAIN_EXAGGERATION_RANGE.max}
                              step={AXO_TERRAIN_EXAGGERATION_RANGE.step}
                              value={axoSettings.terrainExaggeration ?? DEFAULT_AXO_TERRAIN_EXAGGERATION}
                              onChange={(event) =>
                                setAxoSettings((prev) => ({ ...prev, terrainExaggeration: Number(event.target.value) }))
                              }
                            />
                            <span>×{axoSettings.terrainExaggeration ?? DEFAULT_AXO_TERRAIN_EXAGGERATION}</span>
                          </label>
                        )}
                        <label className="check-field">
                          <input
                            type="checkbox"
                            checked={axoSettings.showLabels}
                            onChange={(event) => setAxoSettings((prev) => ({ ...prev, showLabels: event.target.checked }))}
                          />
                          Layer labels
                        </label>
                      </section>
                    </>
                  )}
                  {sceneLayerRows.length > 0 && (
                    <>
                      <div className="outliner-divider" aria-hidden="true" />
                      <section className="sidebar-group outliner-section" aria-label="Layers">
                        <div className="card-head sidebar-gh">
                          <h3 className="card-title">Scene Layers</h3>
                          <div className="studio-layer-head-actions">
                            <span className="card-meta mono">
                              {sceneLayerRows.filter((row) => row.visible).length} visible
                            </span>
                            <button
                              type="button"
                              className="studio-reset-colours-btn"
                              onClick={resetSceneLayerColours}
                              title="Reset all layer and building use colours to default"
                            >
                              Reset colours
                            </button>
                          </div>
                        </div>
                        <div className="outliner-rows display-switches" role="group" aria-label="3D layers">
                          {sceneLayerRows.map((layer) => (
                            <div key={layer.id} className="o-row studio-layer-row">
                              <label className="o-left check-field">
                                <input
                                  className="sr-only"
                                  type="checkbox"
                                  checked={layer.visible}
                                  onChange={(event) => layer.onToggle(event.target.checked)}
                                />
                                <span className={layer.visible ? "o-eye l-eye on" : "o-eye l-eye off"} aria-hidden="true">{layer.visible ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg> : null}</span>
                                <span className="o-name">{layer.label}</span>
                              </label>
                              <span className="o-right">
                                {layer.meta ? (
                                  <span className="o-count studio-layer-meta mono" aria-hidden="true">
                                    {layer.meta}
                                  </span>
                                ) : null}
                                <label
                                  className="o-swatch-wrap legend-swatch"
                                  style={{ background: layer.color }}
                                  title={`Change ${layer.label.toLowerCase()} colour`}
                                >
                                  <input
                                    type="color"
                                    className="o-swatch-input"
                                    aria-label={`${layer.label} colour`}
                                    value={layer.color.toLowerCase()}
                                    onInput={(event) => layer.onPick((event.target as HTMLInputElement).value)}
                                    onChange={(event) => layer.onPick(event.target.value)}
                                  />
                                </label>
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                </div>
              )}
              {tab === "satellite" && (
                <p className="field-note">Satellite is a preview of this frame. It is not included in the downloads.</p>
              )}
            </div>
    </>
  );
}
