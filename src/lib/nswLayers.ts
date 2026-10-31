import { squareBBox, signedArea } from "./geo";
import { queryArcgisTiled, type ArcgisFetch, type ArcgisResult, type GeoJsonFeature } from "./arcgisQuery";
import { clipAreaToSiteFrame, clipPolylineSiteFrame, DEFAULT_SITE_FRAME_SHAPE, pointInSiteFrame } from "./siteFrame";
import { linesFromGeometry, pointFromGeometry, polygonsFromGeometry } from "./vicmapWfs";
import { decodeField, decodeSubtype, UnknownCodes } from "./nswDomains";
import { NSW_LAYERS, nswRoadGrade, type NswLayerKey } from "./sources/nsw";
import type { BuildingUse, LonLat, Pt, RoadGrade, SiteFrameShape } from "../types";

export type NswPolygon = { outer: Pt[]; holes: Pt[][] };

export type NswHob =
  | { kind: "height"; metres: number }
  | { kind: "rl"; rl: number }
  | { kind: "unknown"; raw: string };

export type NswZone = NswPolygon & { code: string; epi: string; label: Pt | null };
export type NswHobArea = NswPolygon & { hob: NswHob; epi: string; label: Pt | null };
export type NswFsrArea = NswPolygon & { fsr: number | null; layClass: string; epi: string; label: Pt | null };
export type NswHeritageArea = NswPolygon & { name: string; significance: string };
export type NswCentreline = { line: Pt[]; grade: RoadGrade; name: string };

export type NswRecordInfo = { title: string; rows: [string, string][] };
export type NswLot = NswPolygon & { info: NswRecordInfo };
export type NswEasement = NswPolygon & { info: NswRecordInfo };
export type NswCorridor = NswPolygon & { info: NswRecordInfo; name: string; pathway: boolean };
export type NswRailKind = "heavy" | "light" | "monorail" | "siding" | "other";
export type NswRail = { line: Pt[]; kind: NswRailKind; operational: boolean; tunnel: boolean; name: string };
export type NswStation = { at: Pt; name: string; operational: boolean; lightRail: boolean };
export type NswBuildingComplex = { at: Pt; facility: string; type: string; name: string; use: BuildingUse };

export type NswLayerStatus = Pick<ArcgisResult, "status" | "note" | "ms" | "pages"> & { id: string; label: string; count: number; retries: number };

export type NswLayers = {
  lots: NswLot[];
  easements: NswEasement[];
  roadCorridors: NswCorridor[];
  roadCentrelines: NswCentreline[];
  railways: NswRail[];
  stations: NswStation[];
  buildingComplexes: NswBuildingComplex[];
  codeNotes: string[];
  water: NswPolygon[];
  zoning: NswZone[];
  hob: NswHobArea[];
  fsr: NswFsrArea[];
  heritage: NswHeritageArea[];
  status: Record<Exclude<NswLayerKey, "contours2m" | "contoursCos">, NswLayerStatus>;
  ms: number;
};

export function parseHob(value: unknown, units: unknown): NswHob {
  const n = typeof value === "number" ? value : value == null || value === "" ? NaN : Number(value);
  const u = typeof units === "string" ? units.trim().toLowerCase() : "";
  if (!Number.isFinite(n)) return { kind: "unknown", raw: `${value ?? ""} ${units ?? ""}`.trim() };
  if (u.includes("rl")) return { kind: "rl", rl: n };
  if (u === "m" || u === "metres" || u === "") return { kind: "height", metres: n };
  return { kind: "unknown", raw: `${n} ${units}` };
}

export function hobLabel(hob: NswHob): string {
  if (hob.kind === "height") return `HOB ${formatNumber(hob.metres)} m`;
  if (hob.kind === "rl") return `HOB RL ${formatNumber(hob.rl)} m AHD`;
  return `HOB ${hob.raw}`;
}

export function fsrLabel(fsr: number | null, layClass: string): string {
  return fsr == null ? `FSR ${layClass || "n/a"}` : `FSR ${formatNumber(fsr)}:1`;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function titleCase(value: string): string {
  if (value !== value.toUpperCase()) return value;
  return value.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function clipPolygons(features: GeoJsonFeature[], origin: LonLat, sideM: number, shape: SiteFrameShape) {
  const out: { poly: NswPolygon; props: Record<string, unknown> }[] = [];
  for (const feature of features) {
    for (const poly of polygonsFromGeometry(feature.geometry, origin)) {
      const rings = clipAreaToSiteFrame(poly.outer, poly.holes, sideM, shape);
      if (!rings || Math.abs(signedArea(rings[0]!)) < 0.5) continue;
      out.push({ poly: { outer: rings[0]!, holes: rings.slice(1) }, props: feature.properties });
    }
  }
  return out;
}

function pointInRing(ring: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(poly: NswPolygon, x: number, y: number): boolean {
  return pointInRing(poly.outer, x, y) && !poly.holes.some((hole) => pointInRing(hole, x, y));
}

export function labelAnchor(poly: NswPolygon, minAreaM2 = 600): Pt | null {
  const area = Math.abs(signedArea(poly.outer));
  if (area < minAreaM2) return null;
  let a = 0;
  let cx = 0;
  let cy = 0;
  const r = poly.outer;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j]![0] * r[i]![1] - r[i]![0] * r[j]![1];
    a += f;
    cx += (r[j]![0] + r[i]![0]) * f;
    cy += (r[j]![1] + r[i]![1]) * f;
  }
  if (a !== 0) {
    const c: Pt = [cx / (3 * a), cy / (3 * a)];
    if (pointInPolygon(poly, c[0], c[1]) && edgeDistance(poly, c) > 6) return c;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of r) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  let best: Pt | null = null;
  let bestD = 0;
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = minX + ((maxX - minX) * i) / steps;
      const y = minY + ((maxY - minY) * j) / steps;
      if (!pointInPolygon(poly, x, y)) continue;
      const d = edgeDistance(poly, [x, y]);
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  }
  return best;
}

function edgeDistance(poly: NswPolygon, p: Pt): number {
  let best = Infinity;
  for (const ring of [poly.outer, ...poly.holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j]!;
      const [bx, by] = ring[i]!;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy));
    }
  }
  return best;
}

type LayerKey = keyof NswLayers["status"];
const LAYER_KEYS: LayerKey[] = [
  "lots",
  "easements",
  "roadCorridors",
  "roadCentrelines",
  "railways",
  "stations",
  "buildingComplexes",
  "water",
  "zoning",
  "hob",
  "fsr",
  "heritage",
];

const RAIL_KINDS: Record<string, NswRailKind> = { "1": "heavy", "2": "light", "3": "monorail", "4": "siding" };

export function nswComplexUse(subtype: unknown, type: unknown): BuildingUse {
  const s = Number(subtype);
  const t = Number(type);
  if (s === 2 && [4, 21, 22, 24].includes(t)) return "residential";
  if (s === 4 && t === 10) return "retail";
  if (s === 4 && t === 7) return "residential";
  if (s === 1 || s === 2 || s === 3) return "civic";
  if (s === 4 || s === 5) return "industrial";
  if (s === 6) return "recreation";
  return "unclassified";
}

function lotInfo(props: Record<string, unknown>, unknown: UnknownCodes): NswRecordInfo {
  const kind = decodeSubtype("lots", props.classsubtype);
  const title = decodeField("lots", "itstitlestatus", props.itstitlestatus);
  const hasStratum = decodeField("lots", "hasstratum", props.hasstratum);
  const level = decodeField("lots", "stratumlevel", props.stratumlevel);
  unknown.add("classsubtype", kind);
  unknown.add("itstitlestatus", title);
  unknown.add("hasstratum", hasStratum);
  unknown.add("stratumlevel", level);
  const id = text(props.lotidstring) || [text(props.lotnumber), text(props.planlabel)].filter(Boolean).join(" ");
  const rows: [string, string][] = [];
  if (kind) rows.push(["Kind", kind.text]);
  if (title) rows.push(["Title", title.text]);
  if (hasStratum && hasStratum.text !== "Undefined") rows.push(["Stratum", hasStratum.text === "True" ? `Yes${level ? `, ${level.text}` : ""}` : hasStratum.text === "False" ? "No" : hasStratum.text]);
  else if (level && !/^ground level$/i.test(level.text)) rows.push(["Stratum level", level.text]);
  if (text(props.planlabel)) rows.push(["Plan", text(props.planlabel)]);
  return { title: id ? `Lot ${id}` : "Lot", rows };
}

function easementInfo(props: Record<string, unknown>, unknown: UnknownCodes): NswRecordInfo {
  const kind = decodeSubtype("easements", props.classsubtype);
  const type = decodeField("easements", "easementtype", props.easementtype, props.classsubtype);
  const level = decodeField("easements", "stratumlevel", props.stratumlevel);
  unknown.add("classsubtype", kind);
  unknown.add("easementtype", type);
  unknown.add("stratumlevel", level);
  const rows: [string, string][] = [];
  if (kind) rows.push(["Class", kind.text]);
  if (text(props.easementwidth)) rows.push(["Width", text(props.easementwidth)]);
  if (level && !/^ground level$/i.test(level.text)) rows.push(["Stratum level", level.text]);
  return { title: type && type.text !== "Undefined" ? type.text : "Easement", rows };
}

function corridorInfo(props: Record<string, unknown>, unknown: UnknownCodes): NswRecordInfo {
  const kind = decodeSubtype("roadCorridors", props.classsubtype);
  const type = decodeField("roadCorridors", "roadcorridortype", props.roadcorridortype, props.classsubtype);
  const road = decodeField("roadCorridors", "roadtype", props.roadtype);
  unknown.add("classsubtype", kind);
  unknown.add("roadcorridortype", type);
  unknown.add("roadtype", road);
  const rows: [string, string][] = [];
  if (kind) rows.push(["Class", kind.text]);
  if (type && type.text !== "Undefined") rows.push(["Corridor", type.text]);
  if (road && road.text !== "Undefined") rows.push(["Type", road.text]);
  return { title: text(props.roadnamelabel) || "Road corridor", rows };
}

export function nswLayersFromResults(
  results: Record<LayerKey, ArcgisResult>,
  origin: LonLat,
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  ms = 0,
): NswLayers {
  const status = {} as NswLayers["status"];
  for (const key of LAYER_KEYS) {
    const r = results[key];
    status[key] = { id: r.id, label: NSW_LAYERS[key].label, status: r.status, note: r.note, ms: r.ms, pages: r.pages, count: r.features.length, retries: r.retries ?? 0 };
  }
  const polys = (key: LayerKey) => clipPolygons(results[key].features, origin, sideM, shape);
  const points = (key: LayerKey) =>
    results[key].features
      .map((feature) => ({ at: pointFromGeometry(feature.geometry, origin), props: feature.properties }))
      .filter((item): item is { at: Pt; props: Record<string, unknown> } => item.at != null && pointInSiteFrame(item.at, sideM, shape));
  const unknownLots = new UnknownCodes("NSW lots");
  const unknownEasements = new UnknownCodes("NSW easements");
  const unknownCorridors = new UnknownCodes("NSW road corridors");
  const unknownRail = new UnknownCodes("NSW railways");
  const unknownComplex = new UnknownCodes("NSW building complexes");
  const railways: NswRail[] = [];
  for (const feature of results.railways.features) {
    const props = feature.properties;
    const kind = decodeSubtype("railways", props.classsubtype);
    unknownRail.add("classsubtype", kind);
    const status = decodeField("railways", "operationalstatus", props.operationalstatus);
    unknownRail.add("operationalstatus", status);
    const on = decodeField("railways", "railontype", props.railontype);
    unknownRail.add("railontype", on);
    for (const line of linesFromGeometry(feature.geometry, origin)) {
      for (const part of clipPolylineSiteFrame(line, sideM, shape)) {
        if (part.length < 2) continue;
        railways.push({
          line: part,
          kind: RAIL_KINDS[text(props.classsubtype)] ?? "other",
          operational: text(props.operationalstatus) === "1",
          tunnel: text(props.railontype) === "3",
          name: text(props.railwayname),
        });
      }
    }
  }
  const centrelines: NswCentreline[] = [];
  for (const feature of results.roadCentrelines.features) {
    const grade = nswRoadGrade(feature.properties.functionhierarchy);
    const name = [text(feature.properties.roadnamebase), text(feature.properties.roadnametype)].filter(Boolean).join(" ");
    for (const line of linesFromGeometry(feature.geometry, origin)) {
      for (const part of clipPolylineSiteFrame(line, sideM, shape)) {
        if (part.length >= 2) centrelines.push({ line: part, grade, name });
      }
    }
  }
  const lots = polys("lots").map(({ poly, props }) => ({ ...poly, info: lotInfo(props, unknownLots) }));
  const easements = polys("easements").map(({ poly, props }) => ({ ...poly, info: easementInfo(props, unknownEasements) }));
  const roadCorridors = polys("roadCorridors").map(({ poly, props }) => ({
    ...poly,
    info: corridorInfo(props, unknownCorridors),
    name: text(props.roadnamelabel),
    pathway: text(props.classsubtype) === "1" && text(props.roadcorridortype) === "2",
  }));
  const stations = points("stations").map(({ at, props }) => {
    const name = text(props.generalname);
    return { at, name, operational: text(props.operationalstatus) === "1", lightRail: /\b(SLR|LIGHT RAIL)\b/i.test(name) };
  });
  const buildingComplexes = points("buildingComplexes")
    .filter(({ props }) => text(props.operationalstatus) === "" || text(props.operationalstatus) === "1")
    .map(({ at, props }) => {
      const facility = decodeSubtype("buildingComplexes", props.classsubtype);
      const type = decodeField("buildingComplexes", "buildingcomplextype", props.buildingcomplextype, props.classsubtype);
      unknownComplex.add("classsubtype", facility);
      unknownComplex.add("buildingcomplextype", type);
      return {
        at,
        facility: facility?.text ?? "Facility",
        type: type && type.text !== "Undefined" ? type.text : "",
        name: titleCase(text(props.generalname)),
        use: nswComplexUse(props.classsubtype, props.buildingcomplextype),
      };
    });
  const codeNotes = [unknownLots, unknownEasements, unknownCorridors, unknownRail, unknownComplex]
    .map((codes) => codes.note())
    .filter((note): note is string => Boolean(note));
  return {
    lots,
    easements,
    roadCorridors,
    roadCentrelines: centrelines,
    railways,
    stations,
    buildingComplexes,
    codeNotes,
    water: polys("water").map((item) => item.poly).filter((poly) => Math.abs(signedArea(poly.outer)) >= 200),
    zoning: polys("zoning").map(({ poly, props }) => ({
      ...poly,
      code: text(props.SYM_CODE) || text(props.LAY_CLASS),
      epi: text(props.EPI_NAME),
      label: labelAnchor(poly, 1500),
    })),
    hob: polys("hob").map(({ poly, props }) => ({
      ...poly,
      hob: parseHob(props.MAX_B_H, props.UNITS),
      epi: text(props.EPI_NAME),
      label: labelAnchor(poly),
    })),
    fsr: polys("fsr").map(({ poly, props }) => {
      const raw = props.FSR;
      const fsr = raw == null || raw === "" || !Number.isFinite(Number(raw)) ? null : Number(raw);
      return { ...poly, fsr, layClass: text(props.LAY_CLASS), epi: text(props.EPI_NAME), label: labelAnchor(poly) };
    }),
    heritage: polys("heritage").map(({ poly, props }) => ({ ...poly, name: text(props.H_NAME), significance: text(props.SIG) })),
    status,
    ms,
  };
}

/**
 * All NSW cut layers in parallel; each layer (each tile, for tiled layers) has its own 20 s limit,
 * transient retries where the spec allows them, and its own status.
 */
export async function fetchNswLayers(
  center: LonLat,
  sideM: number,
  options: { signal?: AbortSignal; frameShape?: SiteFrameShape; fetchImpl?: ArcgisFetch; timeoutMs?: number } = {},
): Promise<NswLayers> {
  const started = Date.now();
  const bounds = squareBBox(center, sideM);
  const entries = await Promise.all(
    LAYER_KEYS.map(async (key) => [key, await queryArcgisTiled(NSW_LAYERS[key], bounds, options)] as const),
  );
  const results = Object.fromEntries(entries) as Record<LayerKey, ArcgisResult>;
  return nswLayersFromResults(results, center, sideM, options.frameShape ?? DEFAULT_SITE_FRAME_SHAPE, Date.now() - started);
}
