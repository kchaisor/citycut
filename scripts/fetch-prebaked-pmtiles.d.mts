export interface PrebakeOptions {
  publicDir?: string;
  release?: string;
  releasesBase?: string;
  fetchImpl?: typeof fetch;
}

export interface PrebakeResult {
  status: "skipped" | "installed" | "failed";
  bytes?: number;
  message?: string;
}

export function hasPrebakedTrees(publicDir?: string): boolean;
export function hasFullBuildingEnrichment(publicDir?: string): boolean;
export function ensurePrebakedTrees(options?: PrebakeOptions): Promise<PrebakeResult>;
export function ensureFullBuildingEnrichment(options?: PrebakeOptions): Promise<PrebakeResult>;
export function fetchPrebakedPmtiles(options?: PrebakeOptions): Promise<{
  trees: PrebakeResult;
  enrichment: PrebakeResult;
}>;
