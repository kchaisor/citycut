import { fsrLabel, hobLabel, type NswLayers, type NswPolygon } from "./nswLayers";
import { nswZoneColourKey } from "./nswPlanStyle";
import type { ColourKey } from "./colours";
import type { CityModel, Pt } from "../types";

/**
 * Site-plan geometry for NSW mode, shared by the on-screen plan and the Illustrator export.
 * Hatches are real line segments (not SVG patterns) so both outputs draw the same marks.
 */

export type NswPlanLabel = { at: Pt; text: string; kind: "zone" | "hob" | "fsr" };

export type NswPlanItems = {
  zoning: { rings: Pt[][]; colour: ColourKey }[];
  corridors: Pt[][][];
  lots: Pt[][][];
  easements: Pt[][][];
  easementHatch: [Pt, Pt][];
  heritage: Pt[][][];
  heritageHatch: [Pt, Pt][];
  centrelines: Pt[][];
  labels: NswPlanLabel[];
};

const rings = (poly: NswPolygon): Pt[][] => [poly.outer, ...poly.holes];

/**
 * Parallel hatch segments inside a polygon (even-odd over outer and holes), spacing in metres,
 * angle in degrees from east. Scanline in a rotated frame.
 */
export function hatchSegments(poly: NswPolygon, spacingM: number, angleDeg = 45): [Pt, Pt][] {
  if (!(spacingM > 0)) return [];
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Rotate so hatch lines are horizontal: v = -x sin + y cos.
  const rot = ([x, y]: Pt): Pt => [x * cos + y * sin, -x * sin + y * cos];
  const back = ([u, v]: Pt): Pt => [u * cos - v * sin, u * sin + v * cos];
  const all = rings(poly).map((ring) => ring.map(rot));
  let minV = Infinity;
  let maxV = -Infinity;
  for (const ring of all) for (const [, v] of ring) {
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  const out: [Pt, Pt][] = [];
  const start = Math.ceil(minV / spacingM) * spacingM;
  for (let v = start; v <= maxV; v += spacingM) {
    const xs: number[] = [];
    for (const ring of all) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [u1, v1] = ring[j]!;
        const [u2, v2] = ring[i]!;
        if (v1 > v !== v2 > v) xs.push(u1 + ((v - v1) * (u2 - u1)) / (v2 - v1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1]! - xs[k]! < 0.2) continue;
      out.push([back([xs[k]!, v]), back([xs[k + 1]!, v])]);
    }
  }
  return out;
}

export function nswPlanItems(model: Pick<CityModel, "nsw">, hatchM = 4): NswPlanItems | null {
  const nsw: NswLayers | null | undefined = model.nsw;
  if (!nsw) return null;
  const labels: NswPlanLabel[] = [];
  for (const zone of nsw.zoning) if (zone.label && zone.code) labels.push({ at: zone.label, text: zone.code, kind: "zone" });
  for (const area of nsw.hob) if (area.label) labels.push({ at: area.label, text: hobLabel(area.hob), kind: "hob" });
  for (const area of nsw.fsr) if (area.label) labels.push({ at: area.label, text: fsrLabel(area.fsr, area.layClass), kind: "fsr" });
  return {
    zoning: nsw.zoning.map((zone) => ({ rings: rings(zone), colour: nswZoneColourKey(zone.code) })),
    corridors: nsw.roadCorridors.map(rings),
    lots: nsw.lots.map(rings),
    easements: nsw.easements.map(rings),
    easementHatch: nsw.easements.flatMap((poly) => hatchSegments(poly, hatchM / 2, -45)),
    heritage: nsw.heritage.map(rings),
    heritageHatch: nsw.heritage.flatMap((poly) => hatchSegments(poly, hatchM, 45)),
    centrelines: nsw.roadCentrelines.map((item) => item.line),
    labels,
  };
}

/** Vertical stacking of the three label kinds (in label-line units) so coincident anchors stay legible. */
export const NSW_LABEL_LINE: Record<NswPlanLabel["kind"], number> = { zone: -1.1, hob: 0, fsr: 1.1 };
