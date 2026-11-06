import type { LonLat } from "../types";
import { massingCutKey } from "./massingStore";
import type { MassingBlock } from "./massingBlock";

export const MASSING_BLOCKS_STORAGE_VERSION = 1 as const;
export const MASSING_BLOCKS_KEY_PREFIX = "citycut.massingBlocks.";

export type MassingBlockStore = {
  v: typeof MASSING_BLOCKS_STORAGE_VERSION;
  cutId: string;
  blocks: MassingBlock[];
};

export function massingBlocksStorageKey(center: LonLat): string {
  return `${MASSING_BLOCKS_KEY_PREFIX}${massingCutKey(center)}`;
}

export function emptyMassingBlockStore(cutId: string): MassingBlockStore {
  return { v: MASSING_BLOCKS_STORAGE_VERSION, cutId, blocks: [] };
}

export function parseMassingBlockStore(raw: string | null, cutId: string): MassingBlockStore {
  if (!raw) return emptyMassingBlockStore(cutId);
  try {
    const data = JSON.parse(raw) as Partial<MassingBlockStore>;
    if (data.v !== MASSING_BLOCKS_STORAGE_VERSION || !Array.isArray(data.blocks)) {
      return emptyMassingBlockStore(cutId);
    }
    const blocks = data.blocks.filter(isMassingBlock);
    return { v: MASSING_BLOCKS_STORAGE_VERSION, cutId, blocks };
  } catch {
    return emptyMassingBlockStore(cutId);
  }
}

function isMassingBlock(value: unknown): value is MassingBlock {
  if (!value || typeof value !== "object") return false;
  const row = value as MassingBlock;
  if (typeof row.id !== "string" || typeof row.cutId !== "string") return false;
  if (!Array.isArray(row.centerline) || row.centerline.length !== 2) return false;
  for (const pt of row.centerline) {
    if (!Array.isArray(pt) || pt.length !== 2 || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return false;
  }
  return (
    Number.isFinite(row.width_m) &&
    Number.isFinite(row.floors) &&
    Number.isFinite(row.floorHeight_m) &&
    typeof row.flipped === "boolean"
  );
}

export function readStoredMassingBlocks(storage: Storage, cutId: string): MassingBlockStore {
  try {
    return parseMassingBlockStore(storage.getItem(`${MASSING_BLOCKS_KEY_PREFIX}${cutId}`), cutId);
  } catch {
    return emptyMassingBlockStore(cutId);
  }
}

export function writeStoredMassingBlocks(storage: Storage, store: MassingBlockStore): void {
  try {
    storage.setItem(`${MASSING_BLOCKS_KEY_PREFIX}${store.cutId}`, JSON.stringify(store));
  } catch {
  }
}
