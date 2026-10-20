import { signedArea } from "./geo";
import { fsrLabel, hobLabel, type NswLayers, type NswPolygon, type NswRecordInfo } from "./nswLayers";
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
  /** Decoded cadastre records for hover text: lots, then easements, then road corridors. */
  records: { rings: Pt[][]; text: string }[];
};

/** Hover text for a decoded record: title line, then "Label: value" lines. */
export function recordText(info: NswRecordInfo): string {
  return [info.title, ...info.rows.map(([label, value]) => `${label}: ${value}`)].join("\n");
}

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

/** Label thinning knobs, in label heights (sizeM). */
export const NSW_LABEL_RULES = {
  /** A polygon needs at least (minSide × sizeM)² of area to carry a label. */
  minSide: 8,
  /** The same text of the same kind is shown once within this radius. */
  repeatRadius: 22,
  /** Gap kept between label boxes. */
  pad: 0.15,
  /** Average glyph width (Helvetica, mixed case and digits) as a share of the size. */
  glyph: 0.58,
} as const;

const KIND_RANK: Record<NswPlanLabel["kind"], number> = { zone: 0, hob: 1, fsr: 2 };

type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * Collision-aware placement for zone / HOB / FSR labels at one label size (metres):
 *  - polygons smaller than (minSide · size)² get no label;
 *  - identical text of the same kind repeats at most once per repeatRadius;
 *  - by priority (zone, then HOB, then FSR; larger polygons first) a label is placed at its anchor,
 *    or one line above / below it, only where its box clears every placed box and the frame edge.
 * Returns the placed labels (final positions) and how many were dropped.
 */
export function placeNswLabels(nsw: NswLayers, sizeM: number, sideM: number): { labels: NswPlanLabel[]; dropped: number } {
  const rules = NSW_LABEL_RULES;
  const minArea = (rules.minSide * sizeM) ** 2;
  type Cand = NswPlanLabel & { area: number };
  const cands: Cand[] = [];
  const push = (poly: NswPolygon, at: Pt | null, text: string, kind: NswPlanLabel["kind"]) => {
    if (!at || !text) return;
    const area = Math.abs(signedArea(poly.outer));
    if (area >= minArea) cands.push({ at, text, kind, area });
  };
  for (const zone of nsw.zoning) push(zone, zone.label, zone.code, "zone");
  for (const area of nsw.hob) push(area, area.label, hobLabel(area.hob), "hob");
  for (const area of nsw.fsr) push(area, area.label, fsrLabel(area.fsr, area.layClass), "fsr");
  const total = nsw.zoning.filter((z) => z.label && z.code).length + nsw.hob.filter((a) => a.label).length + nsw.fsr.filter((a) => a.label).length;
  cands.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.area - a.area);
  const half = sideM / 2;
  const placed: { label: NswPlanLabel; box: Box }[] = [];
  const pad = rules.pad * sizeM;
  const boxAt = (at: Pt, text: string): Box => {
    const w = text.length * rules.glyph * sizeM;
    return { x0: at[0] - w / 2 - pad, x1: at[0] + w / 2 + pad, y0: at[1] - sizeM * 0.6 - pad, y1: at[1] + sizeM * 0.6 + pad };
  };
  const clear = (box: Box) =>
    box.x0 >= -half && box.x1 <= half && box.y0 >= -half && box.y1 <= half &&
    placed.every(({ box: o }) => box.x1 <= o.x0 || box.x0 >= o.x1 || box.y1 <= o.y0 || box.y0 >= o.y1);
  const repeatR2 = (rules.repeatRadius * sizeM) ** 2;
  for (const cand of cands) {
    const repeat = placed.some(
      ({ label }) => label.kind === cand.kind && label.text === cand.text && (label.at[0] - cand.at[0]) ** 2 + (label.at[1] - cand.at[1]) ** 2 < repeatR2,
    );
    if (repeat) continue;
    const step = sizeM * (1.2 + 2 * rules.pad);
    for (const dy of [0, -step, step]) {
      const at: Pt = [cand.at[0], cand.at[1] + dy];
      const box = boxAt(at, cand.text);
      if (!clear(box)) continue;
      placed.push({ label: { at, text: cand.text, kind: cand.kind }, box });
      break;
    }
  }
  return { labels: placed.map((item) => item.label), dropped: total - placed.length };
}

export function nswPlanItems(model: Pick<CityModel, "nsw" | "sideM">, hatchM = 4, labelSizeM = model.sideM * NSW_PLAN_LABEL_SHARE): NswPlanItems | null {
  const nsw: NswLayers | null | undefined = model.nsw;
  if (!nsw) return null;
  const { labels } = placeNswLabels(nsw, labelSizeM, model.sideM);
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
    records: [...nsw.lots, ...nsw.easements, ...nsw.roadCorridors].map((item) => ({ rings: rings(item), text: recordText(item.info) })),
  };
}

/** On-screen planning label size as a share of the cut side (1 km → 11.5 m). */
export const NSW_PLAN_LABEL_SHARE = 0.0115;
