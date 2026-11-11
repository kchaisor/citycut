import { signedArea } from "./geo";
import { fsrLabel, hobLabel, type NswLayers, type NswPolygon, type NswRecordInfo } from "./nswLayers";
import { nswZoneColourKey } from "./nswPlanStyle";
import type { ColourKey } from "./colours";
import type { CityModel, Pt } from "../types";

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
  records: { rings: Pt[][]; text: string }[];
};

export function recordText(info: NswRecordInfo): string {
  return [info.title, ...info.rows.map(([label, value]) => `${label}: ${value}`)].join("\n");
}

const rings = (poly: NswPolygon): Pt[][] => [poly.outer, ...poly.holes];

export function hatchSegments(poly: NswPolygon, spacingM: number, angleDeg = 45): [Pt, Pt][] {
  if (!(spacingM > 0)) return [];
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
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

export const NSW_LABEL_RULES = {
  minSide: 8,
  repeatRadius: 22,
  pad: 0.15,
  glyph: 0.58,
} as const;

const KIND_RANK: Record<NswPlanLabel["kind"], number> = { zone: 0, hob: 1, fsr: 2 };

type Box = { x0: number; y0: number; x1: number; y1: number };

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

export const NSW_PLAN_LABEL_SHARE = 0.0115;
