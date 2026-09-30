import { useCallback, useState } from "react";
import { Building2, Download, DraftingCompass, Info, Trees } from "lucide-react";
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
import { drawerIsAvailable, loadModelDrawer, reduceRail, saveModelDrawer } from "../lib/railState";
import { treeSizeSummary, treeTierCounts } from "../lib/trees";
import { VICMAP_ATTRIBUTION } from "../lib/vicmapTrees";
import type { CityModel } from "../types";
import { Drawer } from "./Drawer";
import { DrawingPlan, type DrawingKind } from "./DrawingPlan";
import { IconRail, type RailItem } from "./IconRail";
import { SatellitePane } from "./SatellitePane";
import { Scene3D } from "./Scene3D";
import { SceneBoundary } from "./SceneBoundary";

type Tab = "3d" | "drawing" | "satellite";

const DRAWER_ID = "model-drawer";
const iconProps = { size: 18, strokeWidth: 1.75, "aria-hidden": true as const };

const TITLES: Record<string, string> = {
  summary: "Model details",
  buildings: "Buildings",
  trees: "Tree sizes",
  drawing: "Drawing",
  exports: "Exports",
};

export function ModelPage({ model }: { model: CityModel }) {
  const [tab, setTab] = useState<Tab>("3d");
  const [drawing, setDrawing] = useState<DrawingKind>("site");
  const [figureScale, setFigureScale] = useState<number>(() => preferredFigureScale(model.sideM));
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"glb" | "svg" | "3dm" | "fg-svg" | "fg-pdf" | null>(null);
  const [colourByUse, setColourByUse] = useState(true);
  const [showSource, setShowSource] = useState(false);
  const [preferred, setPreferred] = useState<string | null>(() => loadModelDrawer());
  const [planWidth, setPlanWidth] = useState<number | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const onScale = useCallback((widthM: number) => setPlanWidth(widthM), []);
  const crs = mgaCrs(model.center.lon);
  const sideKm = model.sideM / 1000;
  const tierCounts = treeTierCounts(model.trees);
  const showBuildings = model.layers.buildings && model.buildings.length > 0;
  const showTrees = model.layers.trees && model.trees.length > 0;
  const layerBits = [
    model.layers.buildings ? "buildings" : null,
    model.layers.roads ? "roads and rail" : null,
    model.layers.waterGreen ? "water and green" : null,
    model.layers.trees ? "trees" : null,
    model.terrain ? "terrain" : null,
  ].filter(Boolean);

  const items: RailItem[] = [
    { id: "summary", label: "Model details", icon: <Info {...iconProps} /> },
  ];
  if (showBuildings) items.push({ id: "buildings", label: "Buildings", icon: <Building2 {...iconProps} /> });
  if (showTrees) items.push({ id: "trees", label: "Tree sizes", icon: <Trees {...iconProps} /> });
  items.push(
    { id: "drawing", label: "Drawing", icon: <DraftingCompass {...iconProps} /> },
    { id: "exports", label: "Exports", icon: <Download {...iconProps} /> },
  );
  const open = drawerIsAvailable(preferred, items.map((item) => item.id));

  function toggle(id: string) {
    const next = reduceRail(preferred, { type: "toggle", id });
    saveModelDrawer(next);
    setPreferred(next);
  }

  function close() {
    const next = reduceRail(preferred, { type: "close" });
    saveModelDrawer(next);
    setPreferred(next);
  }

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
      <h1 className="sr-only">Your model is ready.</h1>
      <div className={tab === "drawing" ? "viewport is-drawing" : "viewport"}>
        <div className="fill">
          {tab === "3d" && (
            <SceneBoundary>
              <Scene3D model={model} uniformBuildings={!colourByUse && !showSource} colourBySource={showSource} />
            </SceneBoundary>
          )}
          {tab === "drawing" && (
            <DrawingPlan key={fitToken} model={model} kind={drawing} onScale={onScale} />
          )}
          {tab === "satellite" && <SatellitePane model={model} />}
        </div>
        <div className="chrome model-chrome">
          <IconRail items={items} openId={open} onToggle={toggle} label="Model tools" drawerId={DRAWER_ID} />
          <Drawer id={DRAWER_ID} open={open !== null} title={TITLES[open ?? "summary"] ?? "Model details"} onClose={close}>
            <div className="drawer-section" hidden={open !== "summary"}>
              <p className="ready-title">Your model is ready.</p>
              <p className="meta">
                {model.placeLabel} · {formatCoord(model.center.lat)}, {formatCoord(model.center.lon)} ·{" "}
                {Math.round(model.sideM)} × {Math.round(model.sideM)} m
              </p>
              <p className="meta">{model.sourceNote}</p>
              {model.terrainError && <p className="error">{model.terrainError}</p>}
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

            {showBuildings && (
              <div className="drawer-section legend" hidden={open !== "buildings"}>
                <div className="panel-toolbar">
                  <button
                    type="button"
                    data-autofocus="true"
                    aria-pressed={colourByUse && !showSource}
                    onClick={() => {
                      setShowSource(false);
                      setColourByUse((on) => !on);
                    }}
                  >
                    {colourByUse ? "Uniform colour" : "Colour by use"}
                  </button>
                  <button type="button" aria-pressed={showSource} onClick={() => setShowSource((on) => !on)}>
                    {showSource ? "Showing source" : "Show source"}
                  </button>
                </div>
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
              </div>
            )}

            {showTrees && (
              <div className="drawer-section tree-sizes" hidden={open !== "trees"}>
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
                {model.treeCapHit && (
                  <p className="legend-note">
                    Tree count was capped at 8,000. Canopy infill was trimmed first, then Vicmap.
                  </p>
                )}
                {tierCounts.vicmap > 0 && <p className="tree-credit">{VICMAP_ATTRIBUTION}</p>}
              </div>
            )}

            <div className="drawer-section" hidden={open !== "drawing"}>
              <div className="tabs" role="tablist" aria-label="Model views">
                {(
                  [
                    ["3d", "3D model"],
                    ["drawing", "Drawing"],
                    ["satellite", "Satellite"],
                  ] as const
                ).map(([id, label], index) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    data-autofocus={index === 0 ? "true" : undefined}
                    aria-selected={tab === id}
                    className={tab === id ? "active" : ""}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="plan-switch" role="group" aria-label="Drawing type">
                <button
                  type="button"
                  aria-pressed={drawing === "site"}
                  onClick={() => {
                    setDrawing("site");
                    setTab("drawing");
                  }}
                >
                  Site plan
                </button>
                <button
                  type="button"
                  aria-pressed={drawing === "figure-ground"}
                  onClick={() => {
                    setDrawing("figure-ground");
                    setTab("drawing");
                  }}
                >
                  Figure-ground
                </button>
              </div>
              {drawing === "figure-ground" && (
                <label className="scale-field">
                  Scale
                  <select
                    value={figureScale}
                    aria-label="Figure-ground scale"
                    onChange={(event) => setFigureScale(Number(event.target.value))}
                  >
                    {FIGURE_SCALES.map((scale) => (
                      <option key={scale} value={scale}>
                        1:{scale}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {tab === "drawing" && (
                <div className="field">
                  <div className="field-head">
                    <p className="kicker">View width</p>
                    <strong>{planWidth === null ? "—" : `${Math.round(planWidth)} m`}</strong>
                  </div>
                  <p className="field-note">
                    Width of the drawing in view. The frame is {Math.round(model.sideM)} m on a side.
                  </p>
                  <button className="ghost" type="button" onClick={() => setFitToken((token) => token + 1)}>
                    Fit frame
                  </button>
                </div>
              )}
              {tab !== "drawing" && (
                <p className="field-note">
                  {tab === "3d"
                    ? "The 3D model fills the screen. Orbit from the hint along the bottom."
                    : "Satellite is a preview of this frame. It is not saved in the glTF."}
                </p>
              )}
            </div>

            <div className="drawer-section" hidden={open !== "exports"}>
              <div className="exports">
                <article className="card">
                  <div>
                    <h3>
                      glTF <span>.glb</span>
                    </h3>
                    <p>
                      {model.terrain
                        ? "Buildings, roads, water, green, trees, and a Terrain mesh."
                        : "Buildings, roads, water, green, and trees as meshes. Flat ground, no textures."}
                    </p>
                  </div>
                  <button className="ghost" type="button" data-autofocus="true" disabled={busy !== null} onClick={saveGlb}>
                    {busy === "glb" ? "Preparing…" : "Download"}
                  </button>
                </article>
                <article className="card">
                  <div>
                    <h3>
                      Rhino <span>.3dm</span>
                    </h3>
                    <p>The same meshes in {crs.name}, metres, Z-up, plus figure-ground curves.</p>
                  </div>
                  <button className="ghost" type="button" disabled={busy !== null} onClick={save3dm}>
                    {busy === "3dm" ? "Preparing…" : "Download"}
                  </button>
                </article>
                <article className="card">
                  <div>
                    <h3>
                      Site plan <span>.svg</span>
                    </h3>
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
                    <h3>
                      Figure-ground <span>.svg .pdf</span>
                    </h3>
                    <p>Black footprints on white, true scale. A3 landscape or portrait, whichever fits the frame.</p>
                  </div>
                  <div className="figure-export">
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
          </Drawer>
        </div>
        {model.terrainError && (
          <p className="stage-error" role="alert">
            {model.terrainError}
          </p>
        )}
        <p className="viewport-hint">{hint}</p>
        <p className="stage-attrib">
          Map data © OpenStreetMap contributors. Satellite imagery © Esri, Vantor, Earthstar Geographics, and the GIS
          User Community.
          {model.terrain && (
            <>
              {" "}
              Terrain <a href="https://mapterhorn.com/attribution">© Mapterhorn</a>.
            </>
          )}
          {tierCounts.vicmap > 0 && (
            <>
              {" "}
              <a href="https://discover.data.vic.gov.au/dataset/vicmap-vegetation-tree-urban">
                Vicmap Vegetation Tree Urban
              </a>{" "}
              © State of Victoria (Department of Transport and Planning),{" "}
              <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
            </>
          )}{" "}
          CityCut · Kelvin Chai.
        </p>
      </div>
    </div>
  );
}
