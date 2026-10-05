import { overtureBuildingHeight } from "./overtureHeight";

export type OvertureSourceMeta = {
  microsoft: boolean;
  /** OSM way ids from `record_id` values such as `w13307317`. */
  osmWayIds: number[];
};

type SourceEntry = {
  provider?: string;
  dataset?: string;
  record_id?: string;
};

function sourceEntries(raw: unknown): SourceEntry[] {
  if (typeof raw !== "string") return [];
  try {
    const list = JSON.parse(raw) as SourceEntry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Human-readable Overture `sources` datasets for attribution and analysis. */
export function overtureSourceDatasetLabels(raw: unknown): string[] {
  const labels = new Set<string>();
  for (const entry of sourceEntries(raw)) {
    const provider = entry.provider?.trim();
    const dataset = entry.dataset?.trim();
    if (provider && dataset) labels.add(`${provider}/${dataset}`);
    else if (provider) labels.add(provider);
    else if (dataset) labels.add(dataset);
  }
  return [...labels].sort();
}

/** Footprint lineage is ML-derived (Microsoft or Google Open Buildings) with no OSM way id. */
export function overtureFootprintIsMlOnly(raw: unknown, osmWayIds: number[]): boolean {
  if (osmWayIds.length > 0) return false;
  const hay = sourceEntries(raw)
    .flatMap((entry) => [entry.provider, entry.dataset].filter(Boolean))
    .join(" ")
    .toLowerCase();
  return (
    hay.includes("microsoft") ||
    hay.includes("google") ||
    hay.includes("open buildings") ||
    hay.includes("ml building")
  );
}

function osmWayIdFromRecordId(recordId: string): number | null {
  const match = /^w(\d+)(?:@\d+)?$/i.exec(recordId.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

/** Parse Overture `sources` JSON for attribution and OSM lineage. */
export function parseOvertureSources(raw: unknown): OvertureSourceMeta {
  const list = sourceEntries(raw);
  if (list.length === 0) return { microsoft: false, osmWayIds: [] };
  try {
    const osmWayIds: number[] = [];
    let microsoft = false;
    for (const entry of list) {
      if (
        entry.provider?.toLowerCase() === "microsoft" ||
        entry.dataset?.toLowerCase().includes("microsoft")
      ) {
        microsoft = true;
      }
      if (typeof entry.record_id === "string") {
        const wayId = osmWayIdFromRecordId(entry.record_id);
        if (wayId !== null) osmWayIds.push(wayId);
      }
    }
    return { microsoft, osmWayIds: [...new Set(osmWayIds)] };
  } catch {
    return { microsoft: false, osmWayIds: [] };
  }
}

/** When tile fragments disagree, keep height metadata from the tallest part. */
export function pickTallestOvertureProps(parts: { props: Record<string, unknown> }[]): Record<string, unknown> {
  if (parts.length === 0) return {};
  let best = parts[0].props;
  let bestHeight = overtureBuildingHeight(best);
  for (const part of parts.slice(1)) {
    const height = overtureBuildingHeight(part.props);
    if (height > bestHeight) {
      bestHeight = height;
      best = part.props;
    }
  }
  return best;
}
