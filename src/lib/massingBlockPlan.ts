import { openRing } from "./geo";
import { footprintFromCenterline, massingBlockHeight, type MassingBlock } from "./massingBlock";
import type { BuildingFeat, Ring } from "../types";

const DRAWN_MASSING_ID_BASE = -920_000;

function closedRing(ring: Ring): Ring {
  const open = openRing(ring);
  if (open.length < 3) return open;
  const first = open[0]!;
  const last = open[open.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return open;
  return [...open, first];
}

export function massingBlocksToBuildingFeats(blocks: readonly MassingBlock[]): BuildingFeat[] {
  const out: BuildingFeat[] = [];
  let nextId = DRAWN_MASSING_ID_BASE;
  for (const block of blocks) {
    const ring = closedRing(
      footprintFromCenterline(block.centerline, block.width_m, block.flipped) as Ring,
    );
    if (ring.length < 4) continue;
    out.push({
      id: nextId--,
      ring,
      holes: [],
      height: massingBlockHeight(block),
      use: "unclassified",
      source: "none",
      proposedMassing: true,
    });
  }
  return out;
}
