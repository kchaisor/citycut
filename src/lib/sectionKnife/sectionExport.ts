import { getColour } from "../colours";
import { buildSectionElevation, sectionElevationRlTicks } from "./elevation";
import type { SectionKnifeEntry } from "./state";
import type { CityModel } from "../../types";
import type { SectionKnifePose } from "./plane";
import { sectionPlanMarkerGeometry } from "./marker";

export const SECTION_HORIZONTAL_PRINT_SCALE = 1000;

export const SECTION_EXPORT_LAYERS = [
  "Section::Ground",
  "Section::Cut buildings",
  "Section::Beyond",
  "Section::Grid",
  "Section::RL",
  "Section::Annotations",
  "Section::Plan marker",
] as const;

export type SectionExportOptions = {
  applyVerticalExaggeration: boolean;
  knife: SectionKnifeEntry;
};

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildSectionExportSvg(
  model: CityModel,
  pose: SectionKnifePose,
  options: SectionExportOptions,
): string {
  const elevation = buildSectionElevation(model, pose);
  const spanX = elevation.halfWidthM * 2;
  const spanY = Math.max(12, elevation.maxYM - elevation.minYM);
  const padX = 42;
  const padY = 36;
  const plotW = spanX;
  const plotH = options.applyVerticalExaggeration ? spanY : spanY;
  const viewW = plotW + padX + 18;
  const viewH = plotH + padY + 18;
  const x = (tangent: number) => padX + tangent + elevation.halfWidthM;
  const yScale = (ym: number) => padY + (elevation.maxYM - ym);
  const groundInk = getColour("--section-knife-elevation-ground");
  const beyond = getColour("--section-knife-elevation-beyond");
  const cut = getColour("--section-knife-poche");
  const grid = getColour("--section-knife-elevation-grid");
  const marker = getColour("--section-knife-marker-gold");
  const layers: string[] = [];
  const groundPaths: string[] = [];
  if (elevation.ground.length >= 2) {
    const line = elevation.ground.map((p) => `${x(p.tangent).toFixed(2)},${yScale(p.y).toFixed(2)}`).join(" ");
    const bottom = padY + plotH;
    const first = elevation.ground[0]!;
    const last = elevation.ground[elevation.ground.length - 1]!;
    const fillD = `M ${x(first.tangent).toFixed(2)} ${bottom} L ${line.replace(/,/g, " ")} L ${x(last.tangent).toFixed(2)} ${bottom} Z`;
    groundPaths.push(`<path d="${fillD}" fill="${groundInk}"/>`);
    groundPaths.push(`<polyline points="${line}" fill="none" stroke="${grid}" stroke-width="0.35"/>`);
  }
  layers.push(`<g id="Section_Ground" inkscape:label="Section::Ground">${groundPaths.join("")}</g>`);
  const cutPaths: string[] = [];
  const beyondPaths: string[] = [];
  for (const profile of elevation.profiles) {
    const x0 = x(profile.tangentMin);
    const x1 = x(profile.tangentMax);
  const y0 = yScale(profile.topY);
  const y1 = yScale(profile.baseY);
    const w = Math.max(0.2, x1 - x0);
    const h = Math.max(0.2, y1 - y0);
    const rect = `<rect x="${x0.toFixed(2)}" y="${y0.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${profile.cutByKnife ? cut : beyond}" opacity="${profile.cutByKnife ? 1 : 0.38}" stroke="none"/>`;
    if (profile.cutByKnife) cutPaths.push(rect);
    else beyondPaths.push(rect);
  }
  layers.push(`<g id="Section_Cut" inkscape:label="Section::Cut buildings">${cutPaths.join("")}</g>`);
  layers.push(`<g id="Section_Beyond" inkscape:label="Section::Beyond">${beyondPaths.join("")}</g>`);
  const rlTicks = sectionElevationRlTicks(elevation.minYM, elevation.maxYM, yScale);
  const gridLines = rlTicks
    .map(
      (ym) =>
        `<line x1="${padX}" y1="${yScale(ym).toFixed(2)}" x2="${(padX + plotW).toFixed(2)}" y2="${yScale(ym).toFixed(2)}" stroke="${grid}" stroke-opacity="0.2" stroke-width="0.15"/>`,
    )
    .join("");
  layers.push(`<g id="Section_Grid" inkscape:label="Section::Grid">${gridLines}</g>`);
  const rlFont = 5.5;
  const rlLabels = rlTicks
    .map(
      (ym) =>
        `<text x="${(padX - 4).toFixed(2)}" y="${yScale(ym).toFixed(2)}" text-anchor="end" font-size="${rlFont}" fill="${grid}">RL ${Math.round(ym)}</text>`,
    )
    .join("");
  layers.push(`<g id="Section_RL" inkscape:label="Section::RL">${rlLabels}</g>`);
  const vertNote = options.applyVerticalExaggeration
    ? "Vertical exaggeration applied (HUD match)."
  : "RL and profile distances in metres (true section).";
  const scaleNote = `Drawing scale 1:${SECTION_HORIZONTAL_PRINT_SCALE} horizontal (profile ${Math.round(spanX)} m wide).`;
  const letter = options.knife.label.match(/\b([A-Z])\s*$/)?.[1] ?? "A";
  const labelFont = 7;
  const noteFont = 5;
  const annotations = [
    `<text x="${padX}" y="${(padY + plotH + 10).toFixed(2)}" font-size="${labelFont}">${letter}</text>`,
    `<text x="${(padX + plotW).toFixed(2)}" y="${(padY + plotH + 10).toFixed(2)}" text-anchor="end" font-size="${labelFont}">${letter}′</text>`,
    `<text x="${padX}" y="${(padY - 8).toFixed(2)}" font-size="${noteFont}">${esc(scaleNote)}</text>`,
    `<text x="${padX}" y="${(padY - 14).toFixed(2)}" font-size="${noteFont - 0.8}">${esc(vertNote)}</text>`,
    `<text x="${(padX + plotW).toFixed(2)}" y="${(padY - 8).toFixed(2)}" text-anchor="end" font-size="${noteFont}">${Math.round(spanX)} m</text>`,
    `<line x1="${x(0).toFixed(2)}" y1="${padY}" x2="${x(0).toFixed(2)}" y2="${(padY + plotH).toFixed(2)}" stroke="${marker}" stroke-width="0.35"/>`,
  ].join("");
  layers.push(`<g id="Section_Annotations" inkscape:label="Section::Annotations">${annotations}</g>`);
  const markerGeom = sectionPlanMarkerGeometry(model, pose);
  const planMarker = `<line x1="${markerGeom.east0 + model.sideM / 2}" y1="${-(markerGeom.north0 + model.sideM / 2)}" x2="${markerGeom.east1 + model.sideM / 2}" y2="${-(markerGeom.north1 + model.sideM / 2)}" stroke="${marker}" stroke-width="0.25" stroke-dasharray="2 0.6"/>`;
  layers.push(`<g id="Section_Plan_marker" inkscape:label="Section::Plan marker">${planMarker}</g>`);
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${viewW}mm" height="${viewH}mm" viewBox="0 0 ${viewW} ${viewH}">${layers.join("")}</svg>`;
}

export function sectionExportLayerNames(svg: string): string[] {
  const labels = [...svg.matchAll(/inkscape:label="([^"]+)"/g)].map((m) => m[1]!);
  return labels;
}

export async function buildSectionExport3dm(
  model: CityModel,
  pose: SectionKnifePose,
  _options: SectionExportOptions,
): Promise<Uint8Array> {
  const { loadRhino } = await import("../rhinoExport");
  const rhino = await loadRhino();
  const api = rhino as unknown as {
    File3dm: new () => {
      layers(): { add(layer: unknown): number };
      objects(): { add(obj: unknown, attrs: unknown): void };
      toByteArray(): Uint8Array;
    };
    Layer: new () => { name: string };
    ObjectAttributes: new () => { layerIndex: number };
    PolylineCurve: new (points: number[][]) => unknown;
    Line: new (a: number[], b: number[]) => unknown;
    LineCurve: new (line: unknown) => unknown;
  };
  const doc = new api.File3dm();
  const addLayer = (name: string) => {
    const layer = new api.Layer();
    layer.name = name;
    return doc.layers().add(layer);
  };
  const elevation = buildSectionElevation(model, pose);
  const layerGround = addLayer("Section::Ground");
  const layerCut = addLayer("Section::Cut buildings");
  const layerBeyond = addLayer("Section::Beyond");
  const layerGrid = addLayer("Section::Grid");
  const x = (tangent: number) => tangent + elevation.halfWidthM;
  const attrs = (layer: number) => {
    const a = new api.ObjectAttributes();
    a.layerIndex = layer;
    return a;
  };
  if (elevation.ground.length >= 2) {
    const pts = elevation.ground.map((p) => [x(p.tangent), p.y, 0]);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const line = new api.LineCurve(new api.Line(a, b));
      doc.objects().add(line, attrs(layerGround));
    }
  }
  for (const profile of elevation.profiles) {
    const layer = profile.cutByKnife ? layerCut : layerBeyond;
    const ring = [
      [x(profile.tangentMin), profile.baseY, 0],
      [x(profile.tangentMax), profile.baseY, 0],
      [x(profile.tangentMax), profile.topY, 0],
      [x(profile.tangentMin), profile.topY, 0],
      [x(profile.tangentMin), profile.baseY, 0],
    ];
    const crv = new api.PolylineCurve(ring);
    doc.objects().add(crv, attrs(layer));
  }
  const rlTicks = sectionElevationRlTicks(elevation.minYM, elevation.maxYM, (ym) => ym);
  for (const ym of rlTicks) {
    const line = new api.LineCurve(new api.Line([0, ym, 0], [x(elevation.halfWidthM), ym, 0]));
    doc.objects().add(line, attrs(layerGrid));
  }
  const markerGeom = sectionPlanMarkerGeometry(model, pose);
  const planLine = new api.LineCurve(
    new api.Line([markerGeom.east0, markerGeom.north0, 0], [markerGeom.east1, markerGeom.north1, 0]),
  );
  doc.objects().add(planLine, attrs(addLayer("Section::Plan marker")));
  return new Uint8Array(doc.toByteArray());
}
