import * as THREE from "three";
import rhino3dm from "rhino3dm/rhino3dm.module.js";
import type { RhinoModuleOptions } from "rhino3dm";
import { BUILDING_USE_META, BUILDING_USES } from "./buildingUse";
import { buildCityGroup, disposeObject } from "./buildCity";
import { readDrawingStyle } from "./drawingStyle";
import { ensureSmoothPlanPaths, planPathsFromSiteStyle } from "./planPathsSession";
import { colourRgb, type ColourKey } from "./colours";
import { CRS_NOTE, mgaCrs, projectLocal, projectLonLat } from "./crs";
import { figureGround, figureGroundDatum } from "./figureGround";
import { planShadowRings, type PlanShadowInput } from "./buildingShadows";
import { buildHeliodonGroundOverlay, type HeliodonGroundExportOptions } from "./heliodonDiagram";
import { comBuildingHeightCreditLine } from "./comBuildingHeightCredit";
import { contourIsIndex, demContourLayer } from "./vicmapContours";
import { analyzeWindPeriod, sectorCenterDeg, type WindPeriodId, type WindRoseTable } from "./windRose";
import { plainDataCredit } from "./dataCredits";
import { windFlowArrowPolylines } from "./windArrowGeometry";
import { dashSegments } from "./drawingStyle";
import type { CityModel, Pt } from "../types";

type Rgb = { r: number; g: number; b: number };

type Rhino = Awaited<ReturnType<typeof rhino3dm>>;

function contourLayerColor(): Rgb {
  const hex = readDrawingStyle().contour.color;
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** Layer swatches, read when the file is written so a live colour edit is included. */
const BUILDING_LAYER_KEYS: Record<string, ColourKey> = {
  Residential: "--use-residential",
  Commercial: "--use-commercial",
  Retail: "--use-retail",
  MixedUse: "--use-mixed",
  Industrial: "--use-industrial",
  Civic: "--use-civic",
  Recreation: "--use-recreation",
  Outbuilding: "--use-outbuilding",
  Unclassified: "--use-unclassified",
};

/** Full layer path → theme key (or contour pen) for every Rhino layer CityCut writes. */
export function rhinoLayerColourKeys(): Record<string, ColourKey | "contour"> {
  const keys: Record<string, ColourKey | "contour"> = {
    Buildings: "--building-uniform",
    "Buildings::Site": "--site-building",
    Site: "--site-building",
    "Site::Boundary": "--site-boundary",
    Roads: "--road-arterial",
    Rail: "--rail-fill",
    Water: "--water-3d",
    Green: "--green-3d",
    Blocks: "--block-fill",
    Ground: "--ground-fill",
    Terrain: "--terrain-layer",
    Trees: "--tree-layer",
    Contours: "contour",
    FigureGround: "--figure-fill",
    "Sun path": "--sun-compass-label",
    Shadows: "--shadow-fill",
    Wind: "--wind-rose",
  };
  for (const use of BUILDING_USES) {
    const layer = BUILDING_USE_META[use].layer;
    keys[`Buildings::${layer}`] = BUILDING_LAYER_KEYS[layer];
  }
  return keys;
}

function layerColors(): Record<string, Rgb> {
  const keys = rhinoLayerColourKeys();
  const out: Record<string, Rgb> = {};
  for (const [name, key] of Object.entries(keys)) {
    if (key === "contour") out[name] = contourLayerColor();
    else out[name] = colourRgb(key);
  }
  return out;
}

function displayColor(color: Rgb) {
  return { r: color.r, g: color.g, b: color.b, a: 255 };
}

let rhinoPromise: Promise<Rhino> | null = null;

async function rhinoOptions(): Promise<RhinoModuleOptions> {
  // Vitest runs in Node, where the bundler URL for the wasm file is not a path
  // rhino3dm can read. The browser build drops this branch.
  if (import.meta.env.VITEST) {
    const { readFile } = await import("node:fs/promises");
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("rhino3dm/rhino3dm.wasm");
    return { wasmBinary: await readFile(wasmPath) };
  }
  const wasmUrl = (await import("rhino3dm/rhino3dm.wasm?url")).default;
  return { locateFile: () => wasmUrl };
}

export function loadRhino(): Promise<Rhino> {
  if (!rhinoPromise) {
    rhinoPromise = rhinoOptions().then((options) => rhino3dm(options));
  }
  return rhinoPromise;
}

function layerName(mesh: THREE.Mesh): string {
  return mesh.name || mesh.parent?.name || "Mesh";
}

function ensureMaterial(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  materials: Map<string, number>,
  name: string,
  color: Rgb,
): number {
  const cached = materials.get(name);
  if (cached !== undefined) return cached;
  const material = new rhino.Material();
  material.name = name;
  const swatch = displayColor(color);
  material.diffuseColor = swatch as unknown as number[];
  material.ambientColor = swatch as unknown as number[];
  const index = doc.materials().count;
  doc.materials().add(material);
  materials.set(name, index);
  release(material);
  return index;
}

function ensureLayer(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layers: Map<string, number>,
  materials: Map<string, number>,
  name: string,
  color: Rgb,
): number {
  const cached = layers.get(name);
  if (cached !== undefined) return cached;
  const parts = name.split("::");
  const layer = new rhino.Layer();
  layer.name = parts.length === 2 ? parts[1] : name;
  const swatch = displayColor(color);
  layer.color = swatch;
  layer.plotColor = swatch;
  if (parts.length === 2) {
    const palette = layerColors();
    const parentIndex = ensureLayer(
      rhino,
      doc,
      layers,
      materials,
      parts[0],
      palette[parts[0]] ?? colourRgb("--building-uniform"),
    );
    layer.parentLayerId = doc.layers().get(parentIndex).id;
  }
  layer.renderMaterialIndex = ensureMaterial(rhino, doc, materials, name, color);
  const index = doc.layers().add(layer);
  layers.set(name, index);
  return index;
}

function release(object: object) {
  (object as { delete?: () => void }).delete?.();
}

function applyByLayerAttributes(rhino: Rhino, attributes: InstanceType<Rhino["ObjectAttributes"]>) {
  attributes.colorSource = rhino.ObjectColorSource.ColorFromLayer;
  attributes.materialSource = rhino.ObjectMaterialSource.MaterialFromLayer;
  attributes.plotColorSource = rhino.ObjectPlotColorSource.PlotColorFromLayer;
}

function addWorldVertex(
  vertices: { addPoint3d(x: number, y: number, z: number): number },
  vertex: THREE.Vector3,
  model: CityModel,
  zone: number,
) {
  // Three.js is Y-up: x east, y elevation, z = −north.
  const [easting, northing] = projectLocal([vertex.x, -vertex.z], model.center, zone);
  vertices.addPoint3d(easting, northing, vertex.y);
}

function addMesh(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layers: Map<string, number>,
  materials: Map<string, number>,
  mesh: THREE.Mesh,
  model: CityModel,
  zone: number,
) {
  const position = mesh.geometry.getAttribute("position");
  if (!position || position.count < 3) return;

  const rhinoMesh = new rhino.Mesh();
  const vertices = rhinoMesh.vertices();
  vertices.useDoublePrecisionVertices = true;
  const faces = rhinoMesh.faces();
  const vertex = new THREE.Vector3();
  const index = mesh.geometry.getIndex();
  const instanced = mesh as THREE.InstancedMesh;

  if (instanced.isInstancedMesh) {
    const instanceMatrix = new THREE.Matrix4();
    const world = new THREE.Matrix4();
    for (let n = 0; n < instanced.count; n++) {
      instanced.getMatrixAt(n, instanceMatrix);
      world.multiplyMatrices(instanced.matrixWorld, instanceMatrix);
      const base = vertices.count;
      for (let i = 0; i < position.count; i++) {
        addWorldVertex(vertices, vertex.fromBufferAttribute(position, i).applyMatrix4(world), model, zone);
      }
      if (index) {
        for (let i = 0; i + 2 < index.count; i += 3) {
          faces.addTriFace(base + index.getX(i), base + index.getX(i + 1), base + index.getX(i + 2));
        }
      } else {
        for (let i = 0; i + 2 < position.count; i += 3) faces.addTriFace(base + i, base + i + 1, base + i + 2);
      }
    }
  } else {
    for (let i = 0; i < position.count; i++) {
      addWorldVertex(vertices, vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld), model, zone);
    }
    if (index) {
      for (let i = 0; i + 2 < index.count; i += 3) {
        faces.addTriFace(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
    } else {
      for (let i = 0; i + 2 < position.count; i += 3) faces.addTriFace(i, i + 1, i + 2);
    }
  }
  if (faces.count === 0) {
    release(rhinoMesh);
    return;
  }
  rhinoMesh.normals().computeNormals();

  const name = layerName(mesh);
  const palette = layerColors();
  const layerColor = (mesh.userData.layerColor as Rgb | undefined) ?? palette[name] ?? colourRgb("--rhino-fallback");
  const layerIndex = ensureLayer(rhino, doc, layers, materials, name, layerColor);
  const attributes = new rhino.ObjectAttributes();
  attributes.name = name;
  attributes.layerIndex = layerIndex;
  applyByLayerAttributes(rhino, attributes);
  const use = mesh.userData.use;
  const typologySource = mesh.userData.typologySource;
  if (typeof use === "string") attributes.setUserString("use", use);
  if (typeof typologySource === "string") attributes.setUserString("typology_source", typologySource);
  doc.objects().addMesh(rhinoMesh, attributes);
  release(rhinoMesh);
  release(attributes);
}

/** Unioned footprints as closed polylines on FigureGround, at the ground datum. */
function addFigureGround(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layers: Map<string, number>,
  materials: Map<string, number>,
  model: CityModel,
  zone: number,
) {
  const ground = figureGround(model.buildings, model.sideM, model.frameShape ?? "square");
  if (ground.polygons.length === 0) return;
  const z = figureGroundDatum(model);
  const layerIndex = ensureLayer(rhino, doc, layers, materials, "FigureGround", layerColors().FigureGround);
  for (const polygon of ground.polygons) {
    for (const ring of polygon) {
      const points: number[][] = [];
      const limit =
        ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
          ? ring.length - 1
          : ring.length;
      for (let i = 0; i < limit; i++) {
        const [easting, northing] = projectLocal([ring[i][0], ring[i][1]], model.center, zone);
        const last = points[points.length - 1];
        if (last && Math.hypot(last[0] - easting, last[1] - northing) < 0.001) continue;
        points.push([easting, northing, z]);
      }
      if (points.length < 3) continue;
      const first = points[0];
      points.push([first[0], first[1], first[2]]);
      const attributes = new rhino.ObjectAttributes();
      attributes.name = "FigureGround";
      attributes.layerIndex = layerIndex;
      applyByLayerAttributes(rhino, attributes);
      doc.objects().addPolyline(points, attributes);
      release(attributes);
    }
  }
}

/**
 * Contour polylines on a Contours layer, at their true elevation.
 * The 3dm did not previously contain contour curves. These are new, and they
 * sit at the contour's own Z because the rest of the file is Z-up metres.
 */
const PROPERTY_BOUNDARY_LINETYPE = "Property boundary";

export function ensurePropertyBoundaryLinetype(rhino: Rhino, doc: InstanceType<Rhino["File3dm"]>): number | null {
  const table = doc.linetypes();
  const existing = table.findName(PROPERTY_BOUNDARY_LINETYPE);
  if (existing) return existing.index;
  const segments = dashSegments(readDrawingStyle().siteBoundary.dash);
  if (!segments || segments.length < 4) return null;
  const linetype = new rhino.Linetype();
  linetype.name = PROPERTY_BOUNDARY_LINETYPE;
  linetype.clearPattern();
  for (let i = 0; i < segments.length; i++) {
    linetype.appendSegment(segments[i]!, i % 2 === 0);
  }
  table.add(linetype);
  return table.findName(PROPERTY_BOUNDARY_LINETYPE)?.index ?? null;
}

function addSiteBoundary(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layers: Map<string, number>,
  materials: Map<string, number>,
  model: CityModel,
  zone: number,
) {
  const lines = model.siteBoundaryLines;
  if (!lines || lines.length === 0) return;
  const z = model.terrain ? model.terrain.min : 0;
  const layerIndex = ensureLayer(rhino, doc, layers, materials, "Site::Boundary", layerColors()["Site::Boundary"]);
  const linetypeIndex = ensurePropertyBoundaryLinetype(rhino, doc);
  if (linetypeIndex !== null) {
    const layer = doc.layers().get(layerIndex);
    layer.linetypeIndex = linetypeIndex;
  }
  for (const line of lines) {
    const points: number[][] = [];
    for (const point of line) {
      const [easting, northing] = projectLocal(point, model.center, zone);
      const last = points[points.length - 1];
      if (last && Math.hypot(last[0] - easting, last[1] - northing) < 0.001) continue;
      points.push([easting, northing, z]);
    }
    if (points.length < 2) continue;
    const attributes = new rhino.ObjectAttributes();
    attributes.name = "Site boundary";
    attributes.layerIndex = layerIndex;
    applyByLayerAttributes(rhino, attributes);
    doc.objects().addPolyline(points, attributes);
    release(attributes);
  }
}

function addWindRose(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layers: Map<string, number>,
  materials: Map<string, number>,
  model: CityModel,
  zone: number,
  table: WindRoseTable,
  period: WindPeriodId,
) {
  const stats = analyzeWindPeriod(table, period);
  const z = (model.terrain ? model.terrain.min : 0) + 0.2;
  const layerIndex = ensureLayer(rhino, doc, layers, materials, "Wind", layerColors().Wind);
  const half = model.sideM / 2;
  const radius = model.sideM * 0.08;
  const cx = half * 0.72;
  const cy = -half * 0.72;
  const maxFreq = Math.max(...stats.sectorFrequency, 0.001);

  for (let sector = 0; sector < stats.sectorFrequency.length; sector++) {
    const freq = stats.sectorFrequency[sector] ?? 0;
    if (freq <= 0) continue;
    const r = (freq / maxFreq) * radius;
    const centre = sectorCenterDeg(sector);
    const halfAngle = 22.5 / 2;
    const points: number[][] = [[cx, cy, z]];
    for (let step = 0; step <= 5; step++) {
      const deg = centre - halfAngle + (step * (2 * halfAngle)) / 5;
      const rad = ((deg - 90) * Math.PI) / 180;
      const east = cx + Math.cos(rad) * r;
      const north = cy + Math.sin(rad) * r;
      const [easting, northing] = projectLocal([east, north], model.center, zone);
      points.push([easting, northing, z]);
    }
    points.push(points[0]!);
    const attributes = new rhino.ObjectAttributes();
    attributes.name = "Wind wedge";
    attributes.layerIndex = layerIndex;
    applyByLayerAttributes(rhino, attributes);
    doc.objects().addPolyline(points, attributes);
    release(attributes);
  }

  const fromDeg = sectorCenterDeg(stats.prevailingSector);
  const rad = ((fromDeg + 180 - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  for (let i = 0; i < 3; i++) {
    const offset = (i - 1) * radius * 0.2;
    const px = cx + offset * -dy;
    const py = cy + offset * dx;
    const len = radius * (0.5 + i * 0.12);
    const a = projectLocal([px - dx * len * 0.3, py - dy * len * 0.3], model.center, zone);
    const b = projectLocal([px + dx * len, py + dy * len], model.center, zone);
    const attributes = new rhino.ObjectAttributes();
    attributes.name = "Wind arrow";
    attributes.layerIndex = layerIndex;
    applyByLayerAttributes(rhino, attributes);
    doc.objects().addPolyline([[a[0], a[1], z], [b[0], b[1], z]], attributes);
    release(attributes);
  }

  const flowZ = z + 0.05;
  const flowLayer = layerIndex;
  for (const arrow of windFlowArrowPolylines(model.sideM, stats.prevailingSector)) {
    const pathPoints: number[][] = arrow.path.map(([east, north]) => {
      const [easting, northing] = projectLocal([east, north], model.center, zone);
      return [easting, northing, flowZ];
    });
    if (pathPoints.length >= 2) {
      const attributes = new rhino.ObjectAttributes();
      attributes.name = "Wind flow arrow";
      attributes.layerIndex = flowLayer;
      applyByLayerAttributes(rhino, attributes);
      doc.objects().addPolyline(pathPoints, attributes);
      release(attributes);
    }
    const headPoints: number[][] = arrow.head.map(([east, north]) => {
      const [easting, northing] = projectLocal([east, north], model.center, zone);
      return [easting, northing, flowZ];
    });
    if (headPoints.length >= 2) {
      const attributes = new rhino.ObjectAttributes();
      attributes.name = "Wind flow head";
      attributes.layerIndex = flowLayer;
      applyByLayerAttributes(rhino, attributes);
      doc.objects().addPolyline([headPoints[0]!, headPoints[1]!, headPoints[2]!, headPoints[1]!], attributes);
      release(attributes);
    }
  }
}

function addContours(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layers: Map<string, number>,
  materials: Map<string, number>,
  model: CityModel,
  zone: number,
) {
  if (model.contours === false) return;
  const layer = model.contourLayer ?? (model.contours && model.terrain ? demContourLayer(model.terrain, model.sideM) : null);
  if (!layer || layer.lines.length === 0) return;
  const every = readDrawingStyle().contourIndexEvery;
  const layerIndex = ensureLayer(rhino, doc, layers, materials, "Contours", layerColors().Contours);
  for (const line of layer.lines) {
    const points: number[][] = [];
    for (const point of line.points) {
      const [easting, northing] = projectLocal(point, model.center, zone);
      const last = points[points.length - 1];
      if (last && Math.hypot(last[0] - easting, last[1] - northing) < 0.001) continue;
      points.push([easting, northing, line.z]);
    }
    if (points.length < 2) continue;
    const attributes = new rhino.ObjectAttributes();
    attributes.name = "Contour";
    attributes.layerIndex = layerIndex;
    applyByLayerAttributes(rhino, attributes);
    attributes.setUserString("altitude", String(line.z));
    if (contourIsIndex(line.z, layer.interval, every)) attributes.setUserString("index", "yes");
    doc.objects().addPolyline(points, attributes);
    release(attributes);
  }
}

function addHeliodonPlan(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layers: Map<string, number>,
  materials: Map<string, number>,
  model: CityModel,
  zone: number,
  options: HeliodonGroundExportOptions,
) {
  const overlay = buildHeliodonGroundOverlay({ ...options, sideM: model.sideM });
  const z = model.terrain ? model.terrain.min : 0;
  const layerIndex = ensureLayer(rhino, doc, layers, materials, "Sun path", layerColors()["Sun path"]);

  const toWorld = (east: number, north: number): number[] => {
    const [easting, northing] = projectLocal([east, north], model.center, zone);
    return [easting, northing, z];
  };

  const addPolyline = (line: Pt[], name: string) => {
    const points = line.map(([east, north]) => toWorld(east, north));
    if (points.length < 2) return;
    const attributes = new rhino.ObjectAttributes();
    attributes.name = name;
    attributes.layerIndex = layerIndex;
    applyByLayerAttributes(rhino, attributes);
    doc.objects().addPolyline(points, attributes);
    release(attributes);
  };

  addPolyline(overlay.horizonRing, "Horizon ring");
  for (const ring of overlay.altitudeRings) addPolyline(ring, "Altitude ring");
  for (const tick of overlay.ticks) addPolyline([tick.a, tick.b], "Tick");
  for (const arc of overlay.arcs) addPolyline(arc.points, "Sun arc");
  for (const line of overlay.hourLines) addPolyline(line, "Hour line");
}

function addPlanShadows(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layers: Map<string, number>,
  materials: Map<string, number>,
  model: CityModel,
  zone: number,
  input: PlanShadowInput,
  castShadows: boolean,
) {
  const rings = planShadowRings(model, input, castShadows);
  if (rings.length === 0) return;
  const z = model.terrain ? model.terrain.min : 0;
  const layerIndex = ensureLayer(rhino, doc, layers, materials, "Shadows", layerColors()["Shadows"]);
  for (const polygon of rings) {
    for (const ring of polygon) {
      if (ring.length < 3) continue;
      const points = ring.map(([east, north]) => {
        const [easting, northing] = projectLocal([east, north], model.center, zone);
        return [easting, northing, z];
      });
      points.push(points[0]!);
      const attributes = new rhino.ObjectAttributes();
      attributes.name = "Shadow";
      attributes.layerIndex = layerIndex;
      applyByLayerAttributes(rhino, attributes);
      doc.objects().addPolyline(points, attributes);
      release(attributes);
    }
  }
}

export type CityModelTo3dmOptions = {
  heliodon?: HeliodonGroundExportOptions | null;
  shadows?: PlanShadowInput | null;
  castShadows?: boolean;
  uniformBuildings?: boolean;
  colourBySource?: boolean;
  wind?: { table: WindRoseTable; period: WindPeriodId } | null;
};

function normalize3dmOptions(
  options?: HeliodonGroundExportOptions | CityModelTo3dmOptions | null,
): CityModelTo3dmOptions {
  if (!options) return {};
  if (
    "heliodon" in options ||
    "castShadows" in options ||
    "shadows" in options ||
    "uniformBuildings" in options ||
    "wind" in options
  ) {
    return options;
  }
  return { heliodon: options as HeliodonGroundExportOptions };
}

/** Current city meshes as a Rhino .3dm in MGA metres, Z-up. */
export async function cityModelTo3dm(
  model: CityModel,
  options?: HeliodonGroundExportOptions | CityModelTo3dmOptions | null,
): Promise<Uint8Array> {
  const { heliodon, shadows, castShadows, uniformBuildings, colourBySource, wind } = normalize3dmOptions(options);
  await ensureSmoothPlanPaths(
    planPathsFromSiteStyle(model, 1000, readDrawingStyle(), {
      uniformBuildings: Boolean(uniformBuildings),
      colourBySource: Boolean(colourBySource),
    }),
  );
  const rhino = await loadRhino();
  const crs = mgaCrs(model.center.lon);
  const group = buildCityGroup(model, {
    splitBuildings: !uniformBuildings,
    uniformBuildings: Boolean(uniformBuildings),
    colourBySource: Boolean(colourBySource),
  });
  const doc = new rhino.File3dm();
  try {
    group.updateMatrixWorld(true);
    doc.applicationName = "CityCut";
    doc.applicationUrl = "https://kchaisor.github.io/citycut/";
    doc.applicationDetails = `${model.placeLabel}; ${crs.name}`;
    const comCredit = comBuildingHeightCreditLine(model);
    const buildingCredit = plainDataCredit({
      prefix: `CityCut. ${crs.name}. Metres, Z-up. ${CRS_NOTE}`,
      windOn: Boolean(wind?.table),
    });
    doc.startSectionComments = [buildingCredit, comCredit].filter(Boolean).join(" ");
    doc.settings().modelUnitSystem = rhino.UnitSystem.Meters;
    doc.settings().pageUnitSystem = rhino.UnitSystem.Meters;
    doc.strings().set("CRS", crs.name);
    doc.strings().set("CRS note", CRS_NOTE);
    if (comCredit) doc.strings().set("Building heights", comCredit);
    if (model.terrain) {
      doc.strings().set(
        "Vertical",
        `DEM metres from Mapterhorn zoom ${model.terrain.zoom}. The Terrain mesh is the surface only, ${model.terrain.min.toFixed(2)} to ${model.terrain.max.toFixed(2)} m, with no skirt or thickness.`,
      );
    }

    const [easting, northing] = projectLonLat(model.center.lon, model.center.lat, crs.zone);
    const anchor = doc.settings().earthAnchorPoint;
    anchor.earthBasepointLatitude = model.center.lat;
    anchor.earthBasepointLongitude = model.center.lon;
    anchor.earthBasepointElevation = 0;
    anchor.modelBasePoint = [easting, northing, 0];
    anchor.modelEast = [1, 0, 0];
    anchor.modelNorth = [0, 1, 0];
    anchor.name = crs.name;
    anchor.description = CRS_NOTE;
    doc.settings().earthAnchorPoint = anchor;

    const layers = new Map<string, number>();
    const materials = new Map<string, number>();
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      addMesh(rhino, doc, layers, materials, mesh, model, crs.zone);
    });
    addFigureGround(rhino, doc, layers, materials, model, crs.zone);
    addSiteBoundary(rhino, doc, layers, materials, model, crs.zone);
    addContours(rhino, doc, layers, materials, model, crs.zone);
    if (heliodon) addHeliodonPlan(rhino, doc, layers, materials, model, crs.zone, heliodon);
    if (shadows) addPlanShadows(rhino, doc, layers, materials, model, crs.zone, shadows, Boolean(castShadows));
    if (wind?.table) addWindRose(rhino, doc, layers, materials, model, crs.zone, wind.table, wind.period);

    return doc.toByteArray();
  } finally {
    doc.destroy();
    disposeObject(group);
  }
}
