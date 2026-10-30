import type { BuildingFeat, BuildingHeightTier, BuildingUse, CityModel, Ring } from "../types";
import { inferHeightTier, heightTierLabel } from "./buildingHeightResolve";
import { sampleTerrain } from "./terrain";
import { sectionNormalEN, type SectionCutState } from "./sectionCut";

export const SECTION_BEYOND_DEPTH_M = 60;
export const STOREY_HEIGHT_M = 3.2;

export type CutBuilding = {
  id: number;
  name: string | null;
  sFrom: number;
  sTo: number;
  spans: [number, number][];
  base: number;
  top: number;
  height: number;
  storeys: number;
  storeysEstimated: boolean;
  use: BuildingUse;
  tier: BuildingHeightTier;
  sourceLabel: string;
  estimated: boolean;
  distanceM: number;
};

export type BeyondBuilding = { id: number; sFrom: number; sTo: number; base: number; top: number; depth: number };

export type SectionTree = { id: number; s: number; base: number; height: number; crown: number; depth: number };

export type SectionProfile = {
  sStart: number;
  sEnd: number;
  lengthM: number;
  ground: [number, number][];
  groundMeasured: boolean;
  datumLabel: string;
  cut: CutBuilding[];
  beyond: BeyondBuilding[];
  trees: SectionTree[];
  zMin: number;
  zMax: number;
};

type Cut = Pick<SectionCutState, "angleDeg" | "offsetM" | "flipped">;

function axes(cut: Cut) {
  const [ne, nn] = sectionNormalEN(cut.angleDeg);
  const a = (cut.angleDeg * Math.PI) / 180;
  return { ne, nn, de: Math.cos(a), dn: Math.sin(a), sign: cut.flipped ? 1 : -1 };
}

export function squareSpan(cut: Cut, sideM: number): [number, number] | null {
  const { ne, nn, de, dn } = axes(cut);
  const half = sideM / 2;
  const ce = ne * cut.offsetM;
  const cn = nn * cut.offsetM;
  let lo = -Infinity;
  let hi = Infinity;
  for (const [c, d] of [
    [ce, de],
    [cn, dn],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(c) > half) return null;
      continue;
    }
    const t1 = (-half - c) / d;
    const t2 = (half - c) / d;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  }
  return hi > lo ? [lo, hi] : null;
}

export function ringCrossings(ring: Ring, cut: Cut): number[] {
  const { ne, nn, de, dn } = axes(cut);
  const hits: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const dp = ne * p[0] + nn * p[1] - cut.offsetM;
    const dq = ne * q[0] + nn * q[1] - cut.offsetM;
    if ((dp > 0) === (dq > 0)) continue;
    const t = dp / (dp - dq);
    const e = p[0] + (q[0] - p[0]) * t;
    const n = p[1] + (q[1] - p[1]) * t;
    hits.push(de * e + dn * n);
  }
  return hits.sort((x, y) => x - y);
}

function pairs(hits: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  return out;
}

export function storeysFor(building: Pick<BuildingFeat, "numFloors" | "developmentFloors" | "height">): { storeys: number; estimated: boolean } {
  const known = building.numFloors ?? building.developmentFloors;
  if (known && known > 0) return { storeys: Math.round(known), estimated: false };
  return { storeys: Math.max(1, Math.round(building.height / STOREY_HEIGHT_M)), estimated: true };
}

const ESTIMATE_TIERS = new Set<BuildingHeightTier>(["zone_default", "real_source_unmatched"]);

export function buildSectionProfile(model: CityModel, cut: Cut, depthM = SECTION_BEYOND_DEPTH_M): SectionProfile | null {
  const span = squareSpan(cut, model.sideM);
  if (!span) return null;
  const [sStart, sEnd] = span;
  const { ne, nn, de, dn, sign } = axes(cut);
  const terrain = model.terrain ?? null;
  const groundAt = (e: number, n: number) => (terrain ? sampleTerrain(terrain, e, n, model.sideM) : 0);
  const pointAt = (s: number): [number, number] => [ne * cut.offsetM + de * s, nn * cut.offsetM + dn * s];
  const step = Math.max(1, terrain ? terrain.spacingM / 2 : (sEnd - sStart) / 4);
  const ground: [number, number][] = [];
  for (let s = sStart; s < sEnd; s += step) ground.push([s, groundAt(...pointAt(s))]);
  ground.push([sEnd, groundAt(...pointAt(sEnd))]);
  const depthOf = (e: number, n: number) => sign * (ne * e + nn * n - cut.offsetM);
  const baseOf = (ring: Ring) => {
    if (!terrain) return 0;
    let min = Infinity;
    for (const p of ring) min = Math.min(min, groundAt(p[0], p[1]));
    return Number.isFinite(min) ? min : 0;
  };

  const cutList: CutBuilding[] = [];
  const beyond: BeyondBuilding[] = [];
  for (const building of model.buildings) {
    if (building.importedMassing || building.meshDrawnBy != null || building.ring.length < 3) continue;
    const hits = ringCrossings(building.ring, cut).filter((s) => s >= sStart - 0.01 && s <= sEnd + 0.01);
    const base = baseOf(building.ring);
    const height = building.height;
    if (hits.length >= 2) {
      const spans = pairs(hits);
      const tier = building.heightTier ?? inferHeightTier(building);
      const { storeys, estimated } = storeysFor(building);
      cutList.push({
        id: building.id,
        name: building.overtureName ?? null,
        sFrom: hits[0],
        sTo: hits[hits.length - 1],
        spans,
        base,
        top: base + height,
        height,
        storeys,
        storeysEstimated: estimated,
        use: building.use,
        tier,
        sourceLabel: heightTierLabel(tier, { tier, zoneDefaultNote: building.zoneDefaultNote }),
        estimated: ESTIMATE_TIERS.has(tier) || Boolean(building.heightFromFallback),
        distanceM: (hits[0] + hits[hits.length - 1]) / 2 - sStart,
      });
      continue;
    }
    let minD = Infinity;
    let minS = Infinity;
    let maxS = -Infinity;
    for (const p of building.ring) {
      minD = Math.min(minD, depthOf(p[0], p[1]));
      const s = de * p[0] + dn * p[1];
      minS = Math.min(minS, s);
      maxS = Math.max(maxS, s);
    }
    if (minD < 0 || minD > depthM || maxS < sStart || minS > sEnd) continue;
    beyond.push({ id: building.id, sFrom: Math.max(sStart, minS), sTo: Math.min(sEnd, maxS), base, top: base + height, depth: minD });
  }
  cutList.sort((a, b) => a.sFrom - b.sFrom);
  beyond.sort((a, b) => b.depth - a.depth);

  const trees: SectionTree[] = [];
  for (const tree of model.trees) {
    const depth = depthOf(tree.at[0], tree.at[1]);
    const r = tree.crown_diameter_m / 2;
    if (depth < -r || depth > depthM) continue;
    const s = de * tree.at[0] + dn * tree.at[1];
    if (s < sStart || s > sEnd) continue;
    trees.push({ id: tree.id, s, base: groundAt(tree.at[0], tree.at[1]), height: tree.height_m, crown: tree.crown_diameter_m, depth: Math.max(0, depth) });
  }
  trees.sort((a, b) => b.depth - a.depth);

  let zMin = Infinity;
  let zMax = -Infinity;
  for (const [, z] of ground) {
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }
  for (const b of cutList) zMax = Math.max(zMax, b.top);
  for (const b of beyond) zMax = Math.max(zMax, b.top);
  for (const t of trees) zMax = Math.max(zMax, t.base + t.height);
  const measured = Boolean(terrain);
  const ahd = measured && /lidar|elvis|vicmap|ga\b|geoscience/i.test(terrain?.source ?? "");
  return {
    sStart,
    sEnd,
    lengthM: sEnd - sStart,
    ground,
    groundMeasured: measured,
    datumLabel: measured ? `m AHD · ${terrain?.source ?? "DEM"}${ahd ? "" : " DEM, approx."}` : "m · flat ground, terrain off",
    cut: cutList,
    beyond,
    trees,
    zMin,
    zMax,
  };
}

export function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

export function planLineFor(cut: Cut, sideM: number): { a: [number, number]; b: [number, number]; looking: [number, number] } | null {
  const span = squareSpan(cut, sideM);
  if (!span) return null;
  const { ne, nn, de, dn, sign } = axes(cut);
  const pad = sideM * 0.045;
  const at = (s: number): [number, number] => [ne * cut.offsetM + de * s, nn * cut.offsetM + dn * s];
  return { a: at(span[0] - pad), b: at(span[1] + pad), looking: [sign * ne, sign * nn] };
}
