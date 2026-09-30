import { useState } from "react";
import {
  BUILDING_USES,
  BUILDING_USE_META,
  SOURCE_COUNT_KEYS,
  SOURCE_META,
  countSources,
  countUses,
} from "../lib/buildingUse";
import { CRS_NOTE, mgaCrs } from "../lib/crs";
import { download3dm, downloadFigureGround, downloadGlb, downloadSvg } from "../lib/download";
import { FIGURE_SCALES, preferredFigureScale, sheetFitMessage } from "../lib/figureGround";
import { formatCoord, formatLengthKm } from "../lib/geo";
import { BUILDINGS_LEGEND_COLLAPSED_KEY, TREES_LEGEND_COLLAPSED_KEY } from "../lib/panelCollapse";
import { treeSizeSummary } from "../lib/trees";
import type { CityModel } from "../types";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { DrawingPlan, type DrawingKind } from "./DrawingPlan";
import { SatellitePane } from "./SatellitePane";
import { Scene3D } from "./Scene3D";
import { SceneBoundary } from "./SceneBoundary";

type Tab = "3d" | "drawing" | "satellite";

export function ModelPage({ model }: { model: CityModel }) {
  const [tab, setTab] = useState<Tab>("3d");
  const [drawing, setDrawing] = useState<DrawingKind>("site");
  const [figureScale, setFigureScale] = useState<number>(() => preferredFigureScale(model.sideM));
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"glb" | "svg" | "3dm" | "fg-svg" | "fg-pdf" | null>(null);
  const [colourByUse, setColourByUse] = useState(true);
  const [showSource, setShowSource] = useState(false);
  const crs = mgaCrs(model.center.lon);
  const sideKm = model.sideM / 1000;
  const layerBits = [
    model.layers.buildings ? "buildings" : null,
    model.layers.roads ? "roads and rail" : null,
    model.layers.waterGreen ? "water and green" : null,
    model.layers.trees ? "trees" : null,
    model.terrain ? "terrain" : null,
  ].filter(Boolean);

  async function saveGlb() {
    setExportError(null);
    setBusy("glb");
    try {
      await downloadGlb(model);
    } catch {
      setExportError("The glTF file could not be written.");
    } finally {
      setBusy(null);
    }
  }

  async function save3dm() {
    setExportError(null);
    setBusy("3dm");
    try {
      await download3dm(model);
    } catch {
      setExportError("The Rhino file could not be written.");
    } finally {
      setBusy(null);
    }
  }

  function saveSvg() {
    setExportError(null);
    setBusy("svg");
    try {
      downloadSvg(model);
    } catch {
      setExportError("The SVG file could not be written.");
    } finally {
      setBusy(null);
    }
  }

  function saveFigure(extension: "svg" | "pdf") {
    setExportError(null);
    setBusy(extension === "svg" ? "fg-svg" : "fg-pdf");
    try {
      downloadFigureGround(model, figureScale, extension);
    } catch {
      setExportError("The figure-ground file could not be written.");
    } finally {
      setBusy(null);
    }
  }

  const figureFit = sheetFitMessage(model.sideM, figureScale);
  const useCounts = countUses(model.buildings);
  const sourceCounts = countSources(model.buildings);
  const hint =
    tab === "3d"
      ? "Drag to orbit · scroll to zoom · right-drag to pan"
      : tab === "drawing"
        ? "Scroll to zoom · drag to pan · double-click to fit"
        : "Satellite preview of this frame. It is not saved in the glTF.";

  return (
    <div className="model">
      <div className="model-inner">
        <div className="model-head">
          <div>
            <h1>Your model is ready.</h1>
            <p className="meta">
              {model.placeLabel} · {formatCoord(model.center.lat)}, {formatCoord(model.center.lon)} ·{" "}
              {Math.round(model.sideM)} × {Math.round(model.sideM)} m
            </p>
            <p className="meta">{model.sourceNote}</p>
            {model.terrainError && (
              <p className="error" role="alert">
                {model.terrainError}
              </p>
            )}
          </div>
          <dl className="stats">
            {model.layers.buildings && (
              <div>
                <dt>Buildings</dt>
                <dd>{model.buildings.length.toLocaleString()}</dd>
              </div>
            )}
            {model.layers.roads && (
              <div>
                <dt title="Clipped centerline length of roads, paths, and rail">Roads, km</dt>
                <dd>{formatLengthKm(model.roadKm)}</dd>
              </div>
            )}
            {model.layers.trees && (
              <div>
                <dt>Trees</dt>
                <dd>{model.trees.length.toLocaleString()}</dd>
              </div>
            )}
            {model.terrain && (
              <div>
                <dt>Elevation, m</dt>
                <dd>
                  {model.terrain.min.toFixed(0)}–{model.terrain.max.toFixed(0)}
                </dd>
              </div>
            )}
            <div>
              <dt>Area</dt>
              <dd>{(sideKm * sideKm).toFixed(2)} km²</dd>
            </div>
          </dl>
        </div>

        <div className="tabs" role="tablist" aria-label="Model views">
          {(
            [
              ["3d", "3D model"],
              ["drawing", "Drawing"],
              ["satellite", "Satellite"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "drawing" && (
          <div className="plan-switch" role="group" aria-label="Drawing type">
            <button type="button" aria-pressed={drawing === "site"} onClick={() => setDrawing("site")}>
              Site plan
            </button>
            <button
              type="button"
              aria-pressed={drawing === "figure-ground"}
              onClick={() => setDrawing("figure-ground")}
            >
              Figure-ground
            </button>
          </div>
        )}

        <div className="viewport">
          <div className="fill">
            {tab === "3d" && (
              <SceneBoundary>
                <Scene3D
                  model={model}
                  uniformBuildings={!colourByUse && !showSource}
                  colourBySource={showSource}
                />
              </SceneBoundary>
            )}
            {tab === "drawing" && <DrawingPlan model={model} kind={drawing} />}
            {tab === "satellite" && <SatellitePane model={model} />}
          </div>
          {tab === "3d" && (model.layers.buildings || model.layers.trees) && (
            <div className="hud">
              {model.layers.trees && model.trees.length > 0 && (
                <CollapsiblePanel
                  storageKey={TREES_LEGEND_COLLAPSED_KEY}
                  title="Tree sizes"
                  controlsLabel="tree sizes"
                  className="tree-sizes"
                  ariaLabel="Tree sizes"
                >
                  <p className="tree-readout">{treeSizeSummary(model.trees)}</p>
                </CollapsiblePanel>
              )}
              {model.layers.buildings && model.buildings.length > 0 && (
                <CollapsiblePanel
                  storageKey={BUILDINGS_LEGEND_COLLAPSED_KEY}
                  title="Buildings"
                  controlsLabel="Buildings legend"
                  className="legend"
                  ariaLabel="Building use"
                  toolbar={
                    <>
                      <button
                        type="button"
                        aria-pressed={colourByUse && !showSource}
                        onClick={() => {
                          setShowSource(false);
                          setColourByUse((on) => !on);
                        }}
                      >
                        {colourByUse ? "Uniform colour" : "Colour by use"}
                      </button>
                      <button
                        type="button"
                        aria-pressed={showSource}
                        onClick={() => setShowSource((on) => !on)}
                      >
                        {showSource ? "Showing source" : "Show source"}
                      </button>
                    </>
                  }
                >
                  <ul>
                    {BUILDING_USES.filter((use) => useCounts[use] > 0).map((use) => (
                      <li key={use}>
                        <i
                          style={{
                            background: colourByUse && !showSource ? BUILDING_USE_META[use].color : "#f6f3ec",
                          }}
                        />
                        <span>{BUILDING_USE_META[use].label}</span>
                        <b>{useCounts[use].toLocaleString()}</b>
                      </li>
                    ))}
                  </ul>
                  <p className="legend-sub">Source</p>
                  <ul>
                    {SOURCE_COUNT_KEYS.map((source) => (
                      <li key={source}>
                        <i
                          className={SOURCE_META[source].inferred ? "hatch" : undefined}
                          style={{
                            backgroundColor: showSource ? SOURCE_META[source].color : "#f6f3ec",
                          }}
                        />
                        <span>{SOURCE_META[source].label}</span>
                        <b>{sourceCounts[source].toLocaleString()}</b>
                      </li>
                    ))}
                  </ul>
                  {model.useTierFailures?.map((failure) => (
                    <p key={failure.tier} className="legend-note">
                      {failure.message}
                    </p>
                  ))}
                </CollapsiblePanel>
              )}
            </div>
          )}
          <p className="viewport-hint">{hint}</p>
        </div>

        <div className="exports">
          <article className="card">
            <div>
              <h2>
                glTF <span>.glb</span>
              </h2>
              <p>
                {model.terrain
                  ? "Buildings, roads, water, green, trees, and a Terrain mesh."
                  : "Buildings, roads, water, green, and trees as meshes. Flat ground, no textures."}
              </p>
            </div>
            <button className="ghost" type="button" disabled={busy !== null} onClick={saveGlb}>
              {busy === "glb" ? "Preparing…" : "Download"}
            </button>
          </article>
          <article className="card">
            <div>
              <h2>
                Rhino <span>.3dm</span>
              </h2>
              <p>The same meshes in {crs.name}, metres, Z-up, plus figure-ground curves.</p>
            </div>
            <button className="ghost" type="button" disabled={busy !== null} onClick={save3dm}>
              {busy === "3dm" ? "Preparing…" : "Download"}
            </button>
          </article>
          <article className="card">
            <div>
              <h2>
                Site plan <span>.svg</span>
              </h2>
              <p>
                {model.contours && model.terrain
                  ? "The same block as vectors, plus contour lines."
                  : "The same block as vectors: building fills, road lines, water, green, and tree symbols."}
              </p>
            </div>
            <button className="ghost" type="button" disabled={busy !== null} onClick={saveSvg}>
              {busy === "svg" ? "Preparing…" : "Download"}
            </button>
          </article>
          <article className="card figure-card">
            <div>
              <h2>
                Figure-ground <span>.svg .pdf</span>
              </h2>
              <p>Black footprints on white, true scale. A3 landscape or portrait, whichever fits the frame.</p>
            </div>
            <div className="figure-export">
              <label>
                Scale
                <select
                  value={figureScale}
                  aria-label="Figure-ground scale"
                  disabled={busy !== null}
                  onChange={(event) => setFigureScale(Number(event.target.value))}
                >
                  {FIGURE_SCALES.map((scale) => (
                    <option key={scale} value={scale}>
                      1:{scale}
                    </option>
                  ))}
                </select>
              </label>
              <button className="ghost" type="button" disabled={busy !== null} onClick={() => saveFigure("svg")}>
                {busy === "fg-svg" ? "Preparing…" : "SVG"}
              </button>
              <button className="ghost" type="button" disabled={busy !== null} onClick={() => saveFigure("pdf")}>
                {busy === "fg-pdf" ? "Preparing…" : "PDF"}
              </button>
            </div>
            {figureFit && (
              <p className="fit-note" id="figure-fit">
                {figureFit}
              </p>
            )}
          </article>
        </div>
        <p className="v2">
          This file includes {layerBits.join(", ") || "an empty block"}. DXF, DAE, and JPG are not
          available in this version.
        </p>
        <p className="v2">{CRS_NOTE}</p>
        {exportError && (
          <p className="error" role="alert">
            {exportError}
          </p>
        )}

        <footer className="page-foot">
          Map data © OpenStreetMap contributors. Satellite imagery © Esri, Maxar, Earthstar
          Geographics, and the GIS User Community.
          {model.terrain && (
            <>
              {" "}
              Terrain{" "}
              <a href="https://mapterhorn.com/attribution">© Mapterhorn</a>.
            </>
          )}{" "}
          CityCut · Kelvin Chai.
        </footer>
      </div>
    </div>
  );
}
