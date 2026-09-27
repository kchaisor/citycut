import { BUILDING_USE_META } from "./buildingUse";
import { openRing } from "./geo";
import { roadStroke } from "./surfaceLayers";
import { contourInterval, contourLines } from "./terrain";
import type { CityModel, Pt } from "../types";

const round = (value: number) => Math.round(value * 10) / 10;

function move(points: Pt[]): string {
  const opened = openRing(points);
  if (opened.length < 2) return "";
  return opened
    .map((point, index) => `${index === 0 ? "M" : "L"}${round(point[0])} ${round(-point[1])}`)
    .join(" ");
}

function linePath(points: Pt[]): string {
  if (points.length < 2) return "";
  const closed = Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 1;
  const drawn = closed ? points.slice(0, -1) : points;
  if (drawn.length < 2) return "";
  const body = drawn
    .map((point, index) => `${index === 0 ? "M" : "L"}${round(point[0])} ${round(-point[1])}`)
    .join(" ");
  return closed ? `${body} Z` : body;
}

function polygonPath(ring: Pt[], holes: Pt[][]): string {
  const outer = move(ring);
  if (!outer) return "";
  const inner = holes.map((hole) => move(hole)).filter(Boolean).map((path) => `${path} Z`).join(" ");
  return `${outer} Z${inner ? ` ${inner}` : ""}`;
}

export type PlanPaths = {
  green: string[];
  water: string[];
  roads: { d: string; width: number; stroke: string }[];
  rails: { d: string; width: number }[];
  buildings: { d: string; fill: string }[];
  trees: { x: number; y: number; r: number }[];
  contours: string[];
  contourInterval: number | null;
};

export function planPaths(model: CityModel): PlanPaths {
  const green: string[] = [];
  const water: string[] = [];
  for (const area of model.areas) {
    const path = polygonPath(area.ring, area.holes);
    if (!path) continue;
    if (area.kind === "water") water.push(path);
    else green.push(path);
  }
  const roads: PlanPaths["roads"] = [];
  const rails: PlanPaths["rails"] = [];
  for (const road of model.roads) {
    const d = move(road.line);
    if (!d) continue;
    const width = Math.max(road.width, road.kind === "rail" ? 2.4 : 2.2);
    if (road.kind === "rail") rails.push({ d, width });
    else roads.push({ d, width, stroke: roadStroke(road.grade) });
  }
  const buildings = model.buildings
    .map((building) => ({
      d: polygonPath(building.ring, building.holes),
      fill: BUILDING_USE_META[building.use].color,
    }))
    .filter((building) => building.d);
  const trees = model.trees.map((tree) => ({
    x: tree.at[0],
    y: -tree.at[1],
    r: tree.crown_diameter_m / 2,
  }));
  const interval = model.terrain && model.contours ? contourInterval(model.terrain.max - model.terrain.min) : null;
  const contours =
    model.terrain && interval
      ? contourLines(model.terrain, model.sideM, interval).map((line) => linePath(line)).filter(Boolean)
      : [];
  return { green, water, roads, rails, buildings, trees, contours, contourInterval: contours.length > 0 ? interval : null };
}

export function sitePlanSvg(model: CityModel): string {
  const half = model.sideM / 2;
  const pad = model.sideM * 0.04;
  const view = `${round(-half - pad)} ${round(-half - pad)} ${round(model.sideM + pad * 2)} ${round(model.sideM + pad * 2)}`;
  const paths = planPaths(model);
  const green = paths.green.map((d) => `<path d="${d}" fill="#b7d39a"/>`).join("");
  const water = paths.water.map((d) => `<path d="${d}" fill="#9ec9d1"/>`).join("");
  const contourWidth = round(Math.max(model.sideM * 0.0012, 0.35));
  const contours = paths.contours
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#7a6248" stroke-width="${contourWidth}" stroke-linejoin="round" stroke-linecap="round"/>`,
    )
    .join("");
  const roads = paths.roads
    .map(
      (road) =>
        `<path d="${road.d}" fill="none" stroke="${road.stroke}" stroke-width="${round(road.width)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  const rails = paths.rails
    .map(
      (rail) =>
        `<path d="${rail.d}" fill="none" stroke="#8d6244" stroke-width="${round(rail.width)}" stroke-dasharray="${round(rail.width * 1.6)} ${round(rail.width)}" stroke-linecap="butt"/>`,
    )
    .join("");
  const buildings = paths.buildings
    .map((building) => `<path d="${building.d}" fill="${building.fill}" fill-rule="evenodd"/>`)
    .join("");
  const treeStroke = round(Math.max(model.sideM * 0.0015, 0.4));
  const trees = paths.trees
    .map(
      (tree) =>
        `<circle cx="${round(tree.x)}" cy="${round(tree.y)}" r="${round(tree.r)}" fill="#6ea35a" stroke="#245232" stroke-width="${treeStroke}"/>`,
    )
    .join("");
  const title = `CityCut ${model.placeLabel} ${model.center.lat.toFixed(5)}, ${model.center.lon.toFixed(5)}`;
  const contourNote =
    paths.contourInterval && model.terrain
      ? ` Contours every ${paths.contourInterval} m, elevations ${model.terrain.min.toFixed(1)}–${model.terrain.max.toFixed(1)} m. Terrain © Mapterhorn.`
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="1400" height="1400">
  <title>${escapeXml(title)}</title>
  <desc>${escapeXml(model.sourceNote)} © OpenStreetMap contributors.${escapeXml(contourNote)}</desc>
  <rect x="${round(-half - pad)}" y="${round(-half - pad)}" width="${round(model.sideM + pad * 2)}" height="${round(model.sideM + pad * 2)}" fill="#e7e2d8"/>
  <rect x="${round(-half)}" y="${round(-half)}" width="${round(model.sideM)}" height="${round(model.sideM)}" fill="#f6f3ec"/>
  ${green}
  ${water}
  ${contours}
  ${roads}
  ${rails}
  ${buildings}
  ${trees}
  <rect x="${round(-half)}" y="${round(-half)}" width="${round(model.sideM)}" height="${round(model.sideM)}" fill="none" stroke="#1c1b17" stroke-width="${round(model.sideM * 0.004)}"/>
  <text x="0" y="${round(-half + model.sideM * 0.035)}" text-anchor="middle" font-family="Georgia, serif" font-size="${round(model.sideM * 0.028)}" fill="#1c1b17">N</text>
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
