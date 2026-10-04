import { clipPolygon, clipPolyline } from "./clip";
import { dedupeAreas, dedupeRoads } from "./footprints";
import { dedupeConsecutive, openRing, polylineLength, signedArea, toLocal } from "./geo";
import { isOpenWaterArea } from "./waterAreas";
import { roadSpecFromHighway, roadSpecFromRailway } from "./roadCatalog";
import { describeTrees, treeSize, trunkTaggedAsCentimetres } from "./trees";
import type {
  AreaFeat,
  CityModel,
  LonLat,
  ModelLayers,
  Pt,
  RoadFeat,
  RoadGrade,
  TreeFeat,
} from "../types";

const MAX_RELATION_MEMBERS = 80;
const MIN_AREA = 4;

/** Replaced when a terrain heightfield is attached to the model. */
export const FLAT_GROUND_NOTE = "Ground is flat — no lidar or terrain in this version.";

/** Legacy Overpass-shaped fixtures for unit tests only. */
export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: {
    type: string;
    ref: number;
    role: string;
    geometry?: { lat: number; lon: number }[];
  }[];
};

export type OverpassResponse = {
  elements: OverpassElement[];
  remark?: string;
};

type Geom = { lat: number; lon: number };

function pointsFromGeom(geom: Geom[] | undefined, origin: LonLat): Pt[] {
  if (!geom || geom.length === 0) return [];
  const raw: Pt[] = [];
  for (const node of geom) {
    if (!Number.isFinite(node.lat) || !Number.isFinite(node.lon)) continue;
    raw.push(toLocal(node.lat, node.lon, origin));
  }
  const closed =
    raw.length >= 4 &&
    Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < 1;
  const points = dedupeConsecutive(raw, 0.15);
  if (closed && points.length >= 3) {
    const start = points[0];
    const end = points[points.length - 1];
    if (Math.hypot(start[0] - end[0], start[1] - end[1]) > 0.2) points.push([start[0], start[1]]);
  }
  return points;
}

function isClosed(points: Pt[]): boolean {
  if (points.length < 4) return false;
  const a = points[0];
  const b = points[points.length - 1];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1;
}

function ensureClosed(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const a = points[0];
  const b = points[points.length - 1];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1) {
    return [...points.slice(0, -1), a];
  }
  return points;
}

function closeEnough(a: Pt, b: Pt): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.2;
}

/** Join relation member ways that share endpoints into closed rings. */
export function stitchRings(lines: Pt[][]): Pt[][] {
  const pool = lines.map((line) => line.slice()).filter((line) => line.length >= 2);
  const rings: Pt[][] = [];

  while (pool.length > 0) {
    const chain = pool.pop()!;
    let guard = 0;
    while (guard++ < 1000) {
      if (chain.length >= 4 && closeEnough(chain[0], chain[chain.length - 1])) break;
      const end = chain[chain.length - 1];
      const start = chain[0];
      let found = -1;
      let mode = "";
      for (let i = 0; i < pool.length; i++) {
        const way = pool[i];
        const head = way[0];
        const tail = way[way.length - 1];
        if (closeEnough(end, head)) {
          found = i;
          mode = "end-start";
          break;
        }
        if (closeEnough(end, tail)) {
          found = i;
          mode = "end-end";
          break;
        }
        if (closeEnough(start, tail)) {
          found = i;
          mode = "start-end";
          break;
        }
        if (closeEnough(start, head)) {
          found = i;
          mode = "start-start";
          break;
        }
      }
      if (found < 0) break;
      const way = pool.splice(found, 1)[0];
      if (mode === "end-start") chain.push(...way.slice(1));
      else if (mode === "end-end") chain.push(...way.slice(0, -1).reverse());
      else if (mode === "start-end") chain.unshift(...way.slice(0, -1));
      else chain.unshift(...way.slice(1).reverse());
    }
    if (chain.length >= 4 && closeEnough(chain[0], chain[chain.length - 1])) {
      rings.push(ensureClosed(chain));
    }
  }
  return rings;
}

function areaKind(tags: Record<string, string>): "water" | "green" | null {
  if (isOpenWaterArea(tags)) {
    return "water";
  }
  if (
    tags.leisure === "park" ||
    tags.leisure === "garden" ||
    tags.leisure === "nature_reserve" ||
    tags.leisure === "pitch" ||
    tags.landuse === "forest" ||
    tags.landuse === "grass" ||
    tags.landuse === "meadow" ||
    tags.landuse === "recreation_ground" ||
    tags.landuse === "village_green" ||
    tags.landuse === "cemetery" ||
    tags.natural === "wood" ||
    tags.natural === "scrub" ||
    tags.natural === "wetland"
  ) {
    return "green";
  }
  return null;
}

function hidden(tags: Record<string, string>): boolean {
  return tags.tunnel === "yes" || tags.tunnel === "culvert" || tags.location === "underground" || tags.indoor === "yes";
}

function roadWidth(tags: Record<string, string>): { width: number; kind: "road" | "rail"; grade?: RoadGrade } | null {
  if (tags.railway) return roadSpecFromRailway(tags.railway);
  const highway = tags.highway;
  if (!highway) return null;
  return roadSpecFromHighway(highway.split(";")[0]);
}

function ringCentroid(points: Pt[]): Pt | null {
  const open = openRing(points);
  if (open.length === 0) return null;
  let east = 0;
  let north = 0;
  for (const point of open) {
    east += point[0];
    north += point[1];
  }
  return [east / open.length, north / open.length];
}

/** Places along a line, including the start, at about `spacing` metres. */
function pointsAlong(line: Pt[], spacing: number): Pt[] {
  if (line.length === 0) return [];
  const out: Pt[] = [[line[0][0], line[0][1]]];
  if (spacing <= 0) return out;
  let since = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.05) continue;
    let walked = 0;
    while (since + (length - walked) >= spacing - 1e-6) {
      const need = spacing - since;
      walked += need;
      const t = walked / length;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      since = 0;
      if (out.length > 4000) return out;
    }
    since += length - walked;
  }
  return out;
}

function insideCut(at: Pt, half: number): boolean {
  return Math.abs(at[0]) <= half + 0.2 && Math.abs(at[1]) <= half + 0.2;
}

function optionalTag(tags: Record<string, string>, key: string): string | undefined {
  const value = tags[key]?.trim();
  return value ? value : undefined;
}

function pushTree(trees: TreeFeat[], id: number, at: Pt, tags: Record<string, string>, half: number) {
  if (!insideCut(at, half)) return;
  const size = treeSize(tags);
  const genus = optionalTag(tags, "genus");
  const species = optionalTag(tags, "species");
  const taxon = optionalTag(tags, "taxon");
  const leafType = optionalTag(tags, "leaf_type");
  const leafCycle = optionalTag(tags, "leaf_cycle");
  trees.push({
    id,
    at,
    height_m: size.height_m,
    crown_diameter_m: size.crown_diameter_m,
    trunk_diameter_m: size.trunk_diameter_m,
    sizeSource: size.sizeSource,
    ...(genus ? { genus } : {}),
    ...(species ? { species } : {}),
    ...(taxon ? { taxon } : {}),
    ...(leafType ? { leafType } : {}),
    ...(leafCycle ? { leafCycle } : {}),
    tier: "osm",
  });
}

function collectTrees(elements: OverpassElement[], origin: LonLat, half: number): TreeFeat[] {
  const trees: TreeFeat[] = [];
  let centimetreTrunks = 0;
  const noteTrunk = (tags: Record<string, string>) => {
    if (trunkTaggedAsCentimetres(tags)) centimetreTrunks += 1;
  };
  for (const element of elements) {
    const tags = element.tags ?? {};
    if (hidden(tags)) continue;
    if (element.type === "node") {
      if (tags.natural !== "tree" || element.lat == null || element.lon == null) continue;
      noteTrunk(tags);
      pushTree(trees, element.id, toLocal(element.lat, element.lon, origin), tags, half);
      continue;
    }
    if (element.type !== "way") continue;
    if (tags.natural !== "tree" && tags.natural !== "tree_row") continue;
    const line = pointsFromGeom(element.geometry, origin);
    if (line.length < 2) continue;
    noteTrunk(tags);
    if (tags.natural === "tree" && isClosed(line)) {
      const at = ringCentroid(line);
      if (at) pushTree(trees, element.id, at, tags, half);
      continue;
    }
    const size = treeSize(tags);
    const spacing = Math.min(14, Math.max(6, size.crown_diameter_m));
    for (const part of clipPolyline(line, -half, half)) {
      for (const point of pointsAlong(part, spacing)) {
        pushTree(trees, element.id, point, tags, half);
      }
    }
  }
  if (centimetreTrunks > 0) {
    console.info(
      `CityCut corrected ${centimetreTrunks} tree trunk ${centimetreTrunks === 1 ? "measurement" : "measurements"} that were in centimetres.`,
    );
  }
  return trees;
}

function clipRing(points: Pt[], half: number): Pt[] {
  const clipped = clipPolygon(points, -half, half);
  if (clipped.length < 3) return [];
  if (Math.abs(signedArea(clipped)) < MIN_AREA) return [];
  return clipped;
}

function pushArea(
  areas: AreaFeat[],
  id: number,
  kind: "water" | "green",
  outer: Pt[],
  holes: Pt[][],
  half: number,
  tags: Record<string, string>,
) {
  const ring = clipRing(outer, half);
  if (ring.length < 3) return;
  if (kind === "water" && !isOpenWaterArea(tags, Math.abs(signedArea(ring)))) return;
  const clippedHoles = holes
    .map((hole) => clipRing(hole, half))
    .filter((hole) => hole.length >= 3);
  areas.push({ id, kind, ring, holes: clippedHoles });
}

function relationRings(
  element: OverpassElement,
  origin: LonLat,
): { outers: Pt[][]; inners: Pt[][]; used: number[] } | null {
  const members = element.members ?? [];
  if (members.length === 0 || members.length > MAX_RELATION_MEMBERS) return null;
  const outers: Pt[][] = [];
  const inners: Pt[][] = [];
  const used: number[] = [];
  for (const member of members) {
    if (member.type !== "way" || !member.geometry) continue;
    const line = pointsFromGeom(member.geometry, origin);
    if (line.length < 2) continue;
    used.push(member.ref);
    if (member.role === "inner") inners.push(line);
    else outers.push(line);
  }
  return { outers, inners, used };
}

/** Absolute plan area (local m²) for a closed way or multipolygon relation. */
export function overpassPolygonAreaM2(element: OverpassElement, origin: LonLat): number | null {
  if (element.type === "way") {
    const line = pointsFromGeom(element.geometry, origin);
    if (!isClosed(line)) return null;
    return Math.round(Math.abs(signedArea(line)));
  }
  if (element.type === "relation") {
    const stitched = relationRings(element, origin);
    if (!stitched) return null;
    const rings = stitchRings(stitched.outers);
    if (rings.length === 0) return null;
    let sum = 0;
    for (const ring of rings) sum += Math.abs(signedArea(ring));
    return Math.round(sum);
  }
  return null;
}

export type CanopyKind = "wood" | "forest" | "scrub";

export type CanopyPatch = {
  ring: Pt[];
  holes: Pt[][];
  kind: CanopyKind;
};

export type TreeContext = {
  canopy: CanopyPatch[];
  buildings: { ring: Pt[]; holes: Pt[][] }[];
  water: { ring: Pt[]; holes: Pt[][] }[];
  roads: { line: Pt[]; width: number }[];
};

function canopyKind(tags: Record<string, string>): CanopyKind | null {
  if (tags.natural === "scrub") return "scrub";
  if (tags.natural === "wood") return "wood";
  if (tags.landuse === "forest") return "forest";
  return null;
}

/** Canopy polygons and the masks that keep infill off roads, buildings, and water. */
export function collectTreeContext(elements: OverpassElement[], origin: LonLat, half: number): TreeContext {
  const canopy: CanopyPatch[] = [];
  const water: TreeContext["water"] = [];
  const roads: TreeContext["roads"] = [];
  const consumed = new Set<number>();

  for (const element of elements) {
    if (element.type !== "relation") continue;
    const tags = element.tags ?? {};
    const kind = canopyKind(tags);
    const waterRel = areaKind(tags) === "water";
    if (!kind && !waterRel) continue;
    const stitched = relationRings(element, origin);
    if (!stitched) continue;
    const rings = stitchRings(stitched.outers);
    const holes = rings.length === 1 ? stitchRings(stitched.inners) : [];
    if (rings.length === 0) continue;
    for (const ref of stitched.used) consumed.add(ref);
    for (const ring of rings) {
      const clipped = clipRing(ring, half);
      if (clipped.length < 3) continue;
      const clippedHoles = holes.map((hole) => clipRing(hole, half)).filter((hole) => hole.length >= 3);
      if (kind) canopy.push({ ring: clipped, holes: clippedHoles, kind });
      else if (isOpenWaterArea(tags, Math.abs(signedArea(clipped)))) {
        water.push({ ring: clipped, holes: clippedHoles });
      }
    }
  }

  for (const element of elements) {
    if (element.type !== "way" || consumed.has(element.id)) continue;
    const tags = element.tags ?? {};
    if (hidden(tags)) continue;
    const line = pointsFromGeom(element.geometry, origin);
    if (line.length < 2) continue;
    const kind = canopyKind(tags);
    if (kind && isClosed(line)) {
      const clipped = clipRing(line, half);
      if (clipped.length >= 3) canopy.push({ ring: clipped, holes: [], kind });
      continue;
    }
    if (areaKind(tags) === "water" && isClosed(line)) {
      const clipped = clipRing(line, half);
      if (clipped.length >= 3 && isOpenWaterArea(tags, Math.abs(signedArea(clipped)))) {
        water.push({ ring: clipped, holes: [] });
      }
      continue;
    }
    const spec = roadWidth(tags);
    if (!spec) continue;
    for (const part of clipPolyline(line, -half, half)) {
      if (polylineLength(part) < 1) continue;
      roads.push({ line: part, width: spec.width });
    }
  }

  return { canopy, buildings: [], water, roads };
}

export function parseCity(
  data: OverpassResponse,
  origin: LonLat,
  sideM: number,
  layers: ModelLayers,
): Omit<CityModel, "placeLabel" | "sourceNote"> & { sourceNote: string } {
  const half = sideM / 2;
  const roads: RoadFeat[] = [];
  const areas: AreaFeat[] = [];
  const consumedWays = new Set<number>();
  const elements = data.elements ?? [];
  const trees = layers.trees ? collectTrees(elements, origin, half) : [];

  if (layers.waterGreen) {
    for (const element of elements) {
      if (element.type !== "relation") continue;
      const tags = element.tags ?? {};
      const kind = areaKind(tags);
      if (!kind) continue;
      const stitched = relationRings(element, origin);
      if (!stitched) continue;
      const rings = stitchRings(stitched.outers);
      const holes = rings.length === 1 ? stitchRings(stitched.inners) : [];
      if (rings.length === 0) continue;
      for (const ref of stitched.used) consumedWays.add(ref);
      for (const ring of rings) pushArea(areas, element.id, kind, ring, holes, half, tags);
    }
  }

  for (const element of elements) {
    if (element.type !== "way") continue;
    const tags = element.tags ?? {};
    const line = pointsFromGeom(element.geometry, origin);
    if (line.length < 2) continue;

    if (layers.waterGreen && !consumedWays.has(element.id)) {
      const kind = areaKind(tags);
      if (kind && isClosed(line)) {
        pushArea(areas, element.id, kind, line, [], half, tags);
        continue;
      }
    }

    if (layers.roads && !hidden(tags)) {
      const spec = roadWidth(tags);
      if (!spec) continue;
      const parts = clipPolyline(line, -half, half);
      for (const part of parts) {
        if (polylineLength(part) < 1) continue;
        roads.push({
          id: element.id,
          line: part,
          width: spec.width,
          kind: spec.kind,
          ...(spec.grade ? { grade: spec.grade } : {}),
        });
      }
    }
  }

  const roadsKept = dedupeRoads(roads);
  const areasKept = dedupeAreas(areas);

  const notes = [FLAT_GROUND_NOTE];
  if (layers.trees) notes.push(describeTrees(trees));
  return {
    center: origin,
    sideM,
    layers,
    buildings: [],
    roads: roadsKept.roads,
    areas: areasKept,
    trees,
    roadKm: roadsKept.metres / 1000,
    buildingCapHit: false,
    sourceNote: notes.join(" "),
  };
}
