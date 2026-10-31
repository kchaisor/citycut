import { pointInSiteFrame, DEFAULT_SITE_FRAME_SHAPE } from "./siteFrame";
import { axoPlanDepth, type AxoSolidFace } from "./explodedAxoMassing";
import type { CityModel, Pt, TreeSizeSource } from "../types";

const COS30 = Math.sqrt(3) / 2;
const round = (v: number) => Math.round(v * 100) / 100;
const SEGMENTS = 14;

function iso(east: number, north: number, upM: number): Pt {
  return [(east - north) * COS30, (east + north) * 0.5 - upM];
}

function circlePath(cx: number, cy: number, r: number, from = 0, to = Math.PI * 2, closeVia?: Pt[]): string {
  const pts: Pt[] = [];
  const n = Math.max(3, Math.round((SEGMENTS * (to - from)) / (Math.PI * 2)));
  for (let i = 0; i <= n; i += 1) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  if (closeVia) pts.push(...closeVia);
  return `${pts.map((p, i) => `${i === 0 ? "M" : "L"}${round(p[0])} ${round(p[1])}`).join(" ")} Z`;
}

export type AxoCrownSource = "measured" | "estimate";

export function axoCrownSource(source: TreeSizeSource | undefined): AxoCrownSource {
  return source === "com" || source === "vicmap" || source === "osm" ? "measured" : "estimate";
}

export function buildAxoCanopyFaces(
  model: CityModel,
): { faces: AxoSolidFace[]; counts: Record<AxoCrownSource, number> } {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const counts: Record<AxoCrownSource, number> = { measured: 0, estimate: 0 };
  const trees = model.trees
    .filter((tree) => pointInSiteFrame(tree.at, model.sideM, shape))
    .sort((a, b) => axoPlanDepth(a.at[0], a.at[1]) - axoPlanDepth(b.at[0], b.at[1]));
  const faces: AxoSolidFace[] = [];
  for (const tree of trees) {
    counts[axoCrownSource(tree.sizeSource)] += 1;
    const r = Math.max(0.6, tree.crown_diameter_m / 2);
    const height = Math.max(r * 2, tree.height_m || r * 2);
    const centreUp = height - r;
    const [bx, by] = iso(tree.at[0], tree.at[1], 0);
    const [cx, cy] = iso(tree.at[0], tree.at[1], centreUp);
    const trunkHalf = Math.max(0.15, (tree.trunk_diameter_m || 0.3) / 2);
    if (centreUp > r * 0.2) {
      faces.push({
        d: `M${round(bx - trunkHalf)} ${round(by)} L${round(bx + trunkHalf)} ${round(by)} L${round(cx + trunkHalf)} ${round(cy)} L${round(cx - trunkHalf)} ${round(cy)} Z`,
        paint: "tree-trunk",
      });
    }
    faces.push({ d: circlePath(cx, cy, r), paint: "tree-canopy" });
    const shadeArc: Pt[] = [];
    for (let i = SEGMENTS / 2; i >= 0; i -= 1) {
      const a = Math.PI * 0.25 + (Math.PI * i) / SEGMENTS;
      shadeArc.push([cx + Math.cos(a) * r * 0.78 - r * 0.12, cy + Math.sin(a) * r * 0.78 - r * 0.12]);
    }
    faces.push({ d: circlePath(cx, cy, r, Math.PI * 0.25, Math.PI * 1.25, shadeArc), paint: "tree-canopy-shade" });
  }
  return { faces, counts };
}

export function axoCanopyNote(counts: Record<AxoCrownSource, number>): string {
  const parts: string[] = [];
  if (counts.measured) parts.push(`measured ${counts.measured}`);
  if (counts.estimate) parts.push(`species/default estimate ${counts.estimate}`);
  return parts.length ? `Crowns: ${parts.join(" · ")}` : "";
}
